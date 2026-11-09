import * as THREE from 'three';
import { obb, pointInRing, ringArea, toRing, type P2 } from '../core/geo';
import { MeshBuilder, xf } from '../core/mesh';
import { hash2, mulberry32, type Rng } from '../core/rng';
import { noiseTexture } from '../core/textures';
import { osm, type OsmBuilding } from '../data/osm';
import { createFacades, type Facade, type FacadeId } from './facades';
import type { World } from './world';

const PALETTES: Record<string, number[]> = {
  plaster: [0xe9dcc3, 0xd9c7a6, 0xe6d3b8, 0xcdbfa8, 0xe3e0d6, 0xd8b99a, 0xc9b7a1, 0xe8cfa9, 0xbfc5c1, 0xdcc9b6],
  panel: [0xd8d5cb, 0xcfc8b8, 0xe0dccf, 0xc4c2ba, 0xd9cdb5, 0xbdc4c6],
  glass: [0xe3edf3, 0xd5e2e8, 0xe6eeea, 0xcfdde6, 0xeef0ec, 0xd9e6e0],
  brick: [0xa6533c, 0x95482f, 0xb0664a, 0x8c4a3b, 0xb9774f],
  stone: [0xd6c8ab, 0xcbbd9f, 0xddd2bb, 0xc2b59b],
  grid: [0xdedbd2, 0xc9c6bd, 0xe7e2d6, 0xb9b6ae, 0xd3c9b8],
  plain: [0xb9b7b0, 0xa7a9a8, 0xc6c1b6, 0x9c9d9b],
};

const NAMED_COLOURS: Record<string, number> = {
  white: 0xeeeeea, grey: 0x9a9a98, gray: 0x9a9a98, lightgrey: 0xcfcfcb, lightgray: 0xcfcfcb, darkgrey: 0x5e6063, darkgray: 0x5e6063,
  black: 0x2c2d30, red: 0xa8463a, brown: 0x7c5a44, beige: 0xdccfb2, yellow: 0xe2c56a, orange: 0xcf8a4a, green: 0x6f8f6a,
  blue: 0x6f8fb2, pink: 0xd9a6a6, silver: 0xb7bcc0, tan: 0xc8b08a, maroon: 0x7b3a34, cream: 0xe9e0c8, ivory: 0xebe6d6,
};

function parseColour(value: string | undefined): THREE.Color | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in NAMED_COLOURS) return new THREE.Color(NAMED_COLOURS[v]);
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) {
    const c = new THREE.Color(v);
    // OSM colours are often fully saturated; pull them toward believable paint
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h, Math.min(hsl.s, 0.55), THREE.MathUtils.clamp(hsl.l, 0.16, 0.86));
  }
  return null;
}

function chooseFacade(b: OsmBuilding, seed: number): FacadeId {
  const h = b.h - (b.mh ?? 0);
  const material = b.m ?? '';
  if (['garage', 'garages', 'shed', 'roof', 'service', 'kiosk', 'transformer_tower', 'hut', 'carport'].includes(b.k) || h < 4.5) return 'plain';
  if (material === 'glass') return 'glass';
  if (material === 'brick') return 'brick';
  if (['stone', 'sandstone', 'limestone'].includes(material)) return 'stone';
  if (['concrete', 'panel'].includes(material)) return b.k === 'apartments' || b.k === 'residential' ? 'panel' : 'grid';
  if (material === 'plaster') return 'plaster';
  switch (b.k) {
    case 'apartments':
    case 'residential':
    case 'dormitory':
      return h > 24 ? 'panel' : seed < 0.75 ? 'plaster' : 'panel';
    case 'office':
    case 'commercial':
    case 'hotel':
      return h > 30 ? (seed < 0.6 ? 'glass' : 'grid') : seed < 0.35 ? 'glass' : seed < 0.8 ? 'grid' : 'stone';
    case 'retail':
    case 'supermarket':
      return seed < 0.5 ? 'grid' : 'glass';
    case 'church':
    case 'cathedral':
    case 'chapel':
      return 'brick';
    case 'public':
    case 'government':
    case 'civic':
    case 'university':
    case 'school':
    case 'museum':
      return seed < 0.6 ? 'stone' : 'grid';
    case 'industrial':
    case 'warehouse':
    case 'parking':
      return 'plain';
    default:
      return h > 34 ? 'grid' : seed < 0.55 ? 'plaster' : seed < 0.8 ? 'grid' : 'stone';
  }
}

