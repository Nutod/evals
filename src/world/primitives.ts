import * as THREE from 'three';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
export const nightMaterials: THREE.MeshStandardMaterial[] = [];

export function material(color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, mat);
  }
  return mat;
}

export function box(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  rotation = 0,
) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(
  parent: THREE.Object3D,
  top: number,
  bottom: number,
  height: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  segments = 32,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function sphere(
  parent: THREE.Object3D,
  radius: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  widthSegments = 32,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, 24), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function beam(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
) {
  const delta = b.clone().sub(a);
  const mesh = cylinder(parent, radius, radius, delta.length(), 0, 0, 0, mat, 6);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

export function sign(
  parent: THREE.Object3D,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  color = '#dfe8e6',
  background = '#233237',
  rotation = 0,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(64, Math.round((1024 * height) / width));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.floor(canvas.height * 0.64)}px sans-serif`;
  ctx.fillText(text, 512, canvas.height * 0.53, 980);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.65,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 0.05,
  });
  nightMaterials.push(mat);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}
