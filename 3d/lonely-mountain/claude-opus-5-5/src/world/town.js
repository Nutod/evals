// Dale's stonework: bell towers with swinging bronze bells, humpbacked bridges,
// quay walls, terrace walls and the worked-stone channel down from the Gate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRIDGES, FALLS_Z, GATE, PLAZA, QUAY_D, QUAY_RISE, TERRACES, TOWERS, TOWN, bankX, riverAt, terraceFront, terraceLevel, townIgnite } from '../core/layout.js';
import { hash01 } from '../core/noise.js';
import { band } from '../core/util.js';
import { stoneMaterial } from './materials.js';

const toNI = (g) => (g.index ? g.toNonIndexed() : g);
const strip = (g) => {
  g = toNI(g);
  g.deleteAttribute('uv');
  return g;
};

function towerGeometry(H) {
  const parts = [];
  const box = (w, h, d, x, y, z) => parts.push(strip(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)));
  box(11.5, 3, 11.5, 0, -1, 0);
  box(9, H - 16, 9, 0, 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1.8, H - 22, 1.8, sx * 4.7, 0, sz * 4.7);
  box(10, 0.8, 10, 0, H - 14.4, 0);
  // Belfry: corner piers framing open arches on every face.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(2.4, 7.6, 2.4, sx * 3.6, H - 13.6, sz * 3.6);
  for (const a of [0, Math.PI / 2]) {
    for (const s of [-1, 1]) {
      const sill = new THREE.BoxGeometry(4.8, 0.7, 1.2).translate(0, H - 13.2, s * 4.2);
      sill.rotateY(a);
      parts.push(strip(sill));
      const arch = new THREE.TorusGeometry(2.4, 0.5, 4, 10, Math.PI).translate(0, H - 8.6, s * 4.2);
      arch.rotateY(a);
      parts.push(strip(arch));
    }
  }
  box(10.4, 1.3, 10.4, 0, H - 6, 0);
  box(11, 0.5, 11, 0, H - 4.7, 0);
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function bellGeometry(r) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    const y = -k * r * 2.1;
    const rad = r * (0.42 + 0.18 * k + 0.55 * Math.pow(k, 4));
    pts.push(new THREE.Vector2(rad, y));
  }
  pts.push(new THREE.Vector2(r * 1.02, -r * 2.15));
  pts.unshift(new THREE.Vector2(0.01, 0.1 * r));
  const g = new THREE.LatheGeometry(pts, 16);
  g.computeVertexNormals();
  return g;
}

function bridgeGeometry(bridge) {
  const ry = riverAt(bridge.z).y;
  const half = QUAY_D + 2;
  const deck = (x) => 4.9 + 4.1 * (1 - (x / half) ** 2);
  const s = new THREE.Shape();
  s.moveTo(-half, -4);
  s.lineTo(half, -4);
  for (let x = half; x >= -half; x -= 2) s.lineTo(x, deck(x));
  s.lineTo(-half, -4);
  const arch = (cx, hw, spring) => {
    const p = new THREE.Path();
    p.moveTo(cx - hw, -4.5);
    p.lineTo(cx + hw, -4.5);
    p.lineTo(cx + hw, spring);
    p.absarc(cx, spring, hw, 0, Math.PI, false);
    p.lineTo(cx - hw, -4.5);
    return p;
  };
  s.holes.push(arch(0, 6.2, 0.6), arch(-11, 3.3, 0.2), arch(11, 3.3, 0.2));
  const body = new THREE.ExtrudeGeometry(s, { depth: 7.4, bevelEnabled: false, curveSegments: 14 });
  body.translate(0, 0, -3.7);
  // Parapets follow the hump of the deck.
  const parts = [strip(body)];
  for (const side of [-1, 1]) {
    const p = new THREE.Shape();
    p.moveTo(-half, deck(-half));
    for (let x = -half; x <= half; x += 2) p.lineTo(x, deck(x));
    for (let x = half; x >= -half; x -= 2) p.lineTo(x, deck(x) + 1.05);
    const pg = new THREE.ExtrudeGeometry(p, { depth: 0.55, bevelEnabled: false });
    pg.translate(0, 0, side * 3.7 - (side > 0 ? 0.55 : 0));
    parts.push(strip(pg));
  }
  const g = mergeGeometries(parts);
  g.rotateY(-Math.atan(riverAt(bridge.z).dx));
  g.translate(bridge.x, ry, bridge.z);
  g.computeVertexNormals();
  bridge.deckY = (x) => ry + deck(Math.max(-half, Math.min(half, x - bridge.x)));
  bridge.half = half;
  return g;
}

/** Wall segments [x, z, rot, length, bottom, top, thickness]. */
function planWalls() {
  const segs = [];
  const seg = (z, d, side, bottom, top, thick = 1.4, len = 4.2) => {
    const r = riverAt(z);
    segs.push([bankX(z, side, d), z, Math.atan(r.dx), len, bottom, top, thick]);
  };
  // The channel of worked stone from the Gate to Dale, and Dale's quays.
  for (let z = GATE.z + 6; z < FALLS_Z - 6; z += 4) {
    const r = riverAt(z);
    const top = z < TOWN.z0 - 8 ? r.y + 3.4 : r.y + QUAY_RISE + 1;
    for (const side of [-1, 1]) seg(z, r.w + 1.1, side, r.y - 3.6, top, 2);
  }
  // Retaining walls at the front of each terrace.
  for (let k = 1; k <= TERRACES; k++) {
    for (let z = TOWN.z0 + 2; z < TOWN.z1 - 4; z += 4) {
      if (hash01(k * 97, Math.floor(z / 4)) < 0.05) continue; // stair gaps
      for (const side of [-1, 1]) {
        if (side > 0 && k >= 2 && k <= 4 && z > PLAZA.z0 - 5 && z < PLAZA.z1 + 5) continue;
        seg(z, terraceFront(k) - 0.6, side, terraceLevel(k - 1, z) - 1.2, terraceLevel(k, z) + 0.9);
      }
    }
  }
  // The square's back wall, cut into the hillside.
  for (let z = PLAZA.z0 - 3; z < PLAZA.z1 + 3; z += 4) seg(z, PLAZA.d1 + 0.6, 1, terraceLevel(1, z) - 1, terraceLevel(4, z) + 0.9, 1.6);
  return segs;
}