const GROUND_BAND = 4.3;

function groundFacade(b: OsmBuilding, upper: FacadeId): FacadeId | null {
  if (upper === 'plain' || (b.mh ?? 0) > 0 || b.h < 9.5) return null;
  if (['church', 'cathedral', 'chapel'].includes(b.k)) return null;
  return ['apartments', 'residential', 'dormitory'].includes(b.k) && upper !== 'panel' ? 'base' : 'shop';
}

/** Vertical wall ring with window-aligned UVs. Bake orientation puts the outside on the left of every edge. */
export function walls(b: MeshBuilder, ring: P2[], y0: number, y1: number, f: Pick<Facade, 'tileW'>, colour: THREE.Color, u0: number, v0: number, floors: number): void {
  let u = u0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 0.05) continue;
    // whole tiles per wall, so windows never straddle a corner
    const tiles = len < f.tileW * 0.6 ? 0.04 : Math.max(1, Math.round(len / f.tileW));
    b.quad([q[0], y0, q[1]], [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], colour, [u + tiles, v0, u, v0 + floors]);
    u += Math.ceil(tiles);
  }
}

function addPitchedRoof(b: MeshBuilder, ring: P2[], y: number, rise: number, hipped: boolean, colour: THREE.Color): void {
  const o = obb(ring);
  const corner = (su: number, sv: number, h: number): [number, number, number] => [o.cx + o.ux * su + o.vx * sv, y + h, o.cz + o.uz * su + o.vz * sv];
  const L = o.halfL;
  const W = o.halfW;
  const r = hipped ? Math.max(0, L - W) : L;
  const a = corner(-L, -W, 0);
  const bq = corner(L, -W, 0);
  const c = corner(L, W, 0);
  const d = corner(-L, W, 0);
  const r0 = corner(-r, 0, rise);
  const r1 = corner(r, 0, rise);
  const uv: [number, number, number, number] = [0, 0, (2 * L) / 3, W / 1.5];
  // v points to the right of u, so the +v eave runs d→c and the -v eave a→b
  b.quad(d, c, r1, r0, colour, uv);
  b.quad(bq, a, r0, r1, colour, uv);
  b.tri(a, d, r0, colour);
  b.tri(c, bq, r1, colour);
}

function addRoofClutter(b: MeshBuilder, ring: P2[], y: number, rng: Rng, area: number): void {
  const o = obb(ring);
  const count = Math.min(7, Math.floor(area / 380) + (rng() < 0.6 ? 1 : 0));
  for (let i = 0; i < count; i++) {
    const su = (rng() - 0.5) * 1.5 * o.halfL;
    const sv = (rng() - 0.5) * 1.3 * o.halfW;
    const x = o.cx + o.ux * su + o.vx * sv;
    const z = o.cz + o.uz * su + o.vz * sv;
    const w = 2 + rng() * 5;
    const d = 2 + rng() * 4;
    const reach = Math.max(w, d) * 0.75;
    // keep units clear of the parapet and of courtyards
    if (![[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i2, j2]) => pointInRing(x + i2 * reach, z + j2 * reach, ring))) continue;
    const h = 1 + rng() * 2.2;
    const rot = Math.atan2(-o.uz, o.ux);
    b.box(w, h, d, xf(x, y + h / 2, z, rot), rng() < 0.5 ? 0x9a9c9e : 0x77797c);
    if (rng() < 0.4) b.box(w * 0.5, 0.5, d * 0.5, xf(x, y + h + 0.25, z, rot), 0x5c5e61);
  }
}

export interface BuildingsInfo {
  count: number;
  named: { name: string; x: number; z: number; h: number }[];
}

