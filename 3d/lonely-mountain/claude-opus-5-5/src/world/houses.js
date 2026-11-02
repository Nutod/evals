// Dale's houses: pale limestone stacked on terraces up both banks. Bodies, roofs
// and chimneys are instanced; their shaders draw windows, doors, shutters and
// shingles, then soot the walls, light the windows from within, burn the roofs
// through and leave ember beds. Every stage is a function of the hour, so
// scrubbing back un-burns Dale roof by roof.
import * as THREE from 'three';
import { PLAZA, TERRACES, TOWERS, TOWN, BRIDGES, bankX, riverAt, terraceFront, terraceLevel, terrainHeight, townIgnite } from '../core/layout.js';
import { patch } from '../core/shaderlib.js';
import { pick, rng } from '../core/util.js';

const WALLS = ['#ddd2bb', '#d3c7ad', '#e6ddc8', '#cbbfa4', '#d9cbb0', '#c8bba0', '#e0d4ba'];
const ROOFS = ['#56606b', '#4c5560', '#8a4b33', '#7b4430', '#5d4a3a', '#6a5b4c', '#94563a'];
const SHUTTERS = ['#3d5a6b', '#5b6e3c', '#7b3a2c', '#3f4f6a', '#6b5a2e'];

/** Lays out every house in Dale. Returns plain records; meshes are built from these. */
export function planHouses(seed = 11) {
  const rand = rng(seed);
  const houses = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k <= TERRACES; k++) {
      // The quay row (k = 0) only on the west bank, warehouses facing the water.
      if (k === 0 && side > 0) continue;
      let z = TOWN.z0 + 6 + rand() * 6;
      while (z < TOWN.z1 - 10) {
        const w = k === 0 ? 10 + rand() * 6 : 6.5 + rand() * 7;
        const zc = z + w / 2;
        z += w + (rand() < 0.16 ? 4 + rand() * 4 : 0.5 + rand() * 1.2);
        const depth = k === 0 ? 9 : 7.5 + rand() * 5;
        const front = k === 0 ? 17 : terraceFront(k) + 5.5;
        const d = front + depth / 2;
        if (side > 0 && zc > PLAZA.z0 - 4 && zc < PLAZA.z1 + 4 && d - depth / 2 < PLAZA.d1 + 1) continue;
        if (TOWERS.some((t) => t.side === side && Math.abs(t.d - d) < 18 && Math.abs(t.z - zc) < 11)) continue;
        if (k <= 1 && BRIDGES.some((b) => Math.abs(b.z - zc) < w / 2 + 5)) continue;
        if (k === TERRACES && rand() < 0.35) continue;
        const r = riverAt(zc);
        const phi = Math.atan(r.dx);
        const storeys = k === 0 ? 2 : rand() < 0.35 ? 3 : 2;
        const h = storeys * 3.3 + 0.6 + rand() * 0.8;
        houses.push({
          x: bankX(zc, side, d),
          z: zc,
          y: terraceLevel(k, zc),
          w,
          depth,
          h,
          rot: (side > 0 ? -Math.PI / 2 : Math.PI / 2) + phi,
          side,
          k,
          ridgeAlong: k === 0 || rand() < 0.62,
          pitch: 0.42 + rand() * 0.25,
          wall: new THREE.Color(pick(rand, WALLS)),
          roof: new THREE.Color(pick(rand, ROOFS)),
          shutter: new THREE.Color(pick(rand, SHUTTERS)),
          timber: rand() < 0.3 ? 1 : 0,
          seed: rand(),
          ignite: 0,
          chimneys: rand() < 0.85 ? (rand() < 0.4 ? 2 : 1) : 0,
        });
      }
    }
  }
  // Farmsteads and mills scattered on the plain south of the falls.
  for (let i = 0; i < 46; i++) {
    const z = 300 + rand() * 900;
    const r = riverAt(z);
    const side = rand() < 0.5 ? -1 : 1;
    const d = r.w + 30 + rand() * 360;
    const x = r.x + side * d;
    houses.push({
      x, z, y: terrainHeight(x, z) - 0.3, w: 8 + rand() * 8, depth: 7 + rand() * 4, h: 4.2 + rand() * 3, rot: rand() * Math.PI, side, k: -1,
      ridgeAlong: true, pitch: 0.5, wall: new THREE.Color(pick(rand, WALLS)), roof: new THREE.Color(rand() < 0.6 ? '#7d6a48' : pick(rand, ROOFS)),
      shutter: new THREE.Color(pick(rand, SHUTTERS)), timber: 1, seed: rand(), ignite: 0, chimneys: 1,
    });
  }
  for (const h of houses) h.ignite = h.k >= 0 ? townIgnite(h.x, h.z) : 99;
  return houses;
}

