import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const dummy = new THREE.Object3D();
export const color = new THREE.Color();
export const box = new THREE.BoxGeometry(1, 1, 1);
export const sphere = new THREE.SphereGeometry(1, 10, 7);
export const cone = new THREE.ConeGeometry(1, 1, 7);
export const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
export function mesh(
  geometry,
  material,
  parent,
  position = [0, 0, 0],
  scale = [1, 1, 1],
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function instance(geometry, material, count, parent, shadow = true) {
  const m = new THREE.InstancedMesh(geometry, material, count);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function setInstance(
  m,
  i,
  x,
  y,
  z,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0,
  tint,
) {
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(0, ry, 0);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
  if (tint !== undefined) m.setColorAt(i, color.set(tint));
}
export function beam(parent, material, a, b, radius = 0.1, sides = 7) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    delta = end.clone().sub(start);
  const m = mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), sides),
    material,
    parent,
  );
  m.position.copy(start.add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return m;
}
export function archShape(width, height) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height - width / 2);
  s.absarc(0, height - width / 2, width / 2, 0, Math.PI, false);
  s.lineTo(-width / 2, 0);
  return s;
}
export function ribbon(points, widths, material, parent) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      previous = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0],
      dz = next[2] - previous[2],
      len = Math.hypot(dx, dz) || 1;
    const w = typeof widths === "number" ? widths : widths[i];
    positions.push(
      p[0] - (dz / len) * w,
      p[1],
      p[2] + (dx / len) * w,
      p[0] + (dz / len) * w,
      p[1],
      p[2] - (dx / len) * w,
    );
    uvs.push(0, i * 0.2, 1, i * 0.2);
    if (i < points.length - 1) {
      const j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return mesh(g, material, parent);
}
export function roofGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0,
        1, 0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1,
        -0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0,
        1, 0.5, 0, 1, -0.5,
      ],
      3,
    ),
  );
  const uv = [];
  for (let i = 0; i < 6; i++) uv.push(0, 0, 1, 0, 0.5, 1);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const indices = [];
  for (let i = 0; i < 18; i += 3) indices.push(i, i + 2, i + 1);
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(),
    inverse = root.matrixWorld.clone().invert();
  root.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh || Array.isArray(node.material))
      return;
    for (let a = node; a && a !== root; a = a.parent)
      if (a.userData.dynamic) return;
    const key = `${node.material.uuid}:${node.castShadow}:${node.receiveShadow}`;
    const bucket = buckets.get(key) ?? { material: node.material, items: [] };
    const g = node.geometry
      .clone()
      .applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
      );
    g.deleteAttribute("color");
    g.deleteAttribute("aIgnition");
    bucket.items.push({ node, geometry: g.index ? g.toNonIndexed() : g });
    buckets.set(key, bucket);
  });
  for (const { material, items } of buckets.values()) {
    const g = mergeGeometries(items.map((i) => i.geometry));
    if (g) {
      const merged = mesh(g, material, root);
      merged.castShadow = items[0].node.castShadow;
      merged.receiveShadow = items[0].node.receiveShadow;
      items.forEach(({ node, geometry }) => {
        node.removeFromParent();
        geometry.dispose();
      });
    }
  }
}