export function buildBuildings(world: World): BuildingsInfo {
  const facades = createFacades();
  const wallBuilders = new Map<FacadeId, MeshBuilder>();
  const wb = (id: FacadeId): MeshBuilder => {
    let b = wallBuilders.get(id);
    if (!b) wallBuilders.set(id, (b = new MeshBuilder()));
    return b;
  };
  const roofs = new MeshBuilder();
  const tiles = new MeshBuilder();
  const named: BuildingsInfo['named'] = [];

  for (const data of osm.buildings) {
    const ring = toRing(data.p);
    if (ring.length < 3) continue;
    const holes = (data.hs ?? []).map(toRing);
    const [cx, cz] = ring.reduce<P2>((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    const seed = hash2(cx, cz);
    const rng = mulberry32(Math.floor(seed * 1e9));
    const area = Math.abs(ringArea(ring));
    const base = data.mh ?? 0;
    const pitched = !!data.rs && ['gabled', 'hipped', 'pyramidal', 'half-hipped', 'mansard', 'gambrel'].includes(data.rs);
    const rise = pitched ? Math.min(data.rh || 3.5, (data.h - base) * 0.45) : 0;
    const top = data.h - rise;
    if (data.n && area > 250) named.push({ name: data.n, x: cx, z: cz, h: data.h });

    const upperId = chooseFacade(data, seed);
    const upper = facades[upperId];
    const colour = parseColour(data.c) ?? new THREE.Color(PALETTES[upperId][Math.floor(rng() * PALETTES[upperId].length)]);
    colour.offsetHSL(0, 0, (rng() - 0.5) * 0.06);

    const groundId = groundFacade(data, upperId);
    const u0 = Math.floor(rng() * 40);
    const v0 = Math.floor(rng() * 40);
    const split = groundId ? base + GROUND_BAND : base;
    const floors = Math.max(1, Math.round((top - split) / upper.floorH));
    for (const r of [ring, ...holes]) {
      if (groundId) walls(wb(groundId), r, base, split, facades[groundId], colour, u0, v0, 1);
      walls(wb(upperId), r, split, top, upper, colour, u0, v0, floors);
    }

    // roof
    const roofColour = parseColour(data.rc) ?? new THREE.Color(pitched ? 0x8c4b3a : [0x6b6d70, 0x5d5f63, 0x77756f, 0x696660][Math.floor(rng() * 4)]);
    roofColour.offsetHSL(0, 0, (rng() - 0.5) * 0.05);
    const parapet = pitched || top - base < 6 ? 0 : 0.45;
    if (pitched && data.rs === 'pyramidal') {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        tiles.tri([q[0], top, q[1]], [p[0], top, p[1]], [cx, top + rise, cz], roofColour, [0, 0, 1, 0, 0.5, 1]);
      }
    } else if (pitched && holes.length === 0 && area / (obb(ring).halfL * obb(ring).halfW * 4) > 0.72) {
      addPitchedRoof(tiles, ring, top, rise, data.rs !== 'gabled', roofColour);
      roofs.polygon(ring, holes, top - 0.05, roofColour, 0.2);
    } else {
      const y = pitched ? data.h - rise * 0.5 : top - parapet;
      roofs.polygon(ring, holes, y, roofColour, 0.2);
      if (pitched) {
        // irregular pitched roofs fall back to a raised flat deck with a fascia
        for (const r of [ring, ...holes]) walls(wb('plain'), r, top, y, facades.plain, roofColour, 0, 0, 0.1);
      } else if (area > 260 && top - base > 8) {
        addRoofClutter(roofs, ring, y, rng, area);
      }
    }
    if (data.rs === 'dome' || data.rs === 'onion') {
      const o = obb(ring);
      const r = o.halfW * 0.92;
      roofs.add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), xf(o.cx, top - parapet, o.cz, 0, 0, 0, [1, Math.max(0.5, (data.rh || r) / r), 1]), roofColour);
    }
    if (base > 0) roofs.polygon(ring, holes, base, 0x8a8a88, 0.2, false);
  }

  const group = world.layers.buildings;
  for (const [id, b] of wallBuilders) {
    const mesh = b.mesh(facades[id].material);
    mesh.name = `walls-${id}`;
    group.add(mesh);
  }
  const roofMap = noiseTexture(256, 41, '#dedede', 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.08)', 0.8);
  const roofMesh = roofs.mesh(new THREE.MeshStandardMaterial({ map: roofMap, vertexColors: true, roughness: 0.95 }));
  roofMesh.name = 'roofs';
  const tileMesh = tiles.mesh(new THREE.MeshStandardMaterial({ map: roofMap, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  tileMesh.name = 'pitched-roofs';
  group.add(roofMesh, tileMesh);

  return { count: osm.buildings.length, named };
}
