import * as THREE from 'three';
import { LANDMARKS } from './landmark-data';
import { box, cylinder, sphere, beam, sign, material, nightMaterials } from './primitives';

const TAU = Math.PI * 2;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitRod = new THREE.CylinderGeometry(1, 1, 1, 6);
const up = new THREE.Vector3(0, 1, 0);
const stone = material('#c0b8a7');
const concrete = material('#c9c5b9');
const silver = material('#bfc9ce', 0.32, 0.74);
const steel = material('#45545a', 0.46, 0.65);
const glass = material('#293f49', 0.25, 0.48);
const copper = material('#527b70', 0.64, 0.48);
const slate = material('#575d5c');
const white = material('#deded5', 0.62);

function instances(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
) {
  if (!matrices.length) return;
  const mesh = new THREE.InstancedMesh(geometry, mat, matrices.length);
  matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

function transform(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

class Details {
  private boxes = new Map<THREE.Material, THREE.Matrix4[]>();
  private rods = new Map<THREE.Material, THREE.Matrix4[]>();
  constructor(private parent: THREE.Object3D) {}
  box(
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const matrices = this.boxes.get(mat) ?? [];
    matrices.push(transform(x, y, z, w, h, d, rx, ry, rz));
    this.boxes.set(mat, matrices);
  }
  rod(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const delta = b.clone().sub(a);
    const matrices = this.rods.get(mat) ?? [];
    matrices.push(
      new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()),
        new THREE.Vector3(radius, delta.length(), radius),
      ),
    );
    this.rods.set(mat, matrices);
  }
  finish() {
    for (const [mat, matrices] of this.boxes) instances(this.parent, unitBox, mat, matrices);
    for (const [mat, matrices] of this.rods) instances(this.parent, unitRod, mat, matrices);
  }
}

function canvasMaterial(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  luminous = false,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.76 });
  if (luminous) {
    mat.emissive.set('#ffffff');
    mat.emissiveMap = map;
    mat.emissiveIntensity = 0.05;
    nightMaterials.push(mat);
  }
  return mat;
}

function brickMaterial() {
  const mat = canvasMaterial(512, 512, (ctx) => {
    ctx.fillStyle = '#835346';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 24; row++)
      for (let col = -1; col < 9; col++) {
        const shade = (row * 31 + col * 17 + 97) % 24;
        ctx.fillStyle = `rgb(${143 + shade},${65 + shade / 2},${44 + shade / 3})`;
        ctx.fillRect(col * 64 + (row % 2) * 32 + 1, (row * 512) / 24 + 1, 62, 512 / 24 - 2);
      }
  });
  mat.map!.wrapS = mat.map!.wrapT = THREE.RepeatWrapping;
  mat.map!.anisotropy = 4;
  return mat;
}

function metricUV<T extends THREE.BufferGeometry>(geometry: T, dimensions = new THREE.Vector3(1, 1, 1)) {
  const p = geometry.getAttribute('position'),
    n = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * dimensions.x,
      y = p.getY(i) * dimensions.y,
      z = p.getZ(i) * dimensions.z;
    uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? z : x) / 4, (Math.abs(n.getY(i)) > 0.5 ? z : y) / 4);
  }
  return geometry;
}

function masonry(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
) {
  const mesh = box(parent, w, h, d, x, y, z, mat);
  mesh.geometry = metricUV(unitBox.clone(), new THREE.Vector3(w, h, d));
  return mesh;
}

function torus(
  parent: THREE.Object3D,
  radius: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 64), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function gable(
  parent: THREE.Object3D,
  width: number,
  length: number,
  eave: number,
  rise: number,
  mat: THREE.Material,
  x = 0,
  z = 0,
) {
  const shape = new THREE.Shape()
    .moveTo(-width / 2, 0)
    .lineTo(width / 2, 0)
    .lineTo(0, rise)
    .closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(
    0,
    0,
    -length / 2,
  );
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, eave, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function archGeometry(width: number, height: number, pointed = false) {
  const r = width / 2,
    spring = height - r;
  const shape = new THREE.Shape().moveTo(-r, 0).lineTo(r, 0).lineTo(r, spring);
  if (pointed)
    shape
      .quadraticCurveTo(r * 0.7, height - r * 0.28, 0, height)
      .quadraticCurveTo(-r * 0.7, height - r * 0.28, -r, spring);
  else shape.absarc(0, spring, r, 0, Math.PI, false);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 12);
}

