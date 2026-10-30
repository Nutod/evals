import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import data from './map-data.json';
import { polygonArea, seededRandom } from './geo';
import { box, material, sign } from './primitives';
import { facadeMaterial, pavingTexture } from './materials';

type Point = readonly number[];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

const board: Bounds = { minX: -930, maxX: 630, minZ: -575, maxZ: 625 };
const stationBounds: Bounds = { minX: -21.5, maxX: 21.5, minZ: -149, maxZ: 149 };

function insideBoard(p: Point) {
  return p[0] >= board.minX && p[0] <= board.maxX && p[1] >= board.minZ && p[1] <= board.maxZ;
}

function interpolate(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function segmentRange(a: Point, b: Point, bounds: Bounds) {
  let enter = 0,
    exit = 1;
  for (const [axis, min, max] of [
    [0, bounds.minX, bounds.maxX],
    [1, bounds.minZ, bounds.maxZ],
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
    if (enter > exit) return;
  }
  return [enter, exit];
}

function clipPolygon(points: readonly Point[]) {
  let clipped = [...points];
  for (const [axis, limit, direction] of [
    [0, board.minX, 1],
    [0, board.maxX, -1],
    [1, board.minZ, 1],
    [1, board.maxZ, -1],
  ]) {
    const input = clipped;
    clipped = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const aInside = (a[axis] - limit) * direction >= 0;
      const bInside = (b[axis] - limit) * direction >= 0;
      if (aInside) clipped.push(a);
      if (aInside !== bInside) {
        const p = [...interpolate(a, b, (limit - a[axis]) / (b[axis] - a[axis]))];
        p[axis] = limit;
        clipped.push(p);
      }
    }
  }
  return clipped;
}

function shapeOf(points: readonly Point[]) {
  return new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], -p[1])));
}

function surface(points: readonly Point[], height = 0) {
  const indexed = new THREE.ShapeGeometry(shapeOf(points));
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  if (points.every(insideBoard)) return geometry;
  const positions = geometry.getAttribute('position');
  const vertices: number[] = [];
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const index = i + offset;
      return [positions.getX(index), positions.getZ(index)];
    });
    appendFace(vertices, clipPolygon(triangle), height);
  }
  geometry.dispose();
  return flatGeometry(vertices);
}

function appendFace(vertices: number[], points: readonly Point[], y: number) {
  for (let i = 1; i + 1 < points.length; i++) {
    for (const p of [points[0], points[i], points[i + 1]]) vertices.push(p[0], y, p[1]);
  }
}

function flatGeometry(vertices: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const uv: number[] = [];
  for (let i = 0; i < vertices.length; i += 3) uv.push(vertices[i], -vertices[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function stripPolygon(a: Point, b: Point, width: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.01) return [];
  const x = (-(b[1] - a[1]) * width) / (2 * length);
  const z = ((b[0] - a[0]) * width) / (2 * length);
  return clipPolygon([
    [a[0] + x, a[1] + z],
    [b[0] + x, b[1] + z],
    [b[0] - x, b[1] - z],
    [a[0] - x, a[1] - z],
  ]);
}

function strip(points: readonly Point[], width: number, y: number) {
  const vertices: number[] = [];
  for (let i = 1; i < points.length; i++) {
    appendFace(vertices, stripPolygon(points[i - 1], points[i], width), y);
  }
  return flatGeometry(vertices);
}

function terrainMaterial(parameters: THREE.MeshStandardMaterialParameters, layer: number) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.98,
    side: THREE.DoubleSide,
    ...parameters,
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  });
}

function ventFits(points: readonly Point[], x: number, z: number, w: number, d: number) {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[1] > z !== b[1] > z && x < a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1])) {
      inside = !inside;
    }
  }
  if (!inside) return false;
  const bounds = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
  return !points.some((a, i) => segmentRange(a, points[(i + 1) % points.length], bounds));
}

function stationPoint(p: Point): Point {
  const x = p[0] + 144,
    z = p[1] - 41;
  return [Math.cos(0.76) * x - Math.sin(0.76) * z, Math.sin(0.76) * x + Math.cos(0.76) * z];
}

