import * as THREE from 'three';
import type { P2 } from './geo';

export type V3 = [number, number, number];
type ColorLike = THREE.Color | number;

const colorCache = new Map<number, THREE.Color>();
export function col(c: ColorLike): THREE.Color {
  if (typeof c !== 'number') return c;
  let v = colorCache.get(c);
  if (!v) colorCache.set(c, (v = new THREE.Color(c)));
  return v;
}

export interface AddOptions {
  /** 1 lets the per-instance colour tint these vertices, 2 uses the second instance colour. */
  tint?: number;
  /** Emissive colour that switches on with the night uniform. */
  glow?: ColorLike;
  uvScale?: [number, number];
  uvOffset?: [number, number];
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

/** Accumulates many primitives into one BufferGeometry (one draw call). */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private rgb: number[] = [];
  private tint: number[] = [];
  private glow: number[] = [];

  constructor(private readonly extras = false) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private vert(p: V3, n: THREE.Vector3, u: number, v: number, c: THREE.Color, o?: AddOptions): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.rgb.push(c.r, c.g, c.b);
    if (this.extras) {
      this.tint.push(o?.tint ?? 0);
      const g = o?.glow != null ? col(o.glow) : null;
      this.glow.push(g ? g.r : 0, g ? g.g : 0, g ? g.b : 0);
    }
  }

  tri(a: V3, b: V3, c: V3, color: ColorLike, uvs?: [number, number, number, number, number, number], o?: AddOptions): this {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_e1, _e2).normalize();
    const k = col(color);
    this.vert(a, _n, uvs?.[0] ?? 0, uvs?.[1] ?? 0, k, o);
    this.vert(b, _n, uvs?.[2] ?? 0, uvs?.[3] ?? 0, k, o);
    this.vert(c, _n, uvs?.[4] ?? 0, uvs?.[5] ?? 0, k, o);
    return this;
  }

  /** Corners run counter-clockwise seen from the front: a, b along the bottom, c, d back along the top. */
  quad(a: V3, b: V3, c: V3, d: V3, color: ColorLike, uv: [number, number, number, number] = [0, 0, 1, 1], o?: AddOptions): this {
    const [u0, v0, u1, v1] = uv;
    this.tri(a, b, c, color, [u0, v0, u1, v0, u1, v1], o);
    this.tri(a, c, d, color, [u0, v0, u1, v1, u0, v1], o);
    return this;
  }

  /** Appends a three.js geometry, baking the transform and a flat colour. */
  add(geom: THREE.BufferGeometry, m: THREE.Matrix4 | null, color: ColorLike, o?: AddOptions): this {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    const k = col(color);
    if (m) _nm.getNormalMatrix(m);
    const flip = m ? m.determinant() < 0 : false;
    const su = o?.uvScale?.[0] ?? 1;
    const sv = o?.uvScale?.[1] ?? 1;
    const ou = o?.uvOffset?.[0] ?? 0;
    const ov = o?.uvOffset?.[1] ?? 0;
    for (let f = 0; f < p.count; f += 3) {
      for (let j = 0; j < 3; j++) {
        // mirrored transforms reverse the winding so faces stay outward
        const i = f + (flip ? 2 - j : j);
        _v.fromBufferAttribute(p, i);
        if (n) _n.fromBufferAttribute(n, i);
        else _n.set(0, 1, 0);
        if (m) {
          _v.applyMatrix4(m);
          _n.applyMatrix3(_nm).normalize();
        }
        this.vert([_v.x, _v.y, _v.z], _n, t ? t.getX(i) * su + ou : 0, t ? t.getY(i) * sv + ov : 0, k, o);
      }
    }
    if (g !== geom) g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, m: THREE.Matrix4, color: ColorLike, o?: AddOptions): this {
    return this.add(unitBox, _bm.copy(m).scale(_v.set(w, h, d)), color, o);
  }

  /** Flat polygon at height y, facing up (or down). */
  polygon(outer: readonly P2[], holes: readonly P2[][], y: number, color: ColorLike, uvScale = 1, up = true, o?: AddOptions): this {
    const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
    const holeVs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const all = contour.concat(...holeVs);
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeVs);
    const k = col(color);
    for (const f of faces) {
      const a = all[f[0]];
      let b = all[f[1]];
      let c = all[f[2]];
      // in plan (x east, z south) an upward face needs negative signed area
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross > 0 === up) [b, c] = [c, b];
      this.tri([a.x, y, a.y], [b.x, y, b.y], [c.x, y, c.y], k, [a.x * uvScale, a.y * uvScale, b.x * uvScale, b.y * uvScale, c.x * uvScale, c.y * uvScale], o);
    }
    return this;
  }

  /** A ribbon of constant width following a polyline on the ground plane. */
  ribbon(pts: readonly P2[], width: number, y: number, color: ColorLike, uvPerMetre = 1, o?: AddOptions): this {
    const h = width / 2;
    let dist = 0;
    let pl: V3 | null = null;
    let pr: V3 | null = null;
    let pd = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0];
      let tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const left: V3 = [p[0] + tz * h, y, p[1] - tx * h];
      const right: V3 = [p[0] - tz * h, y, p[1] + tx * h];
      if (pl && pr) {
        this.quad(pr, right, left, pl, color, [0, pd * uvPerMetre, 0, dist * uvPerMetre], o);
        // quad() maps u along the first edge; ribbons want v along the path
        const n = this.uv.length;
        const v0 = pd * uvPerMetre;
        const v1 = dist * uvPerMetre;
        const us = width * uvPerMetre;
        this.uv.splice(n - 12, 12, us, v0, us, v1, 0, v1, us, v0, 0, v1, 0, v0);
      }
      pl = left;
      pr = right;
      pd = dist;
    }
    return this;
  }

  disc(x: number, z: number, r: number, y: number, color: ColorLike, segments = 10, uvScale = 0): this {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const ax = x + Math.cos(a0) * r;
      const az = z + Math.sin(a0) * r;
      const bx = x + Math.cos(a1) * r;
      const bz = z + Math.sin(a1) * r;
      this.tri([x, y, z], [bx, y, bz], [ax, y, az], color, [x * uvScale, z * uvScale, bx * uvScale, bz * uvScale, ax * uvScale, az * uvScale]);
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    if (this.extras) {
      g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 1));
      g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 3));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material: THREE.Material, shadows: 'cast' | 'receive' | 'both' | 'none' = 'both'): THREE.Mesh {
    const m = new THREE.Mesh(this.build(), material);
    m.castShadow = shadows === 'cast' || shadows === 'both';
    m.receiveShadow = shadows === 'receive' || shadows === 'both';
    return m;
  }
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _bm = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Builds a transform; rotations are applied in Y, X, Z order. */
export function xf(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | V3 = 1): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s);
}

/** A local coordinate frame: `at()` returns transforms relative to it. */
export class Frame {
  constructor(readonly m: THREE.Matrix4) {}

  static plan(x: number, z: number, rotY: number, y = 0): Frame {
    return new Frame(xf(x, y, z, rotY));
  }

  at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s: number | V3 = 1): THREE.Matrix4 {
    return xf(x, y, z, ry, rx, rz, s).premultiply(this.m);
  }

  point(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
}
