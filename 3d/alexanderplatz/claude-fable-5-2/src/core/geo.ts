/** Plan-view point: x is metres east, z is metres south of the scene origin. */
export type P2 = [number, number];

export function toRing(flat: readonly number[]): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

/** Signed area. Positive rings keep their interior on the right of each edge. */
export function ringArea(r: readonly P2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

export function centroid(r: readonly P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}

export function pointInRing(x: number, z: number, r: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0];
    const zi = r[i][1];
    const xj = r[j][0];
    const zj = r[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Oriented bounding box. `u` is the unit long axis, `v` is u turned right. */
export interface Obb {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  halfL: number;
  halfW: number;
}

export function obb(pts: readonly P2[]): Obb {
  let best: Obb | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) continue;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of pts) {
      const u = p[0] * ux + p[1] * uz;
      const v = -p[0] * uz + p[1] * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const long = maxU - minU >= maxV - minV;
      best = {
        cx: cu * ux - cv * uz,
        cz: cu * uz + cv * ux,
        ux: long ? ux : -uz,
        uz: long ? uz : ux,
        vx: long ? -uz : -ux,
        vz: long ? ux : -uz,
        halfL: Math.max(maxU - minU, maxV - minV) / 2,
        halfW: Math.min(maxU - minU, maxV - minV) / 2,
      };
    }
  }
  if (!best) throw new Error('degenerate polygon');
  return best;
}

/** Rotation about +Y that turns the +X axis onto the plan direction (tx, tz). */
export const headingToRotY = (tx: number, tz: number): number => Math.atan2(-tz, tx);

export interface PathSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/** Arc-length parameterised polyline. */
export class Polyline {
  readonly pts: P2[];
  readonly cum: number[];
  readonly length: number;
  private hint = 0;

  constructor(pts: P2[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  at(s: number, out: PathSample = { x: 0, z: 0, tx: 1, tz: 0 }): PathSample {
    const { pts, cum } = this;
    const d = Math.max(0, Math.min(this.length, s));
    let i = Math.min(this.hint, pts.length - 2);
    while (i > 0 && cum[i] > d) i--;
    while (i < pts.length - 2 && cum[i + 1] < d) i++;
    this.hint = i;
    const seg = cum[i + 1] - cum[i] || 1;
    const t = (d - cum[i]) / seg;
    const a = pts[i];
    const b = pts[i + 1];
    out.x = a[0] + (b[0] - a[0]) * t;
    out.z = a[1] + (b[1] - a[1]) * t;
    out.tx = (b[0] - a[0]) / seg;
    out.tz = (b[1] - a[1]) / seg;
    return out;
  }

  /** Arc length of the point on the line closest to (x, z), and its distance. */
  project(x: number, z: number): { s: number; dist: number } {
    let bestS = 0;
    let bestD = Infinity;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1];
      const b = this.pts[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < bestD) {
        bestD = d;
        bestS = this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]);
      }
    }
    return { s: bestS, dist: bestD };
  }
}

/** Shifts a polyline sideways; positive distances go to the right of travel. */
export function offsetPolyline(pts: readonly P2[], d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = 0;
    let nz = 0;
    if (i > 0) {
      const l = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
      nx += -(p[1] - a[1]) / l;
      nz += (p[0] - a[0]) / l;
    }
    if (i < pts.length - 1) {
      const l = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
      nx += -(b[1] - p[1]) / l;
      nz += (b[0] - p[0]) / l;
    }
    const l = Math.hypot(nx, nz) || 1;
    // widen at corners so the offset stays parallel, capped for sharp turns
    const miter = i > 0 && i < pts.length - 1 ? Math.min(2, 2 / l) : 1;
    out.push([p[0] + (nx / l) * d * miter, p[1] + (nz / l) * d * miter]);
  }
  return out;
}

export interface SegmentHit<T> {
  dist: number;
  /** Closest point on the segment. */
  x: number;
  z: number;
  /** Unit direction of the segment. */
  tx: number;
  tz: number;
  data: T;
}

/** Grid of line segments for "what street is this next to" queries. */
export class SegmentIndex<T> {
  private readonly grid = new Map<number, { a: P2; b: P2; data: T }[]>();

  constructor(private readonly cell = 40) {}

  add(pts: readonly P2[], data: T): void {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const i0 = Math.floor(Math.min(a[0], b[0]) / this.cell);
      const i1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
      const j0 = Math.floor(Math.min(a[1], b[1]) / this.cell);
      const j1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
      for (let ci = i0; ci <= i1; ci++) {
        for (let cj = j0; cj <= j1; cj++) {
          const k = (ci + 512) * 2048 + (cj + 512);
          const list = this.grid.get(k);
          if (list) list.push({ a, b, data });
          else this.grid.set(k, [{ a, b, data }]);
        }
      }
    }
  }

  nearest(x: number, z: number, maxDist: number): SegmentHit<T> | null {
    let best: SegmentHit<T> | null = null;
    const reach = Math.ceil(maxDist / this.cell);
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    for (let i = ci - reach; i <= ci + reach; i++) {
      for (let j = cj - reach; j <= cj + reach; j++) {
        const list = this.grid.get((i + 512) * 2048 + (j + 512));
        if (!list) continue;
        for (const s of list) {
          const dx = s.b[0] - s.a[0];
          const dz = s.b[1] - s.a[1];
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / len2));
          const px = s.a[0] + dx * t;
          const pz = s.a[1] + dz * t;
          const d = Math.hypot(px - x, pz - z);
          if (d <= maxDist && (!best || d < best.dist)) {
            const len = Math.sqrt(len2);
            best = { dist: d, x: px, z: pz, tx: dx / len, tz: dz / len, data: s.data };
          }
        }
      }
    }
    return best;
  }
}
