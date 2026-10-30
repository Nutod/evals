import * as THREE from 'three';
import { osm } from '../osm';
import { pointInRing, toRing, type Ring } from '../lib/geom';
import { SegmentIndex } from '../lib/segments';
import { EYE_HEIGHT } from '../camera/street';
import { driveEdges } from './streets';

interface Blocker {
  ring: Ring;
  height: number;
  min: THREE.Vector2;
  max: THREE.Vector2;
}

let blockers: Blocker[] | null = null;
let roads: SegmentIndex | null = null;

/** Approximate heights for the hand-modelled landmarks' footprints. */
const LANDMARK_HEIGHTS: Record<string, number> = { parkinn: 15, station: 24, rathaus: 26, marienkirche: 30, fernsehturm: 13, weltzeituhr: 5 };

function getBlockers(): Blocker[] {
  if (blockers) return blockers;
  const rings: [Ring, number][] = [];
  for (const b of osm.buildings) for (const f of b.outer) if (!b.mh) rings.push([toRing(f), b.h]);
  for (const [key, fp] of Object.entries(osm.landmarks)) for (const f of fp.outer) rings.push([toRing(f), LANDMARK_HEIGHTS[key] ?? 20]);
  rings.push([toRing(osm.anchors.parkinnTower), 125]);
  blockers = rings.map(([ring, height]) => {
    const box = new THREE.Box2().setFromPoints(ring);
    return { ring, height, min: box.min, max: box.max };
  });
  return blockers;
}

function segmentsCross(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): number | null {
  const r = b.clone().sub(a), s = d.clone().sub(c);
  const den = r.cross(s);
  if (Math.abs(den) < 1e-9) return null;
  const ca = c.clone().sub(a);
  const t = ca.cross(s) / den, u = ca.cross(r) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** True if a building rises above the sight line from the eye to `target` before reaching `stopAt` (0..1). */
function blocked(eye: THREE.Vector2, target: THREE.Vector3, stopAt: number): boolean {
  const end = new THREE.Vector2(target.x, target.z);
  const lo = eye.clone().min(end), hi = eye.clone().max(end);
  for (const b of getBlockers()) {
    if (b.max.x < lo.x || b.min.x > hi.x || b.max.y < lo.y || b.min.y > hi.y) continue;
    for (let i = 0; i < b.ring.length; i++) {
      const t = segmentsCross(eye, end, b.ring[i], b.ring[(i + 1) % b.ring.length]);
      if (t !== null && t < stopAt && b.height > EYE_HEIGHT + (target.y - EYE_HEIGHT) * t) return true;
    }
  }
  return false;
}

const insideBuilding = (p: THREE.Vector2) =>
  getBlockers().some((b) => p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && pointInRing(p, b.ring));

/**
 * Finds a street-level eye point with a clear view of a landmark, searching
 * around the preferred bearing and distance. Falls back to the preferred point.
 */
export function findViewpoint(center: THREE.Vector2, lookAt: THREE.Vector3, preferred: THREE.Vector2, landmarkRadius: number): THREE.Vector2 {
  roads ??= new SegmentIndex(driveEdges.filter((e) => e.k !== 'service'));
  const offset = preferred.clone().sub(center);
  const distance = offset.length();
  const bearing = Math.atan2(offset.x, -offset.y);
  const extent = new THREE.Vector2(osm.extent[0] - 20, osm.extent[1] - 20);
  for (const scale of [1, 0.8, 1.25, 0.6, 1.6]) {
    for (let k = 0; k <= 12; k++) {
      for (const sign of k ? [1, -1] : [1]) {
        const a = bearing + sign * THREE.MathUtils.degToRad(k * 15);
        const d = distance * scale;
        const eye = new THREE.Vector2(center.x + Math.sin(a) * d, center.y - Math.cos(a) * d);
        if (Math.abs(eye.x) > extent.x || Math.abs(eye.y) > extent.y || insideBuilding(eye)) continue;
        const road = roads.nearest(eye, 20);
        if (road && road.distance < (road.segment.edge.w ?? 7) / 2 + 1) continue;
        // Stop the test just short of the landmark's own footprint.
        if (!blocked(eye, lookAt, Math.max(0, 1 - landmarkRadius / d))) return eye;
      }
    }
  }
  return preferred;
}