export class Town {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'dale-stonework';
    scene.add(this.group);

    // Bell towers.
    this.bells = [];
    this.towers = [];
    for (const [i, t] of TOWERS.entries()) {
      const ign = townIgnite(t.x, t.z);
      const mat = stoneMaterial({
        color: '#d6ccb6',
        blocks: 0.7,
        key: `tower-${i}`,
        ignite: ign.toFixed(3),
        soot: 0.8,
        // A crack opens down one face of every tower by night.
        afterColor: /* glsl */ `
          float crackLine = abs(vObj.x * 0.9 + vObj.z * 0.4 - 1.5 - (lmNoise(vec2(vObj.y * 0.45, ${i}.0 * 7.0)) - 0.5) * 3.2);
          float crack = (1.0 - smoothstep(0.08, 0.32, crackLine)) * step(${(t.h * 0.25).toFixed(1)}, vObj.y) * step(vObj.y, ${(t.h * 0.78).toFixed(1)});
          c = mix(c, vec3(0.01), crack * smoothstep(3.3, 3.9, uT));
        `,
      });
      const tower = new THREE.Mesh(towerGeometry(t.h), mat);
      tower.position.set(t.x, t.y, t.z);
      tower.rotation.y = Math.atan(riverAt(t.z).dx);
      tower.castShadow = tower.receiveShadow = true;
      this.group.add(tower);
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(7.6, 15, 4).rotateY(Math.PI / 4).translate(0, t.h + 3, 0),
        stoneMaterial({ color: '#4f5863', blocks: 0, key: `spire-${i}`, ignite: (ign + 0.1).toFixed(3), soot: 0.75 }),
      );
      spire.castShadow = true;
      tower.add(spire);
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 6).translate(0, t.h + 12, 0), new THREE.MeshStandardMaterial({ color: '#c8913c', metalness: 1, roughness: 0.3 }));
      tower.add(finial);
      // Two bells: one great, one small, on a beam across the belfry.
      const beam = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.6).translate(0, t.h - 7.2, 0), new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.8 }));
      tower.add(beam);
      const bronze = new THREE.MeshStandardMaterial({ color: '#b98146', metalness: 1, roughness: 0.32 });
      for (const [bx, r] of [[-1.6, 1.25], [2.2, 0.8]]) {
        const pivot = new THREE.Group();
        pivot.position.set(bx, t.h - 7.5, 0);
        const bell = new THREE.Mesh(bellGeometry(r), bronze);
        bell.castShadow = true;
        pivot.add(bell);
        tower.add(pivot);
        this.bells.push({ pivot, phase: i * 0.7 + bx, big: r > 1 });
      }
      this.towers.push({ ...t, mesh: tower, top: new THREE.Vector3(t.x, t.y + t.h - 13, t.z) });
    }

    // Bridges.
    const bridgeMat = stoneMaterial({ color: '#cdc3ad', blocks: 0.62, key: 'bridges', ignite: '3.05', soot: 0.5 });
    for (const b of BRIDGES) {
      const mesh = new THREE.Mesh(bridgeGeometry(b), bridgeMat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = b.falls ? 'falls-bridge' : 'bridge';
      this.group.add(mesh);
    }

    // Walls.
    const segs = planWalls();
    const wallMat = stoneMaterial({ color: '#bfb49e', blocks: 0.55, key: 'walls', ignite: `2.78 + clamp((vWorldPos.z - ${TOWN.z0}.0) / 573.0, 0.0, 1.0) * 0.45`, soot: 0.6 });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, segs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    segs.forEach(([x, z, rot, len, bottom, top, thick], i) => {
      walls.setMatrixAt(i, m.compose(new THREE.Vector3(x, (bottom + top) / 2, z), q.setFromAxisAngle(Y, rot), new THREE.Vector3(thick, top - bottom, len)));
    });
    walls.castShadow = walls.receiveShadow = true;
    walls.name = 'walls';
    this.group.add(walls);
  }

  update(S) {
    const t = S.t;
    // Noon: rhythmic market peals. Shadow: an uneasy toll. Circling: wild alarm. Then still.
    const peal = band(t, -1, 0, 0.5, 0.9);
    const toll = band(t, 0.7, 0.95, 1.2, 1.5);
    const alarm = band(t, 1.55, 1.8, 2.5, 2.75);
    for (const b of this.bells) {
      const w = S.time;
      let a = peal * 0.75 * Math.sin(w * (b.big ? 2.2 : 3.1) + b.phase) * (0.6 + 0.4 * Math.sin(w * 0.21 + b.phase));
      a += toll * 0.35 * Math.sin(w * 1.4 + b.phase);
      a += alarm * (1.15 * Math.sin(w * (b.big ? 4.6 : 6.3) + b.phase) + 0.25 * Math.sin(w * 11.3 + b.phase * 3));
      b.pivot.rotation.x = a;
    }
  }
}
