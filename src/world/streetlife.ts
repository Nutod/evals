import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import map from './map-data.json';
import { routePoint, seededRandom } from './geo';
import { LANDMARKS } from './landmark-data';
import { material } from './primitives';

type Point = readonly [number, number];
type Route = readonly Point[];
type Stamp = { matrix: THREE.Matrix4; root?: THREE.Object3D; color?: THREE.Color };
type Batch = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  stamps: Stamp[];
  mesh?: THREE.InstancedMesh;
};
const UP = new THREE.Vector3(0, 1, 0);
const SURFACE = { plaza: 0.02, road: 0.09, railDeck: 8.6 };
const BOARD = { minX: -930, maxX: 630, minZ: -575, maxZ: 625 };
const TRAM_RAIL_RADIUS = 0.045;
const TRAM_RAIL_Y = SURFACE.road + 0.02;
const TRAM_ROOT_Y = TRAM_RAIL_Y + TRAM_RAIL_RADIUS - (0.39 - 0.35);
const CONTACT_WIRE_Y = TRAM_ROOT_Y + 5.07;
const TRAIN_RAIL_Y = 8.8;
const TRAIN_RAIL_RADIUS = 0.065;

function fitsBoard(x: number, z: number, angle: number, halfWidth: number, halfLength: number) {
  const dx = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfLength,
    dz = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfLength;
  return x - dx >= BOARD.minX && x + dx <= BOARD.maxX && z - dz >= BOARD.minZ && z + dz <= BOARD.maxZ;
}

function clipRail(a: Point, b: Point, radius: number): [Point, Point] | undefined {
  let enter = 0,
    exit = 1;
  for (const [axis, min, max] of [
    [0, BOARD.minX + radius, BOARD.maxX - radius],
    [1, BOARD.minZ + radius, BOARD.maxZ - radius],
  ]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return;
      continue;
    }
    const t0 = (min - a[axis]) / delta,
      t1 = (max - a[axis]) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter >= exit) return;
  }
  const point = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [point(enter), point(exit)];
}

// Projected OSM tram alignments, including the bend around the station's east entrance.
const tramRoute: Route = [
  [-582, 187],
  [-550, 189],
  [-481.8, 133.8],
  [-348.1, 23.3],
  [-299.1, -17.2],
  [-281.9, -30.4],
  [-267.5, -35],
  [-260.8, -34.8],
  [-249.4, -31],
  [-242, -24.8],
  [-222.8, 0],
  [-191, 33.2],
  [-170.8, 54.4],
  [-114.4, 113.3],
  [-101.4, 126.5],
  [-96, 129.9],
  [-91, 131.8],
  [-86.2, 132.6],
  [-80.8, 132.7],
  [-73.6, 131.1],
  [-68, 128],
  [-40.2, 105.8],
  [-13.4, 84.3],
  [48.3, 33.5],
  [63.6, 20.5],
  [71.2, 12.1],
  [77.1, 4.6],
  [103.8, -29.4],
  [135, -70.4],
  [161.6, -105.8],
  [214.8, -176.7],
  [285.6, -268.5],
  [294.5, -277.5],
  [308.4, -281.6],
  [320, -279.9],
  [342.7, -265.8],
  [357.1, -260.2],
  [370.8, -260.5],
  [382.3, -265.8],
  [405, -295.9],
  [432.6, -337.4],
  [479.2, -406],
];
const northTramRoute: Route = [
  [106.8, -476.7],
  [-33.9, -287.8],
  [-83.8, -221.9],
  [-112.4, -189.4],
  [-190.3, -107.6],
  [-197.7, -98.1],
  [-201.3, -88.9],
  [-201.7, -84.9],
  [-201.6, -79.8],
  [-199.4, -72.4],
  [-192, -61.9],
  [-164.2, -36.3],
  [-142.7, -14.7],
  [-117.8, 11.6],
  [-99, 30.5],
  [-57.9, 73.9],
  [-50.5, 80.4],
  [-41.8, 85.5],
  [-35.1, 87.2],
  [-24.7, 85.8],
  [-14.8, 80.7],
];
const carRoutes: Route[] = [
  [
    [-639, 280],
    [-568, 221],
    [-513, 173],
    [-395, 74],
    [-303, -1],
    [-250, -46],
    [-203, -83],
    [-150, -141],
    [-113, -176],
    [-71, -222],
    [-32, -277],
    [95, -444],
  ],
  [
    [-55, -216],
    [-6, -179],
    [52, -134],
    [108, -91],
    [148, -60],
    [208, -15],
    [196, 3],
    [165, 50],
    [131, 103],
    [139, 135],
    [176, 185],
    [219, 244],
    [263, 291],
    [297, 389],
    [328, 504],
  ],
  [
    [-230, 412],
    [-139, 339],
    [-57, 276],
    [-15, 257],
    [59, 186],
    [99, 148],
    [124, 114],
  ],
];