function archedFacade(
  parent: THREE.Object3D,
  width: number,
  columns: number,
  rows: number,
  x: number,
  z: number,
  rotation: number,
  pointed = false,
  floorHeight = 5.2,
  sill = 2.4,
) {
  const facade = new THREE.Group();
  facade.position.set(x, 0, z);
  facade.rotation.y = rotation;
  parent.add(facade);
  const details = new Details(facade),
    panes: THREE.Matrix4[] = [],
    frames: THREE.Matrix4[] = [];
  const step = width / columns,
    w = Math.min(2.1, step * 0.52),
    h = pointed ? 8.5 : 3.2;
  for (let col = 0; col < columns; col++) {
    const px = -width / 2 + step * (col + 0.5);
    details.box(stone, 0.18, rows * floorHeight + 1, 0.2, px - step / 2, (rows * floorHeight) / 2 + 1, 0.02);
    for (let row = 0; row < rows; row++) {
      const py = sill + row * floorHeight;
      panes.push(transform(px, py, 0.16));
      frames.push(transform(px, py - 0.2, 0.08));
      details.box(stone, w + 0.65, 0.18, 0.5, px, py - 0.18, 0.16);
      details.box(stone, 0.09, h - 0.3, 0.12, px, py + h / 2 - 0.1, 0.2);
      details.box(stone, w, 0.09, 0.12, px, py + h * 0.45, 0.2);
    }
  }
  instances(facade, archGeometry(w + 0.4, h + 0.4, pointed), stone, frames);
  instances(facade, archGeometry(w, h, pointed), glass, panes);
  details.finish();
}

function clockMaterial() {
  return canvasMaterial(
    512,
    512,
    (ctx) => {
      ctx.fillStyle = '#263b37';
      ctx.fillRect(0, 0, 512, 512);
      ctx.translate(256, 256);
      for (let i = 0; i < 60; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 60);
        ctx.fillStyle = '#e9d8ad';
        ctx.fillRect(-2, -230, i % 5 ? 3 : 6, i % 5 ? 10 : 25);
        ctx.restore();
      }
      ctx.strokeStyle = '#f3dfab';
      ctx.lineCap = 'round';
      for (const [angle, length, thickness] of [
        [-1.05, 125, 12],
        [0.84, 185, 7],
      ]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.sin(angle) * length, -Math.cos(angle) * length);
        ctx.lineWidth = thickness;
        ctx.stroke();
      }
      ctx.fillStyle = '#f3dfab';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
    },
    true,
  );
}

function clockFaces(
  parent: THREE.Object3D,
  y: number,
  halfWidth: number,
  z: number,
  radius: number,
  mat: THREE.Material,
) {
  for (let side = 0; side < 4; side++) {
    const angle = (side * Math.PI) / 2,
      nx = Math.sin(angle),
      nz = Math.cos(angle);
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
    face.position.set(nx * halfWidth, y, z + nz * halfWidth);
    face.rotation.y = angle;
    parent.add(face);
    const rim = torus(parent, radius + 0.1, 0.09, face.position.x, y, face.position.z, stone);
    rim.rotation.set(0, angle, 0);
  }
}

