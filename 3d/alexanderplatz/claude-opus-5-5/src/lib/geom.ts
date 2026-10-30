import * as THREE from 'three';
import type { Flat } from '../osm';

/** 2D point in the ground plane: x = east, y = scene z (south). */
export type Ring = THREE.Vector2[];

export const toRing = (flat: Flat): Ring => {
  const ring: Ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push(new THREE.Vector2(flat[i], flat[i + 1]));
  return ring;
};

export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  return a / 2;
}

/** Outer rings positive, holes negative, so (dz, -dx) is always the outward wall normal. */
export function orient(ring: Ring, isHole = false): Ring {
  const positive = signedArea(ring) > 0;
  return positive !== isHole ? ring : [...ring].reverse();
}

export function centroid(ring: Ring): THREE.Vector2 {
  const c = new THREE.Vector2();
  for (const p of ring) c.add(p);
  return c.divideScalar(ring.length);
}

export function pointInRing(p: THREE.Vector2, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export interface Frame {
  center: THREE.Vector2;
  /** Rotation about +y that maps local +x onto the long axis. */
  angle: number;
  length: number;
  width: number;
}

/** Minimum-area bounding rectangle, used to align hand-built landmarks to their OSM footprint. */
export function orientedFrame(ring: Ring): Frame {
  let best: Frame | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const theta = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of ring) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const length = maxU - minU;
    const width = maxV - minV;
    if (best && length * width >= best.length * best.width) continue;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const center = new THREE.Vector2(cu * c - cv * s, cu * s + cv * c);
    best = length >= width
      ? { center, angle: theta, length, width }
      : { center, angle: theta + Math.PI / 2, length: width, width: length };
  }
  return best!;
}

/**
 * Converts a ground-plane heading (angle from +x towards +z) to a rotation.y
 * so that a model built along local +x points the same way.
 */
export const headingToRotationY = (angle: number) => -angle;

/** Accumulates non-indexed triangles with normals, uvs and colours, then emits one BufferGeometry. */
export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  color = new THREE.Color(1, 1, 1);

  private static ab = new THREE.Vector3();
  private static ac = new THREE.Vector3();
  private static n = new THREE.Vector3();

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Adds a triangle; if `facing` is given the winding is flipped to face that way. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uva?: THREE.Vector2, uvb?: THREE.Vector2, uvc?: THREE.Vector2, facing?: THREE.Vector3) {
    const n = MeshBuilder.n.crossVectors(MeshBuilder.ab.subVectors(b, a), MeshBuilder.ac.subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    if (facing && n.dot(facing) < 0) {
      [b, c] = [c, b];
      [uvb, uvc] = [uvc, uvb];
      n.negate();
    }
    n.normalize();
    for (const [p, uv] of [[a, uva], [b, uvb], [c, uvc]] as const) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.uvs.push(uv?.x ?? 0, uv?.y ?? 0);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv?: [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2], facing?: THREE.Vector3) {
    this.tri(a, b, c, uv?.[0], uv?.[1], uv?.[2], facing);
    this.tri(a, c, d, uv?.[0], uv?.[2], uv?.[3], facing);
  }

  /** Horizontal polygon at height y, facing up (or down). UVs are world metres / uvScale. */
  polygon(outer: Ring, holes: Ring[], y: number, uvScale = 1, down = false) {
    const contour = outer;
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [contour, ...holes].flat();
    const facing = new THREE.Vector3(0, down ? -1 : 1, 0);
    for (const [i, j, k] of faces) {
      const [a, b, c] = [all[i], all[j], all[k]];
      this.tri(
        new THREE.Vector3(a.x, y, a.y), new THREE.Vector3(b.x, y, b.y), new THREE.Vector3(c.x, y, c.y),
        new THREE.Vector2(a.x / uvScale, -a.y / uvScale), new THREE.Vector2(b.x / uvScale, -b.y / uvScale), new THREE.Vector2(c.x / uvScale, -c.y / uvScale),
        facing,
      );
    }
  }

  /** Vertical walls around an oriented ring between y0 and y1. UV u runs along the perimeter. */
  walls(ring: Ring, y0: number, y1: number, tileU: number, tileV: number, vOffset = 0) {
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const len = p.distanceTo(q);
      if (len < 0.05) continue;
      // Snap each wall to whole window bays so windows never get cut at corners.
      const u0 = Math.round(run / tileU * 4) / 4;
      const u1 = u0 + Math.max(1, Math.round((len / tileU) * 4)) / 4;
      run += len;
      const facing = new THREE.Vector3(q.y - p.y, 0, -(q.x - p.x));
      const v0 = (y0 - vOffset) / tileV;
      const v1 = (y1 - vOffset) / tileV;
      this.quad(
        new THREE.Vector3(p.x, y0, p.y), new THREE.Vector3(q.x, y0, q.y), new THREE.Vector3(q.x, y1, q.y), new THREE.Vector3(p.x, y1, p.y),
        [new THREE.Vector2(u0, v0), new THREE.Vector2(u1, v0), new THREE.Vector2(u1, v1), new THREE.Vector2(u0, v1)],
        facing,
      );
    }
  }

  /**
   * Flat ribbon along a polyline with mitred joins. `v` runs along the line in
   * metres / uvScale, `u` across from 0 to 1.
   */
  ribbon(pts: Ring, width: number, y: number, uvScale = 1, offset = 0) {
    if (pts.length < 2) return;
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const d0 = new THREE.Vector2().subVectors(pts[i], prev);
      const d1 = new THREE.Vector2().subVectors(next, pts[i]);
      if (d0.lengthSq() < 1e-9) d0.copy(d1);
      if (d1.lengthSq() < 1e-9) d1.copy(d0);
      d0.normalize(); d1.normalize();
      const n0 = new THREE.Vector2(-d0.y, d0.x);
      const n1 = new THREE.Vector2(-d1.y, d1.x);
      const m = n0.clone().add(n1);
      if (m.lengthSq() < 1e-6) m.copy(n1);
      m.normalize();
      const scale = Math.min(2.5, 1 / Math.max(0.2, m.dot(n1)));
      left.push(pts[i].clone().addScaledVector(m, (offset + width / 2) * scale));
      right.push(pts[i].clone().addScaledVector(m, (offset - width / 2) * scale));
    }
    const up = new THREE.Vector3(0, 1, 0);
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = pts[i].distanceTo(pts[i + 1]);
      const v0 = dist / uvScale;
      const v1 = (dist + seg) / uvScale;
      dist += seg;
      this.quad(
        new THREE.Vector3(left[i].x, y, left[i].y), new THREE.Vector3(right[i].x, y, right[i].y),
        new THREE.Vector3(right[i + 1].x, y, right[i + 1].y), new THREE.Vector3(left[i + 1].x, y, left[i + 1].y),
        [new THREE.Vector2(0, v0), new THREE.Vector2(1, v0), new THREE.Vector2(1, v1), new THREE.Vector2(0, v1)],
        up,
      );
    }
  }

  disc(center: THREE.Vector2, radius: number, y: number, segments = 16, uvScale = 1) {
    const ring: Ring = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ring.push(new THREE.Vector2(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius));
    }
    this.polygon(ring, [], y, uvScale);
  }

  /** Appends an existing (possibly indexed) geometry, transformed, taking the current colour. */
  addGeometry(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      this.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      this.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Deterministic pseudo-random generator so the city looks the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const hash = (n: number) => rng(n * 2654435761)();
