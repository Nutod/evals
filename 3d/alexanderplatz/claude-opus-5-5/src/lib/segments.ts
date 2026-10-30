import * as THREE from 'three';
import type { OsmEdge } from '../osm';

export interface Segment {
  a: THREE.Vector2;
  b: THREE.Vector2;
  edge: OsmEdge;
}

export interface Nearest {
  segment: Segment;
  distance: number;
  point: THREE.Vector2;
  /** Unit direction of the segment. */
  direction: THREE.Vector2;
}

/** Uniform grid over polyline segments for nearest-line queries. */
export class SegmentIndex {
  private cells = new Map<string, Segment[]>();

  constructor(edges: OsmEdge[], private cell = 25) {
    for (const edge of edges) {
      for (let i = 0; i < edge.p.length - 2; i += 2) {
        const seg = { a: new THREE.Vector2(edge.p[i], edge.p[i + 1]), b: new THREE.Vector2(edge.p[i + 2], edge.p[i + 3]), edge };
        const x0 = Math.floor(Math.min(seg.a.x, seg.b.x) / cell), x1 = Math.floor(Math.max(seg.a.x, seg.b.x) / cell);
        const z0 = Math.floor(Math.min(seg.a.y, seg.b.y) / cell), z1 = Math.floor(Math.max(seg.a.y, seg.b.y) / cell);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const key = `${x},${z}`;
          const list = this.cells.get(key);
          if (list) list.push(seg); else this.cells.set(key, [seg]);
        }
      }
    }
  }

  nearest(p: THREE.Vector2, maxDistance = 40, filter?: (s: Segment) => boolean): Nearest | null {
    const r = Math.ceil(maxDistance / this.cell);
    const cx = Math.floor(p.x / this.cell), cz = Math.floor(p.y / this.cell);
    let best: Nearest | null = null;
    const ab = new THREE.Vector2();
    for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
      for (const s of this.cells.get(`${x},${z}`) ?? []) {
        if (filter && !filter(s)) continue;
        ab.subVectors(s.b, s.a);
        const len2 = ab.lengthSq();
        if (len2 < 1e-9) continue;
        const t = THREE.MathUtils.clamp(((p.x - s.a.x) * ab.x + (p.y - s.a.y) * ab.y) / len2, 0, 1);
        const point = new THREE.Vector2(s.a.x + ab.x * t, s.a.y + ab.y * t);
        const distance = point.distanceTo(p);
        if (distance <= maxDistance && (!best || distance < best.distance)) {
          best = { segment: s, distance, point, direction: ab.clone().normalize() };
        }
      }
    }
    return best;
  }
}
