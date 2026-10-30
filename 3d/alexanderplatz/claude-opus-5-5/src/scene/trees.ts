import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { osm } from '../osm';
import { rng } from '../lib/geom';

/** Lumpy crown made from a few displaced blobs, normalised to roughly unit radius. */
function crownGeometry(seed: number, tall: boolean): THREE.BufferGeometry {
  const r = rng(seed);
  const blobs: THREE.BufferGeometry[] = [];
  const n = tall ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(0.62 + r() * 0.2, 1));
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, k);
      v.multiplyScalar(0.85 + r() * 0.3);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    const a = (i / n) * Math.PI * 2;
    g.translate(Math.cos(a) * 0.35, (tall ? i * 0.45 : (i % 2) * 0.3), Math.sin(a) * 0.35);
    blobs.push(g);
  }
  const merged = mergeGeometries(blobs)!;
  if (tall) merged.scale(0.75, 1.3, 0.75);
  merged.computeVertexNormals();
  return merged;
}

export function buildTrees(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trees';
  const count = osm.trees.length / 2;
  const r = rng(77);
  const variants = [crownGeometry(1, false), crownGeometry(2, true)];
  const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 });
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0), trunkMat, count);
  const crowns = variants.map((g) => new THREE.InstancedMesh(g, crownMat, count));
  const counts = [0, 0];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = osm.trees[i * 2], z = osm.trees[i * 2 + 1];
    const size = 0.75 + r() * 0.6;
    const trunkH = 2.6 * size;
    m.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(size, trunkH, size));
    trunk.setMatrixAt(i, m);
    const v = r() < 0.22 ? 1 : 0;
    const radius = (v ? 3 : 4.2) * size;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, trunkH + radius * 0.75, z), q, new THREE.Vector3(radius, radius, radius));
    const k = counts[v]++;
    crowns[v].setMatrixAt(k, m);
    color.setHSL(0.22 + r() * 0.08, 0.35 + r() * 0.2, 0.22 + r() * 0.1);
    crowns[v].setColorAt(k, color);
  }
  crowns.forEach((c, i) => {
    c.count = counts[i];
    c.castShadow = c.receiveShadow = true;
    c.computeBoundingSphere();
  });
  trunk.castShadow = true;
  trunk.computeBoundingSphere();
  group.add(trunk, ...crowns);
  return group;
}
