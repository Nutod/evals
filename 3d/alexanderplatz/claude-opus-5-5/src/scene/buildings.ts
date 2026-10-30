import * as THREE from 'three';
import { osm, type OsmBuilding } from '../osm';
import { centroid, hash, MeshBuilder, orient, orientedFrame, rng, signedArea, toRing, type Ring } from '../lib/geom';
import { FACADE_TILE, FACADES, facadeMaps, roofTexture, SHOP_BAY, SHOP_HEIGHT, shopfrontMaps, type FacadeKey } from '../lib/textures';
import { registerNight } from './night';

const PALETTES: Record<FacadeKey, string[]> = {
  plattenbau: ['#f2efe8', '#e9e4d6', '#dfe3e6', '#efe3cf', '#e3dccf', '#d9dde0'],
  plaster: ['#f3e2c0', '#efd6b0', '#e9e2d0', '#f0cfc0', '#dfe0d2', '#f2ead8', '#e8c9a0'],
  office: ['#e8e6e0', '#d8d6d0', '#cfd3d6', '#ede4d4', '#c9c4bb'],
  glass: ['#cfe0ea', '#d8dde2', '#bfd0dc', '#d5d9cf'],
  brick: ['#d08a70', '#c47a62', '#b9806a'],
  stone: ['#f0e2c8', '#e6d6ba', '#ece6da'],
};

function pickStyle(b: OsmBuilding): FacadeKey {
  const mat = (b.mat ?? '').toLowerCase();
  if (mat.includes('glass')) return 'glass';
  if (mat.includes('brick')) return 'brick';
  if (mat.includes('stone')) return 'stone';
  if (mat.includes('concrete')) return 'plattenbau';
  if (mat.includes('metal')) return 'office';
  if (['church', 'cathedral', 'chapel'].includes(b.k)) return 'stone';
  const r = hash(b.id);
  if (b.h >= 35) return r < 0.6 ? 'plattenbau' : r < 0.85 ? 'office' : 'glass';
  return r < 0.38 ? 'plaster' : r < 0.6 ? 'office' : r < 0.8 ? 'plattenbau' : r < 0.9 ? 'stone' : 'glass';
}

function tintFor(b: OsmBuilding, style: FacadeKey): THREE.Color {
  if (b.col && CSS.supports('color', b.col)) return new THREE.Color().setStyle(b.col).lerp(new THREE.Color(1, 1, 1), 0.2);
  const palette = PALETTES[style];
  return new THREE.Color(palette[Math.floor(hash(b.id + 7) * palette.length)]);
}

function roofColor(b: OsmBuilding, pitched: boolean): THREE.Color {
  const c = new THREE.Color();
  if (b.roofCol && CSS.supports('color', b.roofCol)) return c.setStyle(b.roofCol);
  if (b.roof === 'dome' || b.roof === 'pyramidal' || b.roof === 'onion') return c.set('#6f9a86');
  if (pitched) return c.set('#8f5141');
  return c.setHSL(0.08, 0.04, 0.5 + hash(b.id + 3) * 0.12);
}

interface Builders {
  facades: Record<FacadeKey, MeshBuilder>;
  shops: MeshBuilder;
  roofs: MeshBuilder;
}

