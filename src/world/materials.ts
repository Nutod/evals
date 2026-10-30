import * as THREE from 'three';
import { seededRandom } from './geo';
import { nightMaterials } from './primitives';

export function facadeMaterial(base: string, seed: number, modern = false) {
  const random = seededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = 512;
  lightCanvas.height = 512;
  const glow = lightCanvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  glow.fillStyle = '#000000';
  glow.fillRect(0, 0, 512, 512);
  const columns = modern ? 12 : 8;
  const rows = modern ? 12 : 8;
  const w = 512 / columns,
    h = 512 / rows;
  for (let row = 0; row < rows; row++) {
    ctx.fillStyle = modern ? '#879593' : '#b9b6aa';
    ctx.fillRect(0, row * h, 512, modern ? 3 : 2);
    for (let col = 0; col < columns; col++) {
      const x = col * w + (modern ? 3 : w * 0.22);
      const y = row * h + (modern ? 4 : h * 0.15);
      const ww = modern ? w - 6 : w * 0.56;
      const hh = modern ? h - 7 : h * 0.64;
      ctx.fillStyle = '#c4c4b7';
      ctx.fillRect(x - 2, y - 2, ww + 4, hh + 4);
      const tone = Math.floor(random() * 28);
      ctx.fillStyle = `rgb(${56 + tone},${73 + tone},${78 + tone})`;
      ctx.fillRect(x, y, ww, hh);
      ctx.fillStyle = 'rgba(180,204,205,0.3)';
      ctx.fillRect(x + 1, y + 1, ww - 2, hh * 0.18);
      ctx.fillStyle = '#9ca5a0';
      ctx.fillRect(x + ww * 0.5, y, 1.7, hh);
      if (!modern) ctx.fillRect(x, y + hh * 0.38, ww, 1.7);
      if (random() > 0.62) {
        glow.fillStyle = random() > 0.4 ? '#dcb67b' : '#b4cacb';
        glow.fillRect(x + 1, y + 1, ww - 2, hh - 2);
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / (modern ? 30 : 24), 1 / (modern ? 36 : 27));
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(lightCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.copy(map.repeat);
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: modern ? 0.5 : 0.88,
    metalness: modern ? 0.18 : 0,
    emissive: '#ffffff',
    emissiveMap,
    emissiveIntensity: 0.01,
  });
  nightMaterials.push(mat);
  return mat;
}

export function pavingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b1afa4';
  ctx.fillRect(0, 0, 512, 512);
  const random = seededRandom(383);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const tone = 160 + Math.floor(random() * 28);
      ctx.fillStyle = `rgb(${tone + 9},${tone + 8},${tone})`;
      ctx.fillRect(x * 32 + 0.8, y * 32 + 0.8, 30.4, 30.4);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1 / 22, 1 / 22);
  map.anisotropy = 8;
  return map;
}