class Instances {
  private batches = new Map<string, Batch>();
  private transform = new THREE.Object3D();
  private matrix = new THREE.Matrix4();
  constructor(
    private group: THREE.Group,
    private dynamic = false,
  ) {}
  add(
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: THREE.Vector3Tuple,
    scale: THREE.Vector3Tuple,
    rotation: THREE.Vector3Tuple = [0, 0, 0],
    root?: THREE.Object3D,
    color?: THREE.ColorRepresentation,
  ) {
    const key = `${geometry.uuid}/${mat.uuid}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { geometry, material: mat, stamps: [] };
      this.batches.set(key, batch);
    }
    this.transform.position.set(...position);
    this.transform.scale.set(...scale);
    this.transform.rotation.set(...rotation);
    this.transform.updateMatrix();
    batch.stamps.push({
      matrix: this.transform.matrix.clone(),
      root,
      color: color === undefined ? undefined : new THREE.Color(color),
    });
  }
  line(
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    a: THREE.Vector3Tuple,
    b: THREE.Vector3Tuple,
    radius: number,
    root?: THREE.Object3D,
  ) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      delta = end.clone().sub(start);
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(UP, delta.clone().normalize()),
    );
    this.add(
      geometry,
      mat,
      start.add(end).multiplyScalar(0.5).toArray(),
      [radius, delta.length(), radius],
      [rotation.x, rotation.y, rotation.z],
      root,
    );
  }
  finish() {
    for (const batch of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.stamps.length);
      mesh.name = `${this.group.name} / ${batch.material.name || batch.material.type}`;
      mesh.castShadow =
        !this.dynamic && !(batch.material instanceof THREE.MeshBasicMaterial) && !batch.material.transparent;
      mesh.receiveShadow = true;
      mesh.frustumCulled = !this.dynamic;
      if (this.dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.mesh = mesh;
      batch.stamps.forEach((stamp, i) => mesh.setColorAt(i, stamp.color ?? new THREE.Color('white')));
      this.group.add(mesh);
    }
    this.update();
    if (!this.dynamic) for (const batch of this.batches.values()) batch.mesh!.computeBoundingSphere();
  }
  update() {
    for (const batch of this.batches.values()) {
      batch.stamps.forEach((stamp, i) => {
        const matrix = stamp.root
          ? this.matrix.multiplyMatrices(stamp.root.matrix, stamp.matrix)
          : stamp.matrix;
        batch.mesh!.setMatrixAt(i, matrix);
      });
      batch.mesh!.instanceMatrix.needsUpdate = true;
    }
  }
}

function length(points: Route) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
}

function offsetRoute(points: Route, offset: number): Point[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return [p[0] + Math.cos(angle) * offset, p[1] - Math.sin(angle) * offset];
  });
}

function connectedRailways(): Point[][] {
  const remaining = map.rail.map((line) => line.map((p) => [p[0], p[1]] as Point)),
    routes: Point[][] = [];
  const matches = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1;
  while (remaining.length) {
    const first = remaining.reduce(
      (best, line, i) =>
        Math.min(line[0][0], line.at(-1)![0]) < Math.min(remaining[best][0][0], remaining[best].at(-1)![0])
          ? i
          : best,
      0,
    );
    const route = remaining.splice(first, 1)[0];
    if (route[0][0] > route.at(-1)![0]) route.reverse();
    let next = remaining.findIndex(
      (line) => matches(route.at(-1)!, line[0]) || matches(route.at(-1)!, line.at(-1)!),
    );
    while (next !== -1) {
      const line = remaining.splice(next, 1)[0];
      if (!matches(route.at(-1)!, line[0])) line.reverse();
      route.push(...line.slice(1));
      next = remaining.findIndex(
        (line) => matches(route.at(-1)!, line[0]) || matches(route.at(-1)!, line.at(-1)!),
      );
    }
    routes.push(route);
  }
  return routes;
}

function segmentDistance(x: number, z: number, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

const footprints = map.buildings.map(({ points }) => ({
  points,
  minX: Math.min(...points.map((p) => p[0])),
  maxX: Math.max(...points.map((p) => p[0])),
  minZ: Math.min(...points.map((p) => p[1])),
  maxZ: Math.max(...points.map((p) => p[1])),
}));
function clearOfBuildings(x: number, z: number, margin = 1) {
  return !footprints.some(({ points, minX, maxX, minZ, maxZ }) => {
    if (x < minX - margin || x > maxX + margin || z < minZ - margin || z > maxZ + margin) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (segmentDistance(x, z, a, b) < margin) return true;
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  });
}

function signage() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const labels = [
    'BVG',
    'M4  Falkenberg',
    'S7  Potsdam Hbf',
    'H',
    'U',
    'S',
    'Alexanderplatz',
    'M5  Hauptbahnhof',
  ];
  const backgrounds = [
    '#f8c800',
    '#101b1c',
    '#101b1c',
    '#f5d535',
    '#126bb0',
    '#12844d',
    '#25416b',
    '#101b1c',
  ];
  const geometries = labels.map((label, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 256;
    ctx.fillStyle = backgrounds[i];
    if (i === 3 || i === 5) {
      ctx.beginPath();
      ctx.arc(x + 128, y + 128, 124, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(x, y, 256, 256);
    ctx.fillStyle = i === 0 ? '#202322' : i === 3 ? '#14663d' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${i >= 3 && i <= 5 ? 190 : i === 0 ? 100 : 145}px sans-serif`;
    ctx.fillText(label, x + 128, y + 134, 244);
    const geometry = new THREE.PlaneGeometry(1, 1),
      uv = geometry.getAttribute('uv');
    for (let n = 0; n < uv.count; n++)
      uv.setXY(
        n,
        ((i % 4) + 0.012 + uv.getX(n) * 0.976) / 4,
        1 - (Math.floor(i / 4) + 0.012 + (1 - uv.getY(n)) * 0.976) / 2,
      );
    return geometry;
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: 'white',
    emissiveIntensity: 0.15,
    roughness: 0.7,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });
  return { geometries, mat };
}