function addRoofShape(roofs: MeshBuilder, walls: MeshBuilder, b: OsmBuilding, ring: Ring, top: number, rh: number, tileU: number, tileV: number) {
  const c = centroid(ring);
  if (b.roof === 'dome' || b.roof === 'onion') {
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const a0 = (k / steps) * (Math.PI / 2), a1 = ((k + 1) / steps) * (Math.PI / 2);
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const at = (pt: THREE.Vector2, a: number) => new THREE.Vector3(c.x + (pt.x - c.x) * Math.cos(a), top + rh * Math.sin(a), c.y + (pt.y - c.y) * Math.cos(a));
        const outward = new THREE.Vector3(q.y - p.y, 0, -(q.x - p.x)).normalize().add(new THREE.Vector3(0, Math.sin(a0) + 0.01, 0));
        roofs.quad(at(p, a0), at(q, a0), at(q, a1), at(p, a1), undefined, outward);
      }
    }
    return;
  }
  if (b.roof === 'pyramidal') {
    const apex = new THREE.Vector3(c.x, top + rh, c.y);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      roofs.tri(new THREE.Vector3(p.x, top, p.y), new THREE.Vector3(q.x, top, q.y), apex, undefined, undefined, undefined, new THREE.Vector3(q.y - p.y, 0.5, -(q.x - p.x)));
    }
    return;
  }
  // Gabled / hipped family: ridge along the long axis of the bounding rectangle.
  const f = orientedFrame(ring);
  const ax = new THREE.Vector2(Math.cos(f.angle), Math.sin(f.angle));
  const ay = new THREE.Vector2(-ax.y, ax.x);
  const P = (u: number, v: number, y: number) => {
    const p = f.center.clone().addScaledVector(ax, u).addScaledVector(ay, v);
    return new THREE.Vector3(p.x, y, p.y);
  };
  const L = f.length / 2, W = f.width / 2;
  const hip = b.roof === 'hipped' || b.roof === 'side_hipped' ? Math.min(W, L * 0.5) : 0;
  const r0 = P(-L + hip, 0, top + rh), r1 = P(L - hip, 0, top + rh);
  const up = new THREE.Vector3(0, 1, 0);
  const side = (v: number) => new THREE.Vector3(ay.x * v, 0.6, ay.y * v);
  roofs.quad(P(-L, -W, top), P(L, -W, top), r1, r0, undefined, side(-1).add(up));
  roofs.quad(P(L, W, top), P(-L, W, top), r0, r1, undefined, side(1).add(up));
  const endFacing = (u: number) => new THREE.Vector3(ax.x * u, 0.2, ax.y * u);
  if (hip) {
    roofs.tri(P(-L, W, top), P(-L, -W, top), r0, undefined, undefined, undefined, endFacing(-1));
    roofs.tri(P(L, -W, top), P(L, W, top), r1, undefined, undefined, undefined, endFacing(1));
  } else {
    const uv = (u: number, y: number) => new THREE.Vector2(u / tileU, y / tileV);
    walls.tri(P(-L, W, top), P(-L, -W, top), r0, uv(0, top), uv(2 * W, top), uv(W, top + rh), endFacing(-1));
    walls.tri(P(L, -W, top), P(L, W, top), r1, uv(0, top), uv(2 * W, top), uv(W, top + rh), endFacing(1));
  }
}

function addBuilding(b: OsmBuilding, builders: Builders) {
  const style = pickStyle(b);
  const spec = FACADES[style];
  const tileU = spec.bayWidth * FACADE_TILE;
  const tileV = spec.floorHeight * FACADE_TILE;
  const tint = tintFor(b, style);
  const walls = builders.facades[style];
  const holes = (b.inner ?? []).map((f) => orient(toRing(f), true)).filter((r) => r.length >= 3);
  const y0 = b.mh ?? 0;
  const pitched = !!b.roof && ['gabled', 'hipped', 'side_hipped', 'round', 'gambrel', 'mansard'].includes(b.roof);

  for (const flat of b.outer) {
    const ring = orient(toRing(flat));
    if (ring.length < 3) continue;
    const area = signedArea(ring);
    const frame = orientedFrame(ring);
    let rh = 0;
    if (b.roof === 'pyramidal') rh = Math.min(frame.width * 1.6, (b.h - y0) * 0.55);
    else if (b.roof === 'dome' || b.roof === 'onion') rh = Math.min(frame.width / 2, (b.h - y0) * 0.6);
    else if (pitched && area / (frame.length * frame.width) > 0.8) rh = Math.min(frame.width * 0.45, (b.h - y0) * 0.4);
    const top = b.h - rh;

    const shopBand = y0 === 0 && top > 9 && b.k !== 'church' && b.k !== 'part';
    walls.color.copy(tint);
    if (shopBand) {
      builders.shops.walls(ring, 0, SHOP_HEIGHT, SHOP_BAY * 4, SHOP_HEIGHT);
      walls.walls(ring, SHOP_HEIGHT, top, tileU, tileV, SHOP_HEIGHT);
    } else walls.walls(ring, y0, top, tileU, tileV, y0);
    for (const hole of holes) walls.walls(hole, y0, top, tileU, tileV, y0);

    builders.roofs.color.copy(roofColor(b, pitched));
    if (rh > 0) {
      addRoofShape(builders.roofs, walls, b, ring, top, rh, tileU, tileV);
    } else {
      try {
        builders.roofs.polygon(ring, holes, top, 8);
      } catch {
        builders.roofs.polygon(ring, [], top, 8);
      }
      // Parapet and rooftop plant on larger flat roofs.
      if (area > 500 && top > 12) addRooftopPlant(builders.roofs, b, ring, top);
    }
    if (y0 > 0) builders.roofs.polygon(ring, holes, y0, 8, true);
  }
}