function fernsehturm(group: THREE.Group) {
  const details = new Details(group),
    red = material('#a84536', 0.52, 0.24);
  cylinder(group, 4.25, 8.1, 199, 0, 99.5, 0, concrete, 64);
  cylinder(group, 8.3, 9.6, 4.5, 0, 2.25, 0, stone, 48);
  for (let wing = 0; wing < 3; wing++) {
    const pavilion = new THREE.Group();
    pavilion.rotation.y = (wing * TAU) / 3;
    group.add(pavilion);
    box(pavilion, 18, 5, 21, 0, 2.5, 17, glass);
    box(pavilion, 19, 0.7, 25, 0, 5.7, 18, white).rotation.x = -0.14;
    box(pavilion, 8, 1, 9, 0, 0.5, 31.5, stone);
    const ribs = new Details(pavilion);
    for (let i = -4; i <= 4; i++) ribs.box(silver, 0.15, 4.6, 0.18, i * 2, 2.6, 27.6);
    for (let i = 0; i < 9; i++) ribs.box(stone, 11, (i + 1) * 0.12, 0.4, 0, (i + 1) * 0.06, 39 - i * 0.4);
    ribs.finish();
  }
  const shell = sphere(group, 16, 0, 212, 0, silver, 64);
  shell.name = 'Stainless steel sphere';
  for (const [bottom, top] of [
    [202, 205.1],
    [207, 210.2],
  ]) {
    const start = Math.acos((top - 212) / 16.08),
      end = Math.acos((bottom - 212) / 16.08);
    const band = new THREE.Mesh(new THREE.SphereGeometry(16.08, 96, 4, 0, TAU, start, end - start), glass);
    band.position.y = 212;
    group.add(band);
    for (const y of [bottom, top]) torus(group, Math.sqrt(16.1 ** 2 - (y - 212) ** 2), 0.12, 0, y, 0, silver);
    for (let i = 0; i < 80; i++) {
      const angle = (i * TAU) / 80,
        r = Math.sqrt(16.18 ** 2 - ((top + bottom) / 2 - 212) ** 2);
      details.box(
        silver,
        0.11,
        top - bottom,
        0.15,
        Math.sin(angle) * r,
        (top + bottom) / 2,
        Math.cos(angle) * r,
        0,
        angle,
      );
    }
  }
  for (let meridian = 0; meridian < 32; meridian++)
    for (let step = 0; step < 12; step++) {
      const angle = (meridian * TAU) / 32;
      const point = (s: number) =>
        new THREE.Vector3(
          Math.sin((s * Math.PI) / 12) * 16.04 * Math.sin(angle),
          212 + Math.cos((s * Math.PI) / 12) * 16.04,
          Math.sin((s * Math.PI) / 12) * 16.04 * Math.cos(angle),
        );
      if (step < 6 || step > 8) details.rod(silver, point(step), point(step + 1), 0.035);
    }
  cylinder(group, 2.1, 3.8, 27, 0, 239.5, 0, white, 32);
  for (let i = 0; i < 14; i++) {
    const y0 = 253 + i * 7.5,
      r = 2.05 - i * 0.125;
    cylinder(group, Math.max(0.3, r - 0.12), r, 7.5, 0, y0 + 3.75, 0, i % 2 ? white : red, 16);
    if (i < 7) torus(group, r + 0.32, 0.09, 0, y0, 0, silver);
  }
  cylinder(group, 0.08, 0.38, 10, 0, 363, 0, white, 12);
  for (const y of [231, 245, 257]) {
    torus(group, 4.5, 0.13, 0, y, 0, steel);
    for (let side = 0; side < 6; side++) {
      const a = (side * TAU) / 6;
      details.rod(
        steel,
        new THREE.Vector3(0, y - 2.2, 0),
        new THREE.Vector3(Math.sin(a) * 4.5, y, Math.cos(a) * 4.5),
        0.09,
      );
    }
  }
  sign(group, 'BERLINER FERNSEHTURM', 15, 1.1, 0, 4.6, 28.1, '#e6e6df', '#36484a');
  details.finish();
}