function outsideStation(a: Point, b: Point) {
  const range = segmentRange(stationPoint(a), stationPoint(b), stationBounds);
  if (!range) return [[a, b]];
  const parts: Point[][] = [];
  if (range[0] > 0) parts.push([a, interpolate(a, b, range[0])]);
  if (range[1] < 1) parts.push([interpolate(a, b, range[1]), b]);
  return parts;
}

function batched(
  parent: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  mat: THREE.Material,
  castsShadow = false,
) {
  if (!geometries.length) return;
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = castsShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  geometries.forEach((g) => g.dispose());
  return mesh;
}

function geometryPart(source: THREE.BufferGeometry, start: number, count: number) {
  const result = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv']) {
    const attribute = source.getAttribute(key);
    result.setAttribute(
      key,
      new THREE.BufferAttribute(
        attribute.array.slice(start * attribute.itemSize, (start + count) * attribute.itemSize),
        attribute.itemSize,
      ),
    );
  }
  return result;
}

export function createCity() {
  const group = new THREE.Group();
  group.name = 'Geographic city';
  const buildings = new THREE.Group();
  buildings.name = 'Surrounding buildings';
  group.add(buildings);
  const paving = pavingTexture();
  const ground = box(
    group,
    1560,
    12,
    1200,
    -150,
    -6,
    25,
    new THREE.MeshStandardMaterial({ color: '#aaa99d', roughness: 0.98 }),
  );
  ground.name = 'City foundation';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), material('#202a2b'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -16;
  floor.receiveShadow = true;
  group.add(floor);

  const plazas = data.plazas.map((p) => surface(p, 0.02));
  batched(group, plazas, terrainMaterial({ map: paving, roughness: 0.95 }, 1));
  batched(
    group,
    data.green.filter((p) => polygonArea(p) > 8).map((p) => surface(p, 0.035)),
    terrainMaterial({ color: '#75816a' }, 2),
  );

  const footpaths: THREE.BufferGeometry[] = [],
    roads: THREE.BufferGeometry[] = [],
    curbs: THREE.BufferGeometry[] = [],
    markings: THREE.BufferGeometry[] = [];
  const roadKinds = [
    'primary',
    'secondary',
    'tertiary',
    'residential',
    'unclassified',
    'service',
    'primary_link',
    'secondary_link',
    'tertiary_link',
    'living_street',
    'construction',
  ];
  for (const road of data.roads) {
    if (roadKinds.includes(road.kind)) {
      const width = Math.min(22, Math.max(road.kind === 'service' ? 3.5 : 6, road.width));
      roads.push(strip(road.points, width, 0.09));
      curbs.push(strip(road.points, width + 2.6, 0.055));
      if (road.kind !== 'service' && road.kind !== 'construction') {
        for (let j = 1; j < road.points.length; j++) {
          const a = road.points[j - 1],
            b = road.points[j];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 2; d + 3 < length; d += 9) {
            markings.push(
              strip(
                [
                  [a[0] + ((b[0] - a[0]) * d) / length, a[1] + ((b[1] - a[1]) * d) / length],
                  [a[0] + ((b[0] - a[0]) * (d + 3)) / length, a[1] + ((b[1] - a[1]) * (d + 3)) / length],
                ],
                0.16,
                0.11,
              ),
            );
          }
        }
      }
    } else if (['footway', 'pedestrian', 'path', 'cycleway'].includes(road.kind)) {
      footpaths.push(strip(road.points, road.kind === 'pedestrian' ? 6 : 2.4, 0.065));
    }
  }
  batched(group, footpaths, terrainMaterial({ color: '#c0beb1' }, 4));
  batched(group, curbs, terrainMaterial({ color: '#bab8ac' }, 3));
  batched(group, roads, terrainMaterial({ color: '#515956' }, 5));
  batched(group, markings, terrainMaterial({ color: '#d1d0b9', roughness: 0.95 }, 6));

  const palettes = ['#c8c1b1', '#b4b8af', '#b6aaa0', '#b7c2bf', '#a7aaa3', '#d0c5ae', '#9caeae', '#c7b8a6'];
  const facadeBuckets: THREE.BufferGeometry[][] = palettes.map(() => []);
  const roofBuckets: THREE.BufferGeometry[][] = palettes.map(() => []);
  const random = seededRandom(112);
  const roofParts: { x: number; y: number; z: number; w: number; d: number; h: number }[] = [];
  let count = 0;
  for (const building of data.buildings) {
    if (polygonArea(building.points) < 15 || !building.points.every(insideBoard)) continue;
    const points = building.points;
    const height = Math.max(3, Math.min(146, building.height));
    const index = building.id % palettes.length;
    const shape = shapeOf(points);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    for (const g of geometry.groups) {
      (g.materialIndex === 0 ? roofBuckets : facadeBuckets)[index].push(
        geometryPart(geometry, g.start, g.count),
      );
    }
    geometry.dispose();
    const x = points.reduce((a, p) => a + p[0], 0) / points.length;
    const z = points.reduce((a, p) => a + p[1], 0) / points.length;
    if (polygonArea(points) > 180 && random() > 0.2) {
      const w = 4 + random() * 5,
        d = 3 + random() * 4,
        h = 1.4 + random() * 1.8;
      if (ventFits(points, x, z, w, d)) roofParts.push({ x, z, y: height + h / 2, w, d, h });
    }
    count++;
  }
  palettes.forEach((color, i) => {
    batched(buildings, facadeBuckets[i], facadeMaterial(color, 100 + i, i === 3 || i === 6), true);
    batched(buildings, roofBuckets[i], material(i % 3 === 0 ? '#8f9388' : '#727e7b'), true);
  });
  const vents = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material('#a8afaa', 0.75, 0.15),
    roofParts.length,
  );
  vents.name = 'Roof vents';
  const dummy = new THREE.Object3D();
  roofParts.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.w, p.h, p.d);
    dummy.updateMatrix();
    vents.setMatrixAt(i, dummy.matrix);
  });
  vents.castShadow = true;
  buildings.add(vents);

  const railGeometry: THREE.BufferGeometry[] = [],
    piers: THREE.BufferGeometry[] = [];
  for (const line of data.rail) {
    let distance = 0;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      for (const [start, end] of outsideStation(a, b)) {
        const points = stripPolygon(start, end, 5.6);
        if (points.length < 3 || polygonArea(points) < 0.01) continue;
        const deck = new THREE.ExtrudeGeometry(shapeOf(points), {
          depth: 1.4,
          bevelEnabled: false,
          steps: 1,
        });
        deck.rotateX(-Math.PI / 2);
        deck.translate(0, 7.2, 0);
        railGeometry.push(deck);
      }
      for (let d = 9 - (distance % 18); d <= length; d += 18) {
        if (d < 0) continue;
        const p = interpolate(a, b, d / length),
          local = stationPoint(p);
        if (Math.abs(local[0]) <= 24.5 && Math.abs(local[1]) <= 152) continue;
        const pier = new THREE.BoxGeometry(4.2, 7.5, 2.2);
        pier.rotateY(Math.atan2(b[0] - a[0], b[1] - a[1]));
        pier.translate(p[0], 3.45, p[1]);
        const positions = pier.getAttribute('position');
        if (
          Array.from({ length: positions.count }, (_, j) => [positions.getX(j), positions.getZ(j)]).every(
            insideBoard,
          )
        ) {
          piers.push(pier);
        } else pier.dispose();
      }
      distance += length;
    }
  }
  const decks = batched(group, railGeometry, material('#645f51'), true);
  if (decks) decks.name = 'Railway decks';
  const supports = batched(group, piers, material('#826e59'), true);
  if (supports) supports.name = 'Railway piers';

  const trim = material('#656e66', 0.75, 0.1);
  box(group, 1560, 0.4, 0.4, -150, -3.6, 625, trim);
  box(group, 1560, 0.4, 0.4, -150, -3.6, -575, trim);
  box(group, 0.4, 0.4, 1200, 630, -3.6, 25, trim);
  box(group, 0.4, 0.4, 1200, -930, -3.6, 25, trim);
  sign(
    group,
    'A L E X A N D E R P L A T Z   /   B E R L I N',
    150,
    3.5,
    380,
    -6.5,
    625.1,
    '#adb5a4',
    '#555f59',
  );
  return { group, buildings, count };
}
