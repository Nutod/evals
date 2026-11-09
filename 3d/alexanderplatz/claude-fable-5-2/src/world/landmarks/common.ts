import * as THREE from 'three';
import { centroid, headingToRotY, obb, toRing, type Obb, type P2 } from '../../core/geo';
import { Frame } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { blotches, canvasTexture, speckle } from '../../core/textures';
import { osm, type LandmarkKey, type OsmLandmarkPart } from '../../data/osm';
import type { World } from '../world';

export const outlineOf = (key: LandmarkKey): P2[] => toRing(osm.landmarks[key].p);
export const holesOf = (key: LandmarkKey): P2[][] => (osm.landmarks[key].hs ?? []).map(toRing);
export const centreOf = (key: LandmarkKey): P2 => centroid(outlineOf(key));

/** The mapped building part closest to a given height, e.g. a tower shaft. */
export function partByHeight(key: LandmarkKey, height: number, minArea = 0): { part: OsmLandmarkPart; ring: P2[]; box: Obb } {
  let best: OsmLandmarkPart | null = null;
  for (const p of osm.landmarks[key].parts) {
    if (p.h == null) continue;
    const box = obb(toRing(p.p));
    if (box.halfL * box.halfW * 4 < minArea) continue;
    if (!best || Math.abs(p.h - height) < Math.abs(best.h! - height)) best = p;
  }
  if (!best) throw new Error(`no part near ${height} m in ${key}`);
  const ring = toRing(best.p);
  return { part: best, ring, box: obb(ring) };
}

/** Local frame of an oriented box: +X along its long axis, +Z to the right of it. */
export const frameOf = (box: Obb): Frame => Frame.plan(box.cx, box.cz, headingToRotY(box.ux, box.uz));

/** Nearest walkable spot to (x, z), for street viewpoints. */
export function freeSpot(world: World, x: number, z: number): [number, number] {
  for (let r = 0; r < 120; r += 3) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r;
      const pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (!world.collision.blocked(px, pz) && !world.collision.blocked(px + 1.5, pz) && !world.collision.blocked(px, pz + 1.5)) return [px, pz];
      if (r === 0) break;
    }
  }
  return [x, z];
}

/**
 * A walkable street viewpoint near `prefer` whose first `clear` metres toward
 * the target are free of buildings, so the landmark is not hidden by a wall.
 */
export function sightSpot(world: World, target: P2, prefer: P2, clear: number): [number, number] {
  for (let r = 0; r < 160; r += 6) {
    for (let a = 0; a < 16; a++) {
      const x = prefer[0] + Math.cos((a / 16) * Math.PI * 2) * r;
      const z = prefer[1] + Math.sin((a / 16) * Math.PI * 2) * r;
      const d = Math.hypot(target[0] - x, target[1] - z);
      if (d < clear * 0.6 || world.collision.blocked(x, z)) continue;
      const k = Math.min(clear, d - 4) / d;
      if (world.collision.clear(x, z, x + (target[0] - x) * k, z + (target[1] - z) * k, 2)) return [x, z];
      if (r === 0) break;
    }
  }
  return freeSpot(world, prefer[0], prefer[1]);
}

export function concreteTexture(seed: number, base = '#cfcac0', boards = 16): THREE.Texture {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 26, 'rgba(70,65,55,0.05)', 130);
    blotches(g, w, h, rng, 16, 'rgba(255,255,250,0.05)', 110);
    speckle(g, w, h, rng, 9000, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.08)', 2);
    // formwork board joints
    g.strokeStyle = 'rgba(60,55,50,0.2)';
    g.lineWidth = 1;
    for (let i = 0; i < boards; i++) {
      g.beginPath();
      g.moveTo((i * w) / boards + 0.5, 0);
      g.lineTo((i * w) / boards + 0.5, h);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,55,50,0.14)';
    for (let j = 0; j < 4; j++) {
      g.beginPath();
      g.moveTo(0, (j * h) / 4 + 0.5);
      g.lineTo(w, (j * h) / 4 + 0.5);
      g.stroke();
    }
  });
}

/** Streaky verdigris for copper roofs and spires. */
export function copperTexture(seed: number): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = '#a9cdbf';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = rng() * w;
      g.fillStyle = rng() > 0.5 ? 'rgba(160,210,190,0.18)' : 'rgba(40,80,70,0.18)';
      g.fillRect(x, 0, 1 + rng() * 5, h);
    }
    g.strokeStyle = 'rgba(30,60,55,0.35)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo((i * w) / 8 + 0.5, 0);
      g.lineTo((i * w) / 8 + 0.5, h);
      g.stroke();
    }
  });
}