function parkInn(group: THREE.Group) {
  group.rotation.y = -0.06;
  const details = new Details(group),
    facade = material('#9caeb5', 0.5, 0.36),
    blue = material('#546c7a', 0.28, 0.42);
  const lit = new THREE.MeshStandardMaterial({
    color: '#9a9c8d',
    roughness: 0.5,
    emissive: '#ffd9a0',
    emissiveIntensity: 0.04,
  });
  nightMaterials.push(lit);
  box(group, 78, 7.8, 39, 0, 3.9, 0, stone);
  box(group, 66, 113.2, 27, 0, 64.6, 0, facade);
  box(group, 66.6, 2, 27.6, 0, 122, 0, white);
  box(group, 62, 1, 23, 0, 123.5, 0, slate);
  for (let side = 0; side < 4; side++) {
    const angle = (side * Math.PI) / 2,
      nx = Math.sin(angle),
      nz = Math.cos(angle),
      width = side % 2 ? 27 : 66,
      depth = side % 2 ? 33 : 13.5;
    const columns = side % 2 ? 11 : 27,
      spacing = width / columns;
    for (let row = 0; row < 36; row++) {
      const y = 10.1 + row * 3.08;
      details.box(
        white,
        width + 0.3,
        0.22,
        0.22,
        nx * (depth + 0.14),
        y + 1.32,
        nz * (depth + 0.14),
        0,
        angle,
      );
      for (let col = 0; col < columns; col++) {
        const along = (col + 0.5) * spacing - width / 2;
        const mat = (col * 13 + row * 7 + side) % 19 === 0 ? lit : (col + row * 3) % 5 ? glass : blue;
        details.box(
          mat,
          spacing - 0.24,
          2.52,
          0.12,
          nx * (depth + 0.08) + Math.cos(angle) * along,
          y,
          nz * (depth + 0.08) - Math.sin(angle) * along,
          0,
          angle,
        );
      }
    }
    for (let col = 0; col <= columns; col++) {
      const along = col * spacing - width / 2;
      details.box(
        silver,
        0.13,
        111,
        0.22,
        nx * (depth + 0.18) + Math.cos(angle) * along,
        64.5,
        nz * (depth + 0.18) - Math.sin(angle) * along,
        0,
        angle,
      );
    }
    details.box(white, width + 0.8, 1, 0.45, nx * depth, 124.5, nz * depth, 0, angle);
  }
  for (const side of [-1, 1]) {
    sign(group, 'park inn', 17, 2.2, 0, 121.7, side * 13.95, '#f5f0eb', '#a6363a', side < 0 ? Math.PI : 0);
    for (let i = 0; i < 24; i++) details.box(glass, 2.8, 4.8, 0.15, -35 + i * 3.05, 3.6, side * 19.6);
  }
  box(group, 20, 0.5, 8, 0, 5.4, 23, silver);
  box(group, 18, 0.8, 7.5, 0, 0.4, 22.75, stone);
  for (const x of [-8.5, 8.5]) cylinder(group, 0.15, 0.15, 5, x, 2.5, 26, steel, 8);
  for (let i = 0; i < 5; i++) details.box(stone, 21, (i + 1) * 0.16, 0.6, 0, (i + 1) * 0.08, 29 - i * 0.6);
  for (const x of [-18, 18]) box(group, 8, 0.8, 7, x, 124.4, 0, steel);
  sign(group, 'by Radisson', 9, 0.75, 0, 119.8, 13.88, '#e5e6e2', '#4b626e');
  details.finish();
}

function worldClock(group: THREE.Group) {
  cylinder(group, 4.2, 4.35, 0.18, 0, 0.09, 0, stone, 64);
  torus(group, 3.75, 0.045, 0, 0.2, 0, steel);
  cylinder(group, 0.38, 0.52, 5.5, 0, 2.95, 0, silver, 24);
  cylinder(group, 2.55, 2.55, 0.2, 0, 5.45, 0, silver, 24);
  const drum = new THREE.Group();
  group.add(drum);
  const cities = [
    'LONDON',
    'BERLIN',
    'MOSKAU',
    'DUBAI',
    'KARATSCHI',
    'DHAKA',
    'BANGKOK',
    'PEKING',
    'TOKIO',
    'SYDNEY',
    'NOUMÉA',
    'AUCKLAND',
    'SAMOA',
    'HONOLULU',
    'ANCHORAGE',
    'LOS ANGELES',
    'DENVER',
    'MEXIKO',
    'NEW YORK',
    'CARACAS',
    'RIO',
    'S. GEORGIA',
    'AZOREN',
    'REYKJAVIK',
  ];
  const atlas = canvasMaterial(3072, 256, (ctx) => {
    for (let i = 0; i < 24; i++) {
      const x = i * 128;
      ctx.fillStyle = i % 2 ? '#b4c8c4' : '#c9d3c8';
      ctx.fillRect(x, 0, 128, 256);
      ctx.fillStyle = '#354c4a';
      ctx.fillRect(x, 150, 128, 76);
      ctx.fillStyle = '#263c3b';
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cities[i], x + 64, 57, 120);
      ctx.font = '12px sans-serif';
      ctx.fillText(cities[(i + 7) % 24], x + 64, 104, 120);
      ctx.fillStyle = '#e9e1c4';
      ctx.font = '46px sans-serif';
      ctx.fillText(String(i).padStart(2, '0'), x + 64, 204);
      ctx.fillStyle = '#5b6c63';
      ctx.fillRect(x, 0, 2, 256);
    }
  });
  cylinder(drum, 2.55, 2.55, 1.6, 0, 6.3, 0, atlas, 24);
  for (const y of [5.52, 7.1]) cylinder(group, 2.61, 2.61, 0.12, 0, y, 0, silver, 24);
  cylinder(group, 0.12, 0.2, 1.6, 0, 7.9, 0, steel, 12);
  const solar = new THREE.Group();
  solar.position.y = 8.85;
  solar.scale.setScalar(0.8);
  group.add(solar);
  sphere(solar, 0.24, 0, 0, 0, silver, 16);
  for (let i = 0; i < 6; i++) {
    const r = 0.48 + i * 0.24,
      orbit = torus(solar, r, 0.035, 0, 0, 0, steel);
    orbit.rotation.set(0.42 + i * 0.2, i * 0.61, 0.22);
    orbit.scale.y = 0.72;
    const angle = i * 2.39;
    sphere(
      solar,
      0.07 + i * 0.012,
      Math.cos(angle) * r,
      Math.sin(angle) * 0.55,
      Math.sin(angle) * r * 0.7,
      silver,
      12,
    );
  }
  beam(group, new THREE.Vector3(0, 7.15, 0), new THREE.Vector3(0, 8.5, 0), 0.055, silver);
  for (const animated of [drum, solar])
    animated.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
  return (time: number) => {
    solar.rotation.y = (time * TAU) / 60;
    drum.rotation.y = (time * TAU) / 86400;
  };
}

