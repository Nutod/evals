import * as THREE from 'three';
import { toRing } from '../core/geo';
import { MeshBuilder } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { blotches, canvasTexture, speckle } from '../core/textures';
import { osm, type AreaKind } from '../data/osm';
import type { World } from './world';

/** Stacking order of flat ground layers; polygon offset keeps them from z-fighting. */
export const GROUND_LEVEL = { area: 1, path: 2, road: 3, bed: 4, marking: 5, rail: 6 } as const;

export function layered<T extends THREE.Material>(material: T, level: number): T {
  material.polygonOffset = true;
  material.polygonOffsetFactor = -level;
  material.polygonOffsetUnits = -level * 4;
  return material;
}

/** y for a ground layer: a few millimetres apart so shadows and close views stay stable. */
export const levelY = (level: number): number => level * 0.012;

function pavingTexture(): THREE.Texture {
  // 4 m tile of 50 cm concrete slabs with staggered joints
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(11);
    g.fillStyle = '#a9a69e';
    g.fillRect(0, 0, w, h);
    const s = w / 8;
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        const v = 172 + Math.floor(rng() * 9);
        g.fillStyle = `rgb(${v + 6},${v + 3},${v - 4})`;
        g.fillRect(((i + (j % 2) * 0.5) % 8) * s + 1, j * s + 1, s - 2, s - 2);
        if ((i + (j % 2) * 0.5) % 8 > 7) g.fillRect(-s / 2 + 1, j * s + 1, s - 2, s - 2);
      }
    }
    blotches(g, w, h, rng, 14, 'rgba(60,60,55,0.10)', 120);
    speckle(g, w, h, rng, 5000, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.10)');
  });
}

function plazaTexture(): THREE.Texture {
  // 6 m tile: large pale granite slabs with a darker band every third course
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(12);
    g.fillStyle = '#8f8c86';
    g.fillRect(0, 0, w, h);
    const rows = 6;
    const s = h / rows;
    for (let j = 0; j < rows; j++) {
      const dark = j % 3 === 0;
      for (let i = 0; i < 4; i++) {
        const v = (dark ? 172 : 184) + Math.floor(rng() * 7);
        g.fillStyle = `rgb(${v + 4},${v + 2},${v - 5})`;
        const x = ((i + (j % 2) * 0.5) * w) / 4;
        g.fillRect(x + 1, j * s + 1, w / 4 - 2, s - 2);
        g.fillRect(x - w + 1, j * s + 1, w / 4 - 2, s - 2);
      }
    }
    speckle(g, w, h, rng, 9000, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.12)');
  });
}

function grassTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(13);
    g.fillStyle = '#58793a';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 26, 'rgba(120,150,60,0.35)', 50);
    blotches(g, w, h, rng, 26, 'rgba(40,70,30,0.35)', 50);
    for (let i = 0; i < 5000; i++) {
      g.strokeStyle = rng() > 0.5 ? 'rgba(150,180,80,0.35)' : 'rgba(30,60,25,0.35)';
      const x = rng() * w;
      const y = rng() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rng() - 0.5) * 3, y - 2 - rng() * 3);
      g.stroke();
    }
  });
}

function flatTexture(seed: number, base: string, light: string, dark: string): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 24, dark, 60);
    blotches(g, w, h, rng, 24, light, 60);
    speckle(g, w, h, rng, 7000, light, dark, 2.5);
  });
}

function waterNormalTexture(): THREE.Texture {
  return canvasTexture(
    256,
    256,
    (g, w, h) => {
      const rng = mulberry32(14);
      g.fillStyle = 'rgb(128,128,255)';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const len = 8 + rng() * 26;
        const tilt = Math.floor(rng() * 50);
        g.strokeStyle = `rgba(${128 + tilt},${128 - tilt},255,0.5)`;
        g.lineWidth = 1 + rng() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y + (rng() - 0.5) * 6, x + len, y);
        g.stroke();
      }
    },
    { srgb: false },
  );
}

const AREA_ORDER: AreaKind[] = ['plaza', 'construction', 'park', 'grass', 'scrub', 'sand', 'water'];

export function buildGround(world: World): void {
  const group = new THREE.Group();
  group.name = 'ground';
  world.scene.add(group);

  // base: everything not otherwise mapped reads as paved city floor
  const paving = pavingTexture();
  const baseSize = 60000;
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(baseSize, baseSize).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: paving, color: 0xd9d6ce, roughness: 0.95, metalness: 0 }),
  );
  paving.repeat.set(baseSize / 4, baseSize / 4);
  base.receiveShadow = true;
  group.add(base);

  const waterNormal = waterNormalTexture();
  const materials: Record<Exclude<AreaKind, 'fountain' | 'platform'>, THREE.MeshStandardMaterial> = {
    plaza: new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.82, color: 0xe6e2da }),
    construction: new THREE.MeshStandardMaterial({ map: flatTexture(15, '#8d7f6c', 'rgba(190,175,150,0.3)', 'rgba(70,60,50,0.3)'), roughness: 1 }),
    park: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, color: 0xf2f5e6 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }),
    scrub: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, color: 0x9fb07a }),
    sand: new THREE.MeshStandardMaterial({ map: flatTexture(16, '#cdb98e', 'rgba(240,225,180,0.3)', 'rgba(150,130,90,0.3)'), roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2e4a52, roughness: 0.22, metalness: 0.75, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35) }),
  };
  const uvScale: Record<string, number> = { plaza: 1 / 6, construction: 1 / 8, park: 1 / 5, grass: 1 / 5, scrub: 1 / 4, sand: 1 / 6, water: 1 / 14 };

  AREA_ORDER.forEach((kind, order) => {
    const b = new MeshBuilder();
    for (const a of osm.areas) {
      if (a.k !== kind) continue;
      b.polygon(toRing(a.p), (a.hs ?? []).map(toRing), levelY(GROUND_LEVEL.area) + order * 0.002, 0xffffff, uvScale[kind]);
    }
    if (!b.vertexCount) return;
    const material = layered(materials[kind as keyof typeof materials], GROUND_LEVEL.area);
    material.polygonOffsetUnits -= order;
    const mesh = b.mesh(material, 'receive');
    mesh.name = `area-${kind}`;
    // vegetation toggles with the trees layer; hard surfaces always show
    (kind === 'park' || kind === 'grass' || kind === 'scrub' ? world.layers.trees : group).add(mesh);
  });

  world.updaters.push((dt) => {
    waterNormal.offset.x += dt * 0.012;
    waterNormal.offset.y += dt * 0.007;
  });
}