const BODY_GLSL = {
  vertexHead: 'attribute vec3 aSize; attribute vec4 aInfo; attribute vec3 aShutter; varying vec3 vSize; varying vec4 vInfo; varying vec3 vLN; varying vec3 vShutter;',
  vertex: 'vSize = aSize; vInfo = aInfo; vLN = normal; vShutter = aShutter;',
  fragmentHead: 'varying vec3 vSize; varying vec4 vInfo; varying vec3 vLN; varying vec3 vShutter;',
};

function bodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  return patch(m, {
    key: 'house-body',
    shade: true,
    ...BODY_GLSL,
    color: /* glsl */ `
      {
        vec3 lp = vObj * vSize;
        vec3 n = vLN;
        float u = abs(n.z) > 0.5 ? lp.x : lp.z;
        float plain = step(5.0, vInfo.z);
        float foot = 5.0 * (1.0 - plain);
        float v = lp.y - foot; // metres above the street
        float dist = length(vWorldPos - uCam);
        float near = 1.0 - smoothstep(250.0, 1100.0, dist);
        vec3 c = diffuseColor.rgb * (0.9 + 0.18 * lmNoise(vWorldPos.xz * 0.7 + v * 0.9));
        // Coursed ashlar.
        float course = smoothstep(0.02, 0.06, abs(fract(v / 0.55) - 0.5) * 0.55);
        c *= mix(1.0, 0.86 + 0.14 * course, near);
        // Half-timbered upper storey.
        if (vInfo.y > 0.5 && v > 3.4) {
          float beam = max(step(abs(fract(u / 1.6) - 0.5), 0.06), step(abs(fract((v - 3.4) / 1.6) - 0.5), 0.05));
          c = mix(c, vec3(0.22, 0.15, 0.10), beam * near);
        }
        float win = 0.0, door = 0.0, shut = 0.0;
        if (abs(n.y) < 0.5) {
          float faceW = abs(n.z) > 0.5 ? vSize.x : vSize.z;
          float cell = fract(u / 2.5 + 0.5);
          float storey = fract(v / 3.3);
          float inStorey = step(0.8, v) * step(v, vSize.y - foot - 0.8) * (1.0 - plain);
          win = step(abs(cell - 0.5), 0.16) * step(abs(storey - 0.55), 0.2) * inStorey * step(abs(u), faceW * 0.5 - 0.9);
          shut = (step(abs(cell - 0.5), 0.27) - step(abs(cell - 0.5), 0.16)) * step(abs(storey - 0.55), 0.2) * inStorey * step(abs(u), faceW * 0.5 - 0.6);
          if (n.z > 0.5 && plain < 0.5) {
            door = step(abs(u - (vInfo.z - 0.5) * 2.0), 0.75) * step(v, 2.5);
            win *= 1.0 - step(v, 3.3) * step(abs(u - (vInfo.z - 0.5) * 2.0), 1.6);
          }
        }
        c = mix(c, vShutter * 0.8, shut * near);
        c = mix(c, vec3(0.04, 0.045, 0.05), win * near);
        c = mix(c, vec3(0.26, 0.17, 0.10), door * near);
        // Soot climbs from the windows as the house burns.
        float burn = lmBurn(vInfo.x);
        float soot = burn * (0.55 + 0.45 * smoothstep(0.0, vSize.y - foot, v + 3.0 * lmNoise(vec2(u * 0.7, v * 0.3))));
        c = mix(c, vec3(0.05, 0.043, 0.038), soot * 0.92);
        // Top face: an ember bed once the roof has gone.
        if (n.y > 0.5 && plain < 0.5) c = mix(vec3(0.08, 0.06, 0.05), vec3(0.4, 0.38, 0.36), uAsh * 0.6);
        diffuseColor.rgb = c;
        vWinMask = max(win, door * 0.6) * near + (1.0 - near) * 0.18;
      }
    `,
    emissive: /* glsl */ `
      {
        float em = lmEmber(vInfo.x);
        if (em > 0.001) {
          vec3 lp = vObj * vSize;
          float flick = 0.7 + 0.3 * sin(uTime * 9.0 + vInfo.w * 40.0 + lp.x) * sin(uTime * 5.3 + lp.y);
          totalEmissiveRadiance += lmFireColor(0.6) * vWinMask * em * flick * 5.0;
          if (vLN.y > 0.5 && vInfo.z < 5.0) {
            float cracks = pow(lmNoise(lp.xz * 1.3 + uTime * 0.2), 3.0);
            totalEmissiveRadiance += lmFireColor(cracks) * cracks * lmEmber(vInfo.x + 0.25) * 6.0;
          }
        }
      }
    `,
    fragmentHead: BODY_GLSL.fragmentHead + ' float vWinMask = 0.0;',
  });
}

function roofMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  return patch(m, {
    key: 'house-roof',
    shade: true,
    vertexHead: 'attribute vec3 aSize; attribute vec4 aInfo; varying vec3 vSize; varying vec4 vInfo;',
    vertex: /* glsl */ `
      vSize = aSize; vInfo = aInfo;
      float collapse = smoothstep(aInfo.x + 0.3, aInfo.x + 0.75, uT);
      transformed.y *= 1.0 - 0.92 * collapse;
      transformed.y -= collapse * 0.08;
    `,
    fragmentHead: 'varying vec3 vSize; varying vec4 vInfo;',
    color: /* glsl */ `
      {
        vec3 lp = vObj * vSize;
        float burn = lmBurn(vInfo.x);
        float holes = lmNoise(lp.xz * 0.9 + vInfo.w * 31.0);
        if (holes < smoothstep(vInfo.x + 0.08, vInfo.x + 0.7, uT) * 1.05) discard;
        float dist = length(vWorldPos - uCam);
        float near = 1.0 - smoothstep(200.0, 1000.0, dist);
        float row = abs(fract(lp.y / 0.32) - 0.5);
        float tile = abs(fract(lp.x / 0.45 + floor(lp.y / 0.32) * 0.5) - 0.5);
        float shingle = 0.8 + 0.2 * smoothstep(0.0, 0.12, row) * smoothstep(0.0, 0.08, tile);
        vec3 c = diffuseColor.rgb * mix(1.0, shingle, near) * (0.85 + 0.3 * lmNoise(lp.xz * 1.9 + vInfo.w * 9.0));
        c = mix(c, vec3(0.045, 0.038, 0.034), burn * 0.95);
        diffuseColor.rgb = c;
      }
    `,
    emissive: /* glsl */ `
      {
        float em = lmEmber(vInfo.x);
        if (em > 0.001) {
          vec3 lp = vObj * vSize;
          float n = lmNoise(lp.xz * 1.4 + vec2(0.0, uTime * 0.6));
          totalEmissiveRadiance += lmFireColor(n) * pow(n, 2.0) * em * 7.0;
        }
      }
    `,
  });
}