function barrel(width: number, rise: number, length: number, start = 0, end = Math.PI) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 32; i++) {
    const angle = start + ((end - start) * i) / 32;
    for (const z of [-length / 2, length / 2]) {
      positions.push((Math.cos(angle) * width) / 2, Math.sin(angle) * rise, z);
      uv.push(i / 32, z / length + 0.5);
    }
    if (i < 32) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function station(group: THREE.Group, brick: THREE.Material) {
  group.rotation.y = 0.76;
  const details = new Details(group),
    arches: THREE.Matrix4[] = [];
  const spandrel = new THREE.Shape()
    .moveTo(-5, 8)
    .lineTo(5, 8)
    .lineTo(5, 2.2)
    .absarc(0, 2.2, 5, 0, Math.PI, false)
    .closePath();
  const arch = metricUV(
    new THREE.ExtrudeGeometry(spandrel, { depth: 42, bevelEnabled: false, curveSegments: 16 }).translate(
      0,
      0,
      -21,
    ),
  );
  for (let i = 0; i < 27; i++) {
    const z = -143 + i * 11;
    arches.push(transform(0, 0, z, 1, 1, 1, 0, Math.PI / 2));
    for (const x of [-20.5, 20.5]) details.box(stone, 1, 0.3, 10, x, 8, z);
    details.box(brick, 42, 8, 1, 0, 4, z - 5.5);
  }
  instances(group, arch, brick, arches);
  details.box(brick, 42, 8, 1, 0, 4, 148.5);
  box(group, 43, 0.65, 298, 0, 8.3, 0, slate);
  for (const x of [-21.4, 21.4]) {
    details.box(steel, 0.08, 0.08, 298, x, 9.8, 0);
    for (let z = -148; z <= 148; z += 3) details.box(steel, 0.08, 1.2, 0.08, x, 9.2, z);
  }
  for (const x of [-10.5, 10.5]) {
    box(group, 6.5, 0.35, 151, x, 8.8, 0, stone);
    const roof = new THREE.Mesh(barrel(21, 9.1, 152), copper);
    roof.position.set(x, 12.9, 0);
    roof.castShadow = true;
    group.add(roof);
    const skylight = new THREE.Mesh(barrel(21.12, 9.16, 132, Math.PI / 3, (Math.PI * 2) / 3), glass);
    skylight.position.set(x, 12.9, 0);
    group.add(skylight);
    const end = new THREE.Shape()
      .moveTo(-10.5, 9)
      .lineTo(10.5, 9)
      .lineTo(10.5, 12.9)
      .absellipse(0, 12.9, 10.5, 9.1, 0, Math.PI, false, 0)
      .closePath();
    for (const z of [-76, 76]) {
      const glazing = new THREE.Mesh(new THREE.ShapeGeometry(end, 24), glass);
      glazing.position.set(x, 0, z);
      if (z < 0) glazing.rotation.y = Math.PI;
      group.add(glazing);
      for (let k = -4; k <= 4; k++) {
        const px = k * 2.15,
          top = 12.9 + 9.1 * Math.sqrt(1 - (px / 10.5) ** 2);
        details.box(steel, 0.13, top - 9, 0.16, x + px, (top + 9) / 2, z + Math.sign(z) * 0.06);
      }
      details.box(steel, 21, 0.22, 0.2, x, 12.9, z + Math.sign(z) * 0.12);
    }
    for (let bay = 0; bay <= 16; bay++) {
      const z = -76 + bay * 9.5;
      for (let segment = 0; segment < 16; segment++) {
        const point = (n: number) =>
          new THREE.Vector3(
            x + Math.cos((n * Math.PI) / 16) * 10.57,
            12.9 + Math.sin((n * Math.PI) / 16) * 9.17,
            z,
          );
        details.rod(steel, point(segment), point(segment + 1), 0.1);
      }
      for (const side of [-1, 1]) details.box(steel, 0.24, 4.2, 0.24, x + side * 10.5, 10.8, z);
      details.box(steel, 21, 0.14, 0.14, x, 12.8, z);
    }
  }
  for (const x of [-16, -5, 5, 16]) {
    for (const offset of [-0.72, 0.72]) details.box(steel, 0.09, 0.16, 296, x + offset, 8.79, 0);
    for (let z = -147; z <= 147; z += 1.25) details.box(material('#655d50'), 2.35, 0.1, 0.22, x, 8.67, z);
  }
  for (const side of [-1, 1]) {
    sign(
      group,
      'Alexanderplatz',
      17,
      1.25,
      0,
      10.7,
      side * 76.3,
      '#e5e9df',
      '#254553',
      side < 0 ? Math.PI : 0,
    );
    for (let step = 0; step < 21; step++)
      details.box(
        stone,
        5,
        (step + 1) * 0.41,
        0.65,
        side * 24,
        (step + 1) * 0.205,
        side * (86 - step * 0.65),
      );
    for (const offset of [-2.25, 2.25]) {
      const x = side * 24 + offset;
      details.rod(steel, new THREE.Vector3(x, 1.2, side * 86), new THREE.Vector3(x, 9.4, side * 73), 0.045);
      for (let step = 0; step <= 20; step += 5)
        details.box(steel, 0.06, 0.8, 0.06, x, (step + 1) * 0.41 + 0.4, side * (86 - step * 0.65));
    }
    sign(group, 'S  U', 2.5, 1.5, side * 23, 4.3, side * 79, '#f2eee0', '#315b55', side < 0 ? Math.PI : 0);
  }
  details.finish();
}

function rathaus(group: THREE.Group, brick: THREE.Material, clock: THREE.Material) {
  group.rotation.y = -0.1;
  const details = new Details(group);
  for (const z of [-36.5, 36.5]) {
    masonry(group, 98, 23.5, 13, 0, 11.75, z, brick);
    gable(group, 13, 98, 23.2, 3.6, slate, 0, z).rotation.y = Math.PI / 2;
  }
  for (const x of [-43.5, -16.3, 16.3, 43.5]) {
    masonry(group, 11, 23.5, 60, x, 11.75, 0, brick);
    gable(group, 11.5, 60, 23.2, 3.5, slate, x);
  }
  for (const side of [-1, 1]) {
    archedFacade(group, 96, 23, 4, 0, side * 43.04, side < 0 ? Math.PI : 0);
    archedFacade(group, 60, 14, 4, side * 49.04, 0, (side * Math.PI) / 2);
    for (const y of [1, 7.3, 12.5, 23.3, 24.3]) {
      details.box(stone, 99, y > 23 ? 0.32 : 0.2, 0.5, 0, y, side * 43.1);
      details.box(stone, 0.5, y > 23 ? 0.32 : 0.2, 86, side * 49.1, y, 0);
    }
    for (let i = 0; i < 25; i++) details.box(brick, 1.1, 1.1, 0.7, -47 + i * 3.9, 24.8, side * 43);
  }
  for (const [x, side] of [
    [-38, 1],
    [-21.8, -1],
    [-10.8, 1],
    [10.8, -1],
    [21.8, 1],
    [38, -1],
  ])
    archedFacade(group, 58, 12, 3, x, 0, (side * Math.PI) / 2, false, 6);
  masonry(group, 17, 44, 17, 0, 22, -36, brick);
  masonry(group, 14, 22, 14, 0, 55, -36, brick);
  for (const y of [29, 39.5, 44, 59, 66.5, 69]) {
    details.box(stone, y < 44 ? 18 : 15.2, 0.5, y < 44 ? 18 : 15.2, 0, y, -36);
  }
  for (const side of [-1, 1]) {
    archedFacade(group, 15, 3, 2, 0, -36 + side * 8.55, side < 0 ? Math.PI : 0, false, 7, 24);
    for (const x of [-5.8, 5.8]) details.box(stone, 0.35, 24, 0.4, x, 54, -36 + side * 7.2);
    for (let i = -1; i <= 1; i++) details.box(glass, 1.45, 5.5, 0.15, i * 3.2, 63, -36 + side * 7.1);
  }
  clockFaces(group, 52, 7.25, -36, 2.6, clock);
  cylinder(group, 0, 9.2, 4, 0, 69, -36, slate, 4).rotation.y = Math.PI / 4;
  for (const x of [-6.5, 6.5])
    for (const z of [-42.5, -29.5]) {
      cylinder(group, 1.1, 1.25, 8.5, x, 67.75, z, brick, 8);
      cylinder(group, 0, 1.5, 2, x, 73, z, slate, 8);
    }
  for (let i = -3; i <= 3; i++)
    for (const side of [-1, 1]) details.box(brick, 0.8, 1.6, 0.8, i * 2.1, 69.4, -36 + side * 7.1);
  const portal = new THREE.Mesh(archGeometry(5.5, 8), glass);
  portal.position.set(0, 1.5, -44.6);
  portal.rotation.y = Math.PI;
  group.add(portal);
  box(group, 18, 1.62, 1.5, 0, 0.81, -44.9, stone);
  for (let step = 0; step < 9; step++)
    details.box(stone, 18, (step + 1) * 0.18, 0.65, 0, (step + 1) * 0.09, -51 + step * 0.65);
  sign(group, 'ROTES RATHAUS', 10, 0.7, 0, 12, -44.65, '#e3c8a1', '#904c39', Math.PI);
  details.finish();
}

function marienkirche(group: THREE.Group, brick: THREE.Material, clock: THREE.Material) {
  group.rotation.y = 1.1;
  const details = new Details(group),
    tile = material('#94523d'),
    pale = material('#c8c0a9');
  masonry(group, 25, 17, 45, 0, 8.5, 6, brick);
  gable(group, 27.5, 48, 17, 13, tile, 0, 6);
  cylinder(group, 11.5, 11.5, 17, 0, 8.5, 29, brick, 8);
  cylinder(group, 0, 12.5, 12.5, 0, 23.25, 29, tile, 8);
  const apsePanes: THREE.Matrix4[] = [],
    apseFrames: THREE.Matrix4[] = [];
  for (const angle of [-3, -1, 1, 3].map((n) => (n * Math.PI) / 8)) {
    const x = Math.sin(angle) * 10.72,
      z = 29 + Math.cos(angle) * 10.72;
    apsePanes.push(transform(x + Math.sin(angle) * 0.09, 4.2, z + Math.cos(angle) * 0.09, 1, 1, 1, 0, angle));
    apseFrames.push(transform(x, 4, z, 1, 1, 1, 0, angle));
    details.box(
      stone,
      0.12,
      8.4,
      0.15,
      x + Math.sin(angle) * 0.15,
      8.4,
      z + Math.cos(angle) * 0.15,
      0,
      angle,
    );
  }
  instances(group, archGeometry(2.3, 8.5, true), glass, apsePanes);
  instances(group, archGeometry(2.8, 8.9, true), stone, apseFrames);
  for (let side = -2; side <= 2; side++) {
    const angle = (side * Math.PI) / 4,
      x = Math.sin(angle) * 11.8,
      z = 29 + Math.cos(angle) * 11.8;
    details.box(brick, 1.2, 12.5, 1.8, x, 6.25, z, 0, angle);
    details.box(stone, 1.4, 0.3, 2, x, 12.5, z, 0, angle);
  }
  for (const side of [-1, 1]) {
    archedFacade(group, 43, 7, 1, side * 12.55, 6, (side * Math.PI) / 2, true, 10, 4.2);
    for (let bay = 0; bay < 8; bay++) {
      const z = -15 + bay * 6.1;
      details.box(brick, 1.8, 12, 1.4, side * 13.3, 6, z);
      details.box(stone, 2, 0.35, 1.7, side * 13.3, 12, z);
      details.box(brick, 1.15, 3.2, 1, side * 13.05, 13.6, z);
      details.rod(slate, new THREE.Vector3(side * 13.75, 17.1, z), new THREE.Vector3(0, 30.05, z), 0.045);
    }
    details.box(stone, 0.5, 0.35, 45, side * 12.7, 16.5, 6);
  }
  masonry(group, 14, 35, 15, 0, 17.5, -23, brick);
  box(group, 12.5, 12, 13.5, 0, 41, -23, pale);
  for (const y of [7, 19, 34.7, 47]) details.box(stone, 14.5, 0.5, 15.5, 0, y, -23);
  for (const side of [-1, 1]) {
    archedFacade(group, 12, 2, 2, 0, -23 + side * 7.56, side < 0 ? Math.PI : 0, true, 11, 13);
    for (const x of [-5.7, 5.7]) details.box(stone, 0.45, 11, 0.4, x, 41, -23 + side * 6.9);
  }
  clockFaces(group, 41.8, 6.9, -23, 1.65, clock);
  cylinder(group, 3.5, 10, 7, 0, 50.5, -23, copper, 4).rotation.y = Math.PI / 4;
  cylinder(group, 3.4, 3.4, 7, 0, 57.5, -23, steel, 8);
  for (let side = 0; side < 8; side++) {
    const angle = (side * TAU) / 8;
    details.box(
      copper,
      0.25,
      7.3,
      0.28,
      Math.sin(angle) * 3.45,
      57.5,
      -23 + Math.cos(angle) * 3.45,
      0,
      angle,
    );
    for (let slat = 0; slat < 10; slat++)
      details.box(
        copper,
        2.5,
        0.12,
        0.2,
        Math.sin(angle) * 3.42,
        54.5 + slat * 0.57,
        -23 + Math.cos(angle) * 3.42,
        0,
        angle,
      );
  }
  const profile = [
    [3.5, 60.7],
    [4.4, 62],
    [5.1, 64],
    [4.8, 65.8],
    [3.3, 68],
    [1.5, 70],
    [1.2, 73],
  ];
  const dome = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    ),
    copper,
  );
  dome.position.z = -23;
  dome.castShadow = true;
  group.add(dome);
  cylinder(group, 0.08, 2.3, 14, 0, 80, -23, copper, 12);
  for (const [radius, y] of [
    [3.55, 61],
    [1.5, 70],
    [1.3, 73],
  ])
    torus(group, radius, 0.12, 0, y, -23, copper);
  sphere(group, 0.42, 0, 87.2, -23, silver, 12);
  details.box(steel, 0.12, 2.6, 0.12, 0, 88.7, -23);
  details.box(steel, 1.4, 0.12, 0.12, 0, 89.2, -23);
  const door = new THREE.Mesh(archGeometry(4.1, 6.5, true), glass);
  door.position.set(0, 0.6, -30.6);
  door.rotation.y = Math.PI;
  group.add(door);
  box(group, 7, 0.68, 1, 0, 0.34, -30.8, stone);
  for (let i = 0; i < 4; i++) details.box(stone, 7, (i + 1) * 0.17, 0.55, 0, (i + 1) * 0.085, -33 + i * 0.55);
  details.finish();
}

export function createLandmarks(): {
  group: THREE.Group;
  byId: Map<string, THREE.Group>;
  update: (time: number) => void;
} {
  const group = new THREE.Group();
  group.name = 'Landmarks';
  const byId = new Map<string, THREE.Group>(),
    brick = brickMaterial(),
    clock = clockMaterial();
  const builders: Record<string, (landmark: THREE.Group) => void | ((time: number) => void)> = {
    tower: fernsehturm,
    'park-inn': parkInn,
    clock: worldClock,
    station: (landmark) => station(landmark, brick),
    rathaus: (landmark) => rathaus(landmark, brick, clock),
    church: (landmark) => marienkirche(landmark, brick, clock),
  };
  const animations: ((time: number) => void)[] = [];
  for (const data of LANDMARKS) {
    const landmark = new THREE.Group();
    landmark.name = data.name;
    landmark.userData.landmarkId = data.id;
    landmark.position.set(data.position[0], 0, data.position[1]);
    const animate = builders[data.id]?.(landmark);
    if (animate) animations.push(animate);
    group.add(landmark);
    byId.set(data.id, landmark);
  }
  return {
    group,
    byId,
    update: (time) => {
      if (Number.isFinite(time)) animations.forEach((animate) => animate(time));
    },
  };
}