function addRooftopPlant(roofs: MeshBuilder, b: OsmBuilding, ring: Ring, top: number) {
  const f = orientedFrame(ring);
  const r = rng(b.id);
  const count = 1 + Math.floor(r() * 3);
  const base = roofs.color.clone();
  for (let i = 0; i < count; i++) {
    const u = (r() - 0.5) * f.length * 0.4;
    const v = (r() - 0.5) * f.width * 0.4;
    const x = f.center.x + Math.cos(f.angle) * u - Math.sin(f.angle) * v;
    const z = f.center.y + Math.sin(f.angle) * u + Math.cos(f.angle) * v;
    const sx = 3 + r() * 6, sz = 2 + r() * 4, sy = 1.5 + r() * 2;
    roofs.color.copy(base).multiplyScalar(0.8 + r() * 0.3);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, top + sy / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -f.angle), new THREE.Vector3(sx, sy, sz));
    roofs.addGeometry(new THREE.BoxGeometry(1, 1, 1), m);
  }
  roofs.color.copy(base);
}

export function buildBuildings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildings';
  const facades = Object.fromEntries((Object.keys(FACADES) as FacadeKey[]).map((k) => [k, new MeshBuilder()])) as Record<FacadeKey, MeshBuilder>;
  const builders: Builders = { facades, shops: new MeshBuilder(), roofs: new MeshBuilder() };
  for (const b of osm.buildings) {
    try {
      addBuilding(b, builders);
    } catch (err) {
      console.warn('skipped building', b.id, err);
    }
  }

  for (const key of Object.keys(facades) as FacadeKey[]) {
    if (!facades[key].vertexCount) continue;
    const maps = facadeMaps(key);
    const material = new THREE.MeshStandardMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      emissiveMap: maps.emissiveMap,
      emissive: 0xffffff,
      vertexColors: true,
      metalness: key === 'glass' ? 0.35 : 0.05,
      envMapIntensity: key === 'glass' ? 1.2 : 0.6,
    });
    registerNight(material, 1.15);
    const mesh = new THREE.Mesh(facades[key].build(), material);
    mesh.name = `facade-${key}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  const shop = shopfrontMaps();
  const shopMaterial = new THREE.MeshStandardMaterial({ map: shop.map, roughnessMap: shop.roughnessMap, emissiveMap: shop.emissiveMap, emissive: 0xffffff, envMapIntensity: 0.7 });
  registerNight(shopMaterial, 1.3);
  const shops = new THREE.Mesh(builders.shops.build(), shopMaterial);
  shops.name = 'shopfronts';
  shops.castShadow = shops.receiveShadow = true;

  const roofs = new THREE.Mesh(builders.roofs.build(), new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.95, side: THREE.FrontSide }));
  roofs.name = 'roofs';
  roofs.castShadow = roofs.receiveShadow = true;
  group.add(shops, roofs);
  return group;
}
