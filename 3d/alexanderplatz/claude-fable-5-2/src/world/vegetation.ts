import * as THREE from 'three';
import { tintMaterial } from '../core/materials';
import { MeshBuilder, xf } from '../core/mesh';
import { hash2, mulberry32 } from '../core/rng';
import { noiseTexture } from '../core/textures';
import { osm } from '../data/osm';
import type { World } from './world';

/** A lumpy leaf mass: an icosphere pushed around by value noise, shaded darker underneath. */
function blob(radius: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.82 + 0.36 * hash2(Math.round(v.x * 31 + seed * 7), Math.round(v.y * 17 + v.z * 13));
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * 0.88, v.z);
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

interface Species {
  blobs: [x: number, y: number, z: number, r: number][];
  trunk: number;
  leaf: number[];
}

/** Crown shapes for a 10 m tree; instances scale them to the mapped or random height. */
const SPECIES: Species[] = [
  // linden: tall dome
  { blobs: [[0, 6.6, 0, 2.9], [1.5, 5.4, 0.6, 2.0], [-1.3, 5.6, -0.9, 2.1], [0.2, 8.3, -0.2, 1.9]], trunk: 4.0, leaf: [0x4f7a34, 0x5a8638, 0x466f30] },
  // plane tree: broad and open
  { blobs: [[0, 6.2, 0, 2.6], [2.3, 6.0, 0.4, 2.2], [-2.1, 6.3, 0.8, 2.3], [0.3, 6.1, -2.3, 2.1], [-0.2, 7.9, 0.1, 2.0]], trunk: 4.4, leaf: [0x64893c, 0x6f9442, 0x587e36] },
  // maple: compact oval
  { blobs: [[0, 6.0, 0, 2.5], [0, 7.9, 0, 2.0], [1.2, 5.2, -0.8, 1.6]], trunk: 3.6, leaf: [0x3f6b33, 0x4a7a3a, 0x557f31] },
];

export function buildVegetation(world: World): void {
  const group = world.layers.trees;
  const rng = mulberry32(131);
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.27, 1, 7).translate(0, 0.5, 0);
  const leafMap = noiseTexture(128, 132, '#ffffff', 'rgba(255,255,255,0.0)', 'rgba(20,50,10,0.22)', 1.4);
  const leafMaterial = tintMaterial({ roughness: 1, metalness: 0, sway: true, map: leafMap });
  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 1 });

  const perSpecies: { x: number; z: number; h: number }[][] = SPECIES.map(() => []);
  for (let i = 0; i < osm.trees.length; i += 3) {
    const x = osm.trees[i];
    const z = osm.trees[i + 1];
    if (world.collision.blocked(x, z)) continue;
    const tagged = osm.trees[i + 2];
    const h = tagged > 3 ? Math.min(tagged, 24) : 8 + rng() * 8.5;
    // rows of street trees share a species: pick by coarse location
    const s = Math.floor(hash2(Math.round(x / 60), Math.round(z / 60)) * SPECIES.length) % SPECIES.length;
    perSpecies[s].push({ x, z, h });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();
  SPECIES.forEach((sp, si) => {
    const list = perSpecies[si];
    if (!list.length) return;
    const b = new MeshBuilder(true);
    sp.blobs.forEach(([x, y, z, r], k) => b.add(blob(r, si * 10 + k), xf(x, y, z, k * 1.7), 0xffffff, { tint: 1, uvScale: [3, 3] }));
    const crown = b.build();
    // ambient shading: leaves low in the crown sit in shade
    const pos = crown.getAttribute('position');
    const col = crown.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const shade = THREE.MathUtils.clamp(0.5 + (pos.getY(i) - 3.6) / 8, 0.5, 1);
      col.setXYZ(i, shade, shade, shade);
    }
    const crowns = new THREE.InstancedMesh(crown, leafMaterial, list.length);
    const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, list.length);
    list.forEach((t, i) => {
      const s = t.h / 10;
      const spread = s * (0.9 + rng() * 0.3);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      crowns.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(spread, s, spread)));
      trunks.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(s * 1.1, sp.trunk * s + 0.6, s * 1.1)));
      colour.setHex(sp.leaf[Math.floor(rng() * sp.leaf.length)]).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06);
      crowns.setColorAt(i, colour);
    });
    for (const mesh of [crowns, trunks]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    crowns.name = `trees-${si}`;
  });
}
