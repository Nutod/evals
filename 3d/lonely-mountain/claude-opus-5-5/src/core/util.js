// Small math helpers shared by every module. Everything that depends on the
// approach slider is a pure function of the hour `t` (0 Noon … 4 Night), so the
// valley can be scrubbed backwards and forwards and always lands in the same state.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const ss = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** Trapezoid: 0 before a, rises to 1 by b, holds until c, falls to 0 by d. */
export const band = (x, a, b, c, d) => ss(a, b, x) * (1 - ss(c, d, x));
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

/** Polyline in the x/z plane with arc-length lookup. Points are [x, z] or [x, z, y]. */
export class Path {
  constructor(points, heightAt) {
    this.pts = points.map((p) => [p[0], p[1], p[2] ?? (heightAt ? heightAt(p[0], p[1]) : 0)]);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, az] = this.pts[i - 1];
      const [bx, bz] = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Writes position and unit tangent at arc length s (clamped) into out. */
  at(s, out = { x: 0, y: 0, z: 0, tx: 0, tz: 1 }) {
    const { pts, cum } = this;
    s = clamp(s, 0, this.length);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const k = (s - cum[lo]) / seg;
    const a = pts[lo];
    const b = pts[hi];
    out.x = lerp(a[0], b[0], k);
    out.z = lerp(a[1], b[1], k);
    out.y = lerp(a[2], b[2], k);
    out.tx = (b[0] - a[0]) / seg;
    out.tz = (b[1] - a[1]) / seg;
    return out;
  }

  /** Distance from (x, z) to the polyline. */
  distance(x, z) {
    let best = Infinity;
    const { pts } = this;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], az = pts[i - 1][1];
      const dx = pts[i][0] - ax, dz = pts[i][1] - az;
      const k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
      const d = Math.hypot(x - ax - dx * k, z - az - dz * k);
      if (d < best) best = d;
    }
    return best;
  }

  /** Resamples into a smooth Catmull-Rom polyline with roughly `step` metre spacing. */
  smooth(step, heightAt) {
    const out = [];
    const p = this.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < n; j++) {
        const u = j / n;
        const x = catmull(p0[0], p1[0], p2[0], p3[0], u);
        const z = catmull(p0[1], p1[1], p2[1], p3[1], u);
        out.push([x, z, heightAt ? heightAt(x, z) : catmull(p0[2], p1[2], p2[2], p3[2], u)]);
      }
    }
    const last = p[p.length - 1];
    out.push([last[0], last[1], heightAt ? heightAt(last[0], last[1]) : last[2]]);
    return new Path(out);
  }
}

export function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