function prism() {
  // Gable roof: ridge along local x, base 1 x 1 at y = 0, apex at y = 1, with a little eave.
  const g = new THREE.BufferGeometry();
  const e = 0.56;
  const v = [
    // two slopes
    -e, 0, e, e, 0, e, e, 1, 0, -e, 0, e, e, 1, 0, -e, 1, 0,
    e, 0, -e, -e, 0, -e, -e, 1, 0, e, 0, -e, -e, 1, 0, e, 1, 0,
    // gable ends
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class Houses {
  constructor(scene, houses) {
    this.houses = houses;
    const n = houses.length;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.bodies = new THREE.InstancedMesh(box, bodyMaterial(), n);
    this.roofs = new THREE.InstancedMesh(prism(), roofMaterial(), n);
    const size = new Float32Array(n * 3), info = new Float32Array(n * 4), shutter = new Float32Array(n * 3);
    const rsize = new Float32Array(n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    this.doors = [];
    this.chimneyTops = [];
    const chimneys = [];
    houses.forEach((h, i) => {
      const foot = 5;
      q.setFromAxisAngle(Y, h.rot);
      p.set(h.x, h.y - foot, h.z);
      s.set(h.w, h.h + foot, h.depth);
      this.bodies.setMatrixAt(i, m.compose(p, q, s));
      this.bodies.setColorAt(i, h.wall);
      size.set([h.w, h.h + foot, h.depth], i * 3);
      info.set([h.ignite, h.timber, 0.25 + h.seed * 0.5, h.seed], i * 4);
      shutter.set([h.shutter.r, h.shutter.g, h.shutter.b], i * 3);
      // Roof.
      const span = h.ridgeAlong ? h.depth : h.w;
      const len = h.ridgeAlong ? h.w : h.depth;
      const rq = q.clone();
      if (!h.ridgeAlong) rq.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2));
      const rh = span * h.pitch;
      p.set(h.x, h.y + h.h, h.z);
      s.set(len + 0.6, rh, span + 0.4);
      this.roofs.setMatrixAt(i, m.compose(p, rq, s));
      this.roofs.setColorAt(i, h.roof);
      rsize.set([len + 0.6, rh, span + 0.4], i * 3);
      // Front door, facing the street.
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const off = (0.25 + h.seed * 0.5 - 0.5) * 2;
      this.doors.push({ x: h.x + fwd.x * (h.depth / 2 + 0.6) + right.x * off, y: h.y, z: h.z + fwd.z * (h.depth / 2 + 0.6) + right.z * off, house: i, k: h.k });
      for (let c = 0; c < h.chimneys; c++) {
        const along = (c === 0 ? 0.3 : -0.3) * (h.ridgeAlong ? h.w : h.depth);
        const dir = h.ridgeAlong ? right : fwd;
        const cx = h.x + dir.x * along + (h.ridgeAlong ? fwd.x : right.x) * span * 0.18;
        const cz = h.z + dir.z * along + (h.ridgeAlong ? fwd.z : right.z) * span * 0.18;
        const top = h.y + h.h + rh * 0.62 + 1.6;
        chimneys.push({ x: cx, z: cz, base: h.y + h.h, top, rot: h.rot, ignite: h.ignite });
        this.chimneyTops.push({ x: cx, y: top + 0.4, z: cz, ignite: h.ignite, k: h.k });
      }
    });
    const ia = (mesh, name, arr, size) => mesh.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size));
    ia(this.bodies, 'aSize', size, 3);
    ia(this.bodies, 'aInfo', info, 4);
    ia(this.bodies, 'aShutter', shutter, 3);
    ia(this.roofs, 'aSize', rsize, 3);
    ia(this.roofs, 'aInfo', info.slice(), 4);
    for (const mesh of [this.bodies, this.roofs]) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
    this.bodies.name = 'houses';
    this.roofs.name = 'roofs';

    // Chimneys with their pots.
    const cg = new THREE.BoxGeometry(0.9, 1, 0.9);
    cg.translate(0, 0.5, 0);
    const chim = new THREE.InstancedMesh(cg, bodyMaterial(), chimneys.length);
    const csize = new Float32Array(chimneys.length * 3), cinfo = new Float32Array(chimneys.length * 4), cshut = new Float32Array(chimneys.length * 3);
    const potg = new THREE.CylinderGeometry(0.22, 0.26, 0.7, 7);
    potg.translate(0, 0.35, 0);
    const pots = new THREE.InstancedMesh(potg, new THREE.MeshStandardMaterial({ color: '#8a5a40', roughness: 0.8 }), chimneys.length * 2);
    chimneys.forEach((c, i) => {
      const hgt = c.top - c.base;
      chim.setMatrixAt(i, m.compose(p.set(c.x, c.base, c.z), q.setFromAxisAngle(Y, c.rot), s.set(0.9, hgt, 0.9)));
      chim.setColorAt(i, new THREE.Color('#9c8f7c'));
      csize.set([0.9, hgt, 0.9], i * 3);
      cinfo.set([c.ignite + 0.5, 0, 9, 0], i * 4);
      for (const o of [-0.2, 0.2]) {
        const r = new THREE.Vector3(o, 0, 0).applyQuaternion(q);
        pots.setMatrixAt(i * 2 + (o > 0 ? 1 : 0), m.compose(p.set(c.x + r.x, c.top, c.z + r.z), q, s.set(1, 1, 1)));
      }
    });
    ia(chim, 'aSize', csize, 3);
    ia(chim, 'aInfo', cinfo, 4);
    ia(chim, 'aShutter', cshut, 3);
    chim.castShadow = pots.castShadow = true;
    scene.add(chim, pots);
  }
}