export function createStreetLife(): {
  group: THREE.Group;
  traffic: THREE.Group;
  vegetation: THREE.Group;
  update: (time: number) => void;
  setNight: (value: number) => void;
} {
  const group = new THREE.Group(),
    traffic = new THREE.Group(),
    vegetation = new THREE.Group(),
    furniture = new THREE.Group();
  group.name = 'Street life';
  traffic.name = 'Traffic and pedestrians';
  vegetation.name = 'Trees';
  furniture.name = 'Street furniture and tram tracks';
  group.add(traffic, vegetation, furniture);
  const moving = new Instances(traffic, true),
    planting = new Instances(vegetation),
    street = new Instances(furniture);
  const cube = new THREE.BoxGeometry(1, 1, 1),
    rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const round = new THREE.SphereGeometry(1, 10, 7),
    pole = new THREE.CylinderGeometry(1, 1, 1, 8),
    trunk = new THREE.CylinderGeometry(0.58, 1, 1, 7);
  const disk = new THREE.CircleGeometry(1, 20),
    signs = signage(),
    random = seededRandom(5782);
  const yellow = material('#f7c51d', 0.48, 0.15),
    red = material('#a33132', 0.57, 0.12),
    cream = material('#e4c65d', 0.58, 0.1);
  const metal = material('#737c7d', 0.45, 0.65),
    dark = material('#263235', 0.7, 0.25),
    rubber = material('#202426'),
    wood = material('#977557');
  const white = material('#ffffff', 0.76),
    bark = material('#75614c'),
    leaf = material('#ffffff', 0.95),
    concrete = material('#a9aaa1');
  const glass = new THREE.MeshStandardMaterial({
    color: '#203c46',
    roughness: 0.23,
    metalness: 0.38,
    emissive: '#5e8d9b',
    emissiveIntensity: 0.02,
  });
  const shelterGlass = new THREE.MeshStandardMaterial({
    color: '#9cb4b9',
    transparent: true,
    opacity: 0.32,
    roughness: 0.23,
    metalness: 0.1,
    depthWrite: false,
  });
  const headlights = new THREE.MeshStandardMaterial({
    color: '#fff0cc',
    emissive: '#fff0cc',
    emissiveIntensity: 0.1,
  });
  const taillights = new THREE.MeshStandardMaterial({
    color: '#b8271d',
    emissive: '#ff321d',
    emissiveIntensity: 0.1,
  });
  const lamplight = new THREE.MeshStandardMaterial({
    color: '#f4e8cb',
    emissive: '#ffe0a2',
    emissiveIntensity: 0.03,
  });
  const pool = new THREE.MeshBasicMaterial({
    color: '#ffe3a5',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const animations: ((time: number) => void)[] = [];
  const paint = (
    batch: Instances,
    mat: THREE.Material,
    p: THREE.Vector3Tuple,
    s: THREE.Vector3Tuple,
    root?: THREE.Object3D,
    color?: THREE.ColorRepresentation,
    bevel = false,
  ) => batch.add(bevel ? rounded : cube, mat, p, s, [0, 0, 0], root, color);
  const label = (
    batch: Instances,
    tile: number,
    p: THREE.Vector3Tuple,
    s: [number, number],
    rotation = 0,
    root?: THREE.Object3D,
  ) => batch.add(signs.geometries[tile], signs.mat, p, [s[0], s[1], 1], [0, rotation, 0], root);
  const groundRoot = (x: number, z: number, y = SURFACE.plaza, rotation = 0) => {
    const root = new THREE.Object3D();
    root.position.set(x, y, z);
    root.rotation.y = rotation;
    root.updateMatrix();
    return root;
  };
  const rails = (route: Route, y: number, radius: number) => {
    for (const offset of [-0.7175, 0.7175]) {
      const rail = offsetRoute(route, offset);
      for (let i = 1; i < rail.length; i++) {
        const segment = clipRail(rail[i - 1], rail[i], radius);
        if (segment)
          street.line(
            pole,
            metal,
            [segment[0][0], y, segment[0][1]],
            [segment[1][0], y, segment[1][1]],
            radius,
          );
      }
    }
  };

  let treeCount = 0;
  map.trees.forEach(([x, z], i) => {
    if ((Math.hypot(x, z) > 600 && i % 2) || !clearOfBuildings(x, z, 1.2)) return;
    const height = 8 + random() * 6,
      crown = 2.8 + random() * 1.7,
      turn = random() * Math.PI * 2;
    planting.add(
      trunk,
      bark,
      [x, height * 0.28, z],
      [0.24 + height * 0.012, height * 0.56, 0.24 + height * 0.012],
    );
    for (let branch = 0; branch < 3; branch++) {
      const angle = turn + branch * 2.094,
        dx = Math.cos(angle) * crown * 0.52,
        dz = Math.sin(angle) * crown * 0.52;
      planting.line(trunk, bark, [x, height * 0.38, z], [x + dx, height * 0.7, z + dz], 0.14);
      planting.add(
        round,
        leaf,
        [x + dx, height * (0.67 + branch * 0.025), z + dz],
        [crown * 0.83, crown * 0.9, crown * 0.83],
        [0, angle, 0],
        undefined,
        ['#55794c', '#6e8b54', '#87995e'][(i + branch) % 3],
      );
    }
    planting.add(
      round,
      leaf,
      [x, height * 0.83, z],
      [crown * 0.78, crown * 0.73, crown * 0.8],
      [0, turn, 0],
      undefined,
      '#6e8b54',
    );
    if (Math.hypot(x, z) < 180) {
      const grateTop = SURFACE.plaza + 0.01;
      planting.add(pole, dark, [x, grateTop - 0.05, z], [0.85, 0.1, 0.85]);
      for (let bar = -2; bar <= 2; bar++)
        paint(planting, metal, [x + bar * 0.23, grateTop - 0.0125, z], [0.035, 0.025, 1.45]);
    }
    treeCount++;
  });
  vegetation.userData.treeCount = treeCount;

  function drive(
    route: Route,
    count: number,
    spacing: number,
    speed: number,
    phase: number,
    y: number,
    footprint?: readonly [number, number],
  ) {
    const roots = Array.from({ length: count }, () => new THREE.Object3D()),
      total = length(route),
      extent = (count - 1) * spacing + 6;
    animations.push((time) => {
      const head =
        (((time * speed + phase) % (total + extent + 50)) + total + extent + 50) % (total + extent + 50);
      roots.forEach((root, i) => {
        const distance = THREE.MathUtils.clamp(head - i * spacing, 2, total - 2);
        const p = routePoint(route, distance),
          front = routePoint(route, distance + 1.8),
          rear = routePoint(route, distance - 1.8);
        root.position.set(p.x, y, p.z);
        root.rotation.y = Math.atan2(front.x - rear.x, front.z - rear.z);
      });
      const visible =
        head > extent &&
        head < total - 5 &&
        (!footprint ||
          roots.every((root) =>
            fitsBoard(root.position.x, root.position.z, root.rotation.y, footprint[0], footprint[1]),
          ));
      roots.forEach((root) => {
        root.scale.setScalar(visible ? 1 : 0);
        root.updateMatrix();
      });
    });
    return roots;
  }

  function tram(route: Route, phase: number, tile: number) {
    drive(route, 7, 5.65, 5.1, phase, TRAM_ROOT_Y, [1.7, 3.1]).forEach((root, i) => {
      paint(moving, yellow, [0, 1.3, 0], [2.4, 1.75, 5.25], root, undefined, true);
      paint(moving, dark, [0, 0.53, 0], [2.15, 0.42, 5.15], root);
      paint(moving, glass, [0, 2.22, 0], [2.42, 1.05, 5.05], root, undefined, true);
      paint(moving, yellow, [0, 2.87, 0], [2.42, 0.28, 5.2], root);
      paint(moving, metal, [0, 3.1, 0], [2.18, 0.2, 4.9], root, undefined, true);
      paint(moving, dark, [0, 3.3, 0], [1.4, 0.25, 2.2], root, undefined, true);
      for (const side of [-1, 1]) {
        for (const z of [-2.1, -0.55, 1.6])
          paint(moving, yellow, [side * 1.23, 2.21, z], [0.06, 1.08, 0.1], root);
        paint(moving, dark, [side * 1.235, 1.72, 0.55], [0.045, 2.1, 1.14], root);
        for (const z of [0.28, 0.83]) {
          paint(moving, yellow, [side * 1.27, 1.25, z], [0.035, 1.05, 0.48], root);
          paint(moving, glass, [side * 1.27, 2.23, z], [0.035, 0.84, 0.48], root);
        }
        paint(moving, metal, [side * 1.27, 0.48, 0.55], [0.12, 0.07, 1.2], root);
        if (i % 2 === 0)
          for (const z of [-1.55, 1.55])
            moving.add(pole, rubber, [side * 1.02, 0.39, z], [0.35, 0.19, 0.35], [0, 0, Math.PI / 2], root);
        if (i === 1 || i === 5)
          label(moving, 0, [side * 1.25, 1.12, -1.3], [0.7, 0.4], (side * Math.PI) / 2, root);
      }
      if (i < 6)
        for (let rib = 0; rib < 6; rib++)
          paint(moving, rib % 2 ? metal : rubber, [0, 1.92, -2.99 + rib * 0.067], [2.22, 2.4, 0.07], root);
      if (i === 0 || i === 6) {
        const end = i === 0 ? 1 : -1;
        paint(moving, yellow, [0, 1.05, end * 2.58], [2.27, 1.15, 0.35], root, undefined, true);
        paint(moving, glass, [0, 2.22, end * 2.64], [2.1, 1.09, 0.12], root, undefined, true);
        label(moving, tile, [0, 2.7, end * 2.715], [1.78, 0.29], end < 0 ? Math.PI : 0, root);
        for (const x of [-0.8, 0.8])
          paint(moving, i === 0 ? headlights : taillights, [x, 1.07, end * 2.78], [0.34, 0.17, 0.055], root);
        paint(moving, dark, [0, 0.57, end * 2.8], [1.7, 0.15, 0.13], root);
        moving.line(pole, metal, [-0.7, 1.8, end * 2.72], [0.28, 2.06, end * 2.72], 0.025, root);
      }
      if (i === 3) {
        for (const x of [-0.48, 0.48]) {
          moving.line(pole, dark, [x, 3.35, -0.85], [x, 4.15, 0.35], 0.045, root);
          moving.line(pole, dark, [x, 4.15, 0.35], [x, 5.05, -0.3], 0.045, root);
        }
        paint(moving, metal, [0, 5.07, -0.3], [1.65, 0.065, 0.13], root);
      }
    });
  }
  const returnTram = offsetRoute(tramRoute, 3.7).reverse();
  tram(tramRoute, 540, 1);
  tram(returnTram, 710, 7);
  tram(northTramRoute, 320, 7);

  const trainRoutes = connectedRailways()
    .slice(0, 2)
    .map((route, i) => (i ? route.reverse() : route));
  trainRoutes.forEach((route, track) =>
    drive(route, 4, 18.4, 12.5, track ? 720 : 650, TRAIN_RAIL_Y + TRAIN_RAIL_RADIUS, [1.6, 9.5]).forEach(
      (root, i) => {
        paint(moving, red, [0, 1.45, 0], [2.95, 1.65, 17.6], root, undefined, true);
        paint(moving, cream, [0, 2.7, 0], [2.96, 1.15, 17.5], root, undefined, true);
        paint(moving, metal, [0, 3.51, 0], [2.9, 0.5, 17.35], root, undefined, true);
        paint(moving, dark, [0, 0.54, 0], [2.5, 0.45, 16.5], root);
        for (const side of [-1, 1]) {
          for (let w = -7; w <= 7; w += 2)
            paint(moving, glass, [side * 1.493, 2.66, w], [0.035, 0.81, 1.52], root, undefined, true);
          for (const z of [-5.1, 0, 5.1]) {
            paint(moving, dark, [side * 1.51, 1.97, z], [0.045, 2.2, 1.4], root);
            paint(moving, cream, [side * 1.54, 1.49, z], [0.04, 1.13, 1.28], root);
            paint(moving, metal, [side * 1.57, 1.95, z], [0.04, 2.1, 0.045], root);
          }
          for (const z of [-6.5, -5, 5, 6.5])
            moving.add(pole, rubber, [side * 1.18, 0.39, z], [0.39, 0.22, 0.39], [0, 0, Math.PI / 2], root);
          label(moving, 5, [side * 1.56, 1.49, 7], [0.55, 0.55], (side * Math.PI) / 2, root);
        }
        paint(moving, rubber, [0, 1.9, -9.1], [1.9, 2.4, 0.8], root);
        if (i === 0 || i === 3) {
          const end = i === 0 ? 1 : -1;
          paint(moving, glass, [0, 2.65, end * 8.84], [2.5, 0.94, 0.08], root);
          label(moving, 2, [0, 3.22, end * 8.9], [2.2, 0.27], end < 0 ? Math.PI : 0, root);
          for (const x of [-0.98, 0.98])
            paint(moving, i === 0 ? headlights : taillights, [x, 1.28, end * 8.91], [0.28, 0.25, 0.07], root);
        }
      },
    ),
  );

  const carRootY = SURFACE.road - (0.36 - 0.34);
  const carColors = ['#e4e0ce', '#586b76', '#323d43', '#a95743', '#72877d', '#b8babb', '#224865'];
  function car(root: THREE.Object3D, index: number) {
    const color = carColors[index % carColors.length],
      van = index % 9 === 0,
      height = van ? 1.45 : 1;
    paint(moving, white, [0, 0.69, 0], [1.82, 0.69, 4.3], root, color, true);
    paint(moving, glass, [0, 1.21, -0.2], [1.63, height * 0.7, van ? 2.9 : 2.35], root, undefined, true);
    paint(moving, white, [0, 1.25 + height * 0.36, -0.2], [1.66, 0.12, van ? 3 : 2.42], root, color, true);
    for (const side of [-1, 1]) {
      paint(moving, white, [side * 0.83, 1.21, -0.3], [0.06, height * 0.76, 0.13], root, color);
      paint(moving, dark, [side * 0.99, 1.1, 0.7], [0.22, 0.12, 0.23], root);
      for (const z of [-1.36, 1.36]) {
        moving.add(pole, rubber, [side * 0.84, 0.36, z], [0.34, 0.23, 0.34], [0, 0, Math.PI / 2], root);
        moving.add(pole, metal, [side * 0.97, 0.36, z], [0.18, 0.025, 0.18], [0, 0, Math.PI / 2], root);
      }
    }
    for (const x of [-0.62, 0.62]) {
      paint(moving, headlights, [x, 0.76, 2.16], [0.42, 0.19, 0.04], root);
      paint(moving, taillights, [x, 0.76, -2.16], [0.36, 0.19, 0.04], root);
    }
    paint(moving, dark, [0, 0.53, 2.17], [0.6, 0.19, 0.035], root);
  }
  let carCount = 0;
  carRoutes.forEach((route, r) => {
    for (let i = 0; i < 9; i++)
      car(drive(route, 1, 0, 6.6 + r * 0.9, 60 + (i * length(route)) / 9, carRootY)[0], carCount++);
  });
  const parking: Route = [
    [-538, -174.5],
    [-504.5, -178.6],
    [-468.6, -179.4],
    [-425.6, -173.8],
    [-397.5, -166.7],
    [-346.6, -146.7],
    [-316.4, -129.5],
  ];
  for (let d = 12; d < length(parking) - 12; d += 11) {
    const p = routePoint(parking, d),
      x = p.x + Math.cos(p.angle) * 4.2,
      z = p.z - Math.sin(p.angle) * 4.2;
    if (!clearOfBuildings(x, z, 1.8)) continue;
    const root = new THREE.Object3D();
    root.position.set(x, carRootY, z);
    root.rotation.y = p.angle;
    root.updateMatrix();
    car(root, carCount++);
  }

  function walkable(x: number, z: number) {
    return (
      clearOfBuildings(x, z, 1.2) &&
      ![tramRoute, returnTram, northTramRoute].some((route) =>
        route.slice(1).some((p, i) => segmentDistance(x, z, route[i], p) < 3.2),
      ) &&
      !LANDMARKS.some(
        (place) =>
          Math.hypot(x - place.position[0], z - place.position[1]) <
          (place.id === 'tower' ? 39 : place.id === 'clock' ? 7 : 6),
      )
    );
  }
  let pedestrianCount = 0;
  for (let attempt = 0; attempt < 2200 && pedestrianCount < 330; attempt++) {
    const plaza = pedestrianCount < 220,
      x = plaza ? -85 + random() * 180 : -485 + random() * 300,
      z = plaza ? -40 + random() * 141 : 65 + random() * 209;
    const dx = (random() - 0.5) * 22,
      dz = (random() - 0.5) * 22;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz)));
    if (
      Array.from({ length: steps + 1 }, (_, j) => walkable(x + (dx * j) / steps, z + (dz * j) / steps)).some(
        (clear) => !clear,
      )
    )
      continue;
    const route: Route = [
        [x, z],
        [x + dx, z + dz],
        [x, z],
      ],
      root = new THREE.Object3D(),
      height = 0.88 + random() * 0.24;
    const color = ['#38585b', '#c09b76', '#783d3d', '#485467', '#bcad92', '#303738', '#677759'][
      pedestrianCount % 7
    ];
    const skin = ['#d9ac87', '#b47e5b', '#936146', '#e6bea1'][pedestrianCount % 4],
      phase = random() * length(route),
      speed = pedestrianCount % 6 ? 0.5 + random() * 0.5 : 0;
    paint(moving, white, [0, 1.08, 0], [0.43, 0.63, 0.27], root, color, true);
    moving.add(round, white, [0, 1.57, 0], [0.17, 0.21, 0.17], [0, 0, 0], root, skin);
    paint(moving, dark, [0, 1.76, -0.015], [0.27, 0.065, 0.25], root, undefined, true);
    for (const side of [-1, 1]) {
      moving.add(
        pole,
        white,
        [side * 0.27, 1.02, 0],
        [0.065, 0.56, 0.065],
        [side * 0.14, 0, side * 0.12],
        root,
        color,
      );
      paint(moving, dark, [side * 0.115, 0.45, side * 0.045], [0.16, 0.66, 0.17], root, undefined, true);
      paint(moving, rubber, [side * 0.115, 0.13, 0.07 + side * 0.045], [0.17, 0.13, 0.29], root);
    }
    if (pedestrianCount % 4 === 0)
      paint(moving, white, [0, 1.12, -0.23], [0.32, 0.39, 0.17], root, '#85714d', true);
    animations.push((time) => {
      const p = routePoint(route, time * speed + phase);
      root.position.set(p.x, SURFACE.plaza - (0.13 - 0.13 / 2) * height, p.z);
      root.rotation.y = p.angle;
      root.scale.setScalar(height);
      root.updateMatrix();
    });
    pedestrianCount++;
  }
  traffic.userData = {
    trams: 3,
    trains: trainRoutes.length,
    cars: carCount,
    pedestrians: pedestrianCount,
    trackHeight: TRAIN_RAIL_Y,
  };

  for (const route of [tramRoute, returnTram, northTramRoute]) {
    rails(route, TRAM_RAIL_Y, TRAM_RAIL_RADIUS);
    for (let d = 16; d < length(route) - 10; d += 44) {
      const p = routePoint(route, d),
        dx = Math.cos(p.angle),
        dz = -Math.sin(p.angle);
      const x = p.x + dx * 3.6,
        z = p.z + dz * 3.6;
      if (!clearOfBuildings(x, z, 0.5)) continue;
      street.add(pole, dark, [x, SURFACE.road + 3.1, z], [0.085, 6.2, 0.085]);
      street.line(
        pole,
        metal,
        [x, CONTACT_WIRE_Y + 0.2, z],
        [p.x - dx, CONTACT_WIRE_Y + 0.2, p.z - dz],
        0.045,
      );
    }
    for (let i = 1; i < route.length; i++)
      street.line(
        pole,
        dark,
        [route[i - 1][0], CONTACT_WIRE_Y, route[i - 1][1]],
        [route[i][0], CONTACT_WIRE_Y, route[i][1]],
        0.018,
      );
  }
  const stationPosition = LANDMARKS.find((place) => place.id === 'station')!.position;
  const sleeperHeight = TRAIN_RAIL_Y - TRAIN_RAIL_RADIUS - SURFACE.railDeck;
  for (const route of trainRoutes) {
    rails(route, TRAIN_RAIL_Y, TRAIN_RAIL_RADIUS);
    for (let d = 0.625; d < length(route); d += 1.25) {
      const p = routePoint(route, d),
        dx = p.x - stationPosition[0],
        dz = p.z - stationPosition[1],
        localX = dx * Math.cos(0.76) - dz * Math.sin(0.76),
        localZ = dx * Math.sin(0.76) + dz * Math.cos(0.76);
      // The station already supplies its own track beds between the platforms.
      if (Math.abs(localX) < 24.5 && Math.abs(localZ) < 152) continue;
      if (!fitsBoard(p.x, p.z, p.angle, 1.175, 0.11)) continue;
      street.add(
        cube,
        wood,
        [p.x, SURFACE.railDeck + sleeperHeight / 2, p.z],
        [2.35, sleeperHeight, 0.22],
        [0, p.angle, 0],
      );
    }
  }

  function bench(x: number, z: number, rotation: number) {
    if (!clearOfBuildings(x, z, 2.2)) return;
    const root = groundRoot(x, z, SURFACE.plaza, rotation);
    for (const side of [-1, 1]) {
      paint(street, dark, [side * 0.9, 0.3, 0], [0.12, 0.6, 0.62], root);
      paint(street, dark, [side * 1.05, 0.75, -0.06], [0.08, 0.08, 0.7], root);
    }
    for (let slat = 0; slat < 4; slat++) {
      paint(street, wood, [0, 0.57, -0.25 + slat * 0.16], [2.45, 0.09, 0.12], root);
      paint(street, wood, [0, 0.78 + slat * 0.13, -0.32], [2.45, 0.09, 0.085], root);
    }
  }
  const seats: Point[] = [
    [62, 65],
    [68, 3],
    [-14, 10],
    [-43, -27],
    [20, -26],
    [-34, 80],
    [-315, 195],
    [-347, 224],
    [-407, 229],
    [-277, 215],
    [-223, 175],
    [-458, 93],
    [-335, 67],
    [-23, 20],
    [78, 70],
    [43, -13],
    [-302, 252],
    [-441, 214],
  ];
  seats.forEach(([x, z], i) => {
    bench(x, z, i * 0.8);
    bench(x + 5, z + 3, i * 0.8);
  });
  function lamp(x: number, z: number, ground = SURFACE.plaza) {
    if (!clearOfBuildings(x, z, 1)) return;
    const root = groundRoot(x, z, ground);
    street.add(pole, dark, [0, 4, 0], [0.095, 8, 0.095], [0, 0, 0], root);
    street.add(pole, metal, [0, 0.3, 0], [0.17, 0.6, 0.17], [0, 0, 0], root);
    for (const side of [-1, 1]) {
      street.line(pole, dark, [0, 7.9, 0], [side * 1.6, 8.4, 0], 0.065, root);
      paint(street, dark, [side * 1.6, 8.43, 0], [1.2, 0.18, 0.5], root, undefined, true);
      paint(street, lamplight, [side * 1.6, 8.32, 0], [1.02, 0.04, 0.4], root);
    }
    street.add(disk, pool, [x, ground + 0.015, z], [4.4, 4.4, 1], [-Math.PI / 2, 0, 0]);
  }
  for (const route of carRoutes.slice(0, 2))
    for (let d = 30; d < length(route); d += 57) {
      const p = routePoint(route, d);
      lamp(p.x + Math.cos(p.angle) * 8, p.z - Math.sin(p.angle) * 8, SURFACE.road);
    }
  for (const [x, z] of seats) lamp(x - 3, z + 4);
  for (const [x, z, tile] of [
    [49, 49, 4],
    [-10, 14, 4],
    [90, -4, 4],
    [-27, -10, 4],
    [-111, 98, 5],
    [-186, 12, 5],
  ]) {
    if (!clearOfBuildings(x, z, 1)) continue;
    const root = groundRoot(x, z);
    street.add(pole, metal, [0, 2.1, 0], [0.075, 4.2, 0.075], [0, 0, 0], root);
    if (tile === 5) street.add(disk, metal, [0, 4.15, 0], [0.74, 0.74, 1], [0, 0, 0], root);
    else paint(street, metal, [0, 4.15, 0], [1.42, 1.42, 0.1], root);
    for (const side of [-1, 1])
      label(street, tile, [0, 4.15, side * 0.06], [1.36, 1.36], side < 0 ? Math.PI : 0, root);
    label(street, 6, [0, 3.12, 0.07], [2.6, 0.42], 0, root);
  }
  for (const [x, z, rotation] of [
    [26, 58, -0.89],
    [-146, 89, 0.77],
    [-137, -33, 0.76],
  ]) {
    if (!clearOfBuildings(x, z, 3)) continue;
    const root = groundRoot(x, z, SURFACE.plaza, rotation);
    paint(street, concrete, [0, 0.12, 0], [2.8, 0.24, 10.5], root);
    paint(street, metal, [0, 2.8, 0], [3, 0.18, 10.8], root, undefined, true);
    paint(street, red, [0, 2.88, 0], [3.03, 0.055, 10.85], root);
    for (const dz of [-4.6, 0, 4.6]) {
      paint(street, metal, [-1.1, 1.5, dz], [0.075, 2.7, 0.075], root);
      if (dz) paint(street, shelterGlass, [0, 1.6, dz], [2.2, 2.2, 0.035], root);
    }
    paint(street, shelterGlass, [-1.1, 1.6, 0], [0.035, 2.2, 9.2], root);
    paint(street, wood, [-0.65, 0.64, 0], [0.5, 0.12, 4.2], root);
    paint(street, dark, [-0.65, 0.4, 0], [0.2, 0.5, 3.7], root);
    paint(street, dark, [-1.04, 1.65, 3], [0.12, 1.35, 1], root);
    label(street, 6, [0, 2.77, 5.47], [2.6, 0.32], 0, root);
    street.add(pole, yellow, [1.2, 1.45, -4.8], [0.065, 2.6, 0.065], [0, 0, 0], root);
    const stop = groundRoot(x + 3.4, z);
    street.add(pole, metal, [0, 1.8, 0], [0.06, 3.6, 0.06], [0, 0, 0], stop);
    label(street, 3, [0, 3.7, 0], [0.95, 0.95], 0, stop);
  }
  for (const [x, z] of seats) {
    if (!clearOfBuildings(x + 3, z - 2, 0.7)) continue;
    street.add(pole, dark, [x + 3, SURFACE.plaza + 0.525, z - 2], [0.32, 1.05, 0.32]);
    street.add(pole, metal, [x + 3, SURFACE.plaza + 1.085, z - 2], [0.36, 0.1, 0.36]);
  }

  animations.forEach((animate) => animate(0));
  planting.finish();
  street.finish();
  moving.finish();
  let lastTime = 0;
  return {
    group,
    traffic,
    vegetation,
    update(time) {
      if (!Number.isFinite(time) || time === lastTime) return;
      animations.forEach((animate) => animate(time));
      moving.update();
      lastTime = time;
    },
    setNight(value) {
      const night = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
      headlights.emissiveIntensity = 0.1 + night * 2.7;
      taillights.emissiveIntensity = 0.1 + night * 1.7;
      lamplight.emissiveIntensity = 0.03 + night * 2.8;
      glass.emissiveIntensity = 0.02 + night * 0.32;
      signs.mat.emissiveIntensity = 0.15 + night * 0.8;
      pool.opacity = night * 0.09;
    },
  };
}
