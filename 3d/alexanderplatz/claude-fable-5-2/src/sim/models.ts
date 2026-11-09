import * as THREE from 'three';
import { MeshBuilder, xf } from '../core/mesh';

/** Vehicle models face +X, sit on y = 0 and are centred along their length. */

const GLASS = 0x14181c;
const CABIN_GLOW = 0x5a4c30;
const HEAD = 0xfff4d8;
const TAIL = 0xff2a1a;
const DARK = 0x26292c;

export const BVG_YELLOW = 0xf0d722;
export const TRAM_SEGMENT = 6.05;

export type TramPart = 'front' | 'mid' | 'panto' | 'rear';

export function tramSegment(part: TramPart): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  const L = TRAM_SEGMENT;
  const cab = part === 'front' || part === 'rear';
  // build facing +X, then mirror the rear cab
  const flip = part === 'rear' ? -1 : 1;
  const at = (x: number, y: number, z: number, rz = 0): THREE.Matrix4 => xf(x * flip, y, z, 0, 0, rz * flip);
  const bodyL = cab ? L - 0.5 : L - 0.35;
  const bodyX = cab ? -0.25 : 0;
  b.box(bodyL, 0.32, 2.28, at(bodyX, 0.42, 0), DARK);
  b.box(bodyL, 2.55, 2.4, at(bodyX, 1.85, 0), BVG_YELLOW);
  b.box(bodyL - 0.5, 0.22, 1.9, at(bodyX, 3.22, 0), 0x8e9396);
  b.box(1.9, 0.3, 2.1, at(cab ? -0.6 : 0, 0.2, 0), 0x1b1d1f);
  for (const side of [-1, 1]) {
    const z = side * 1.205;
    b.box(bodyL - 0.7, 1.1, 0.03, at(bodyX, 2.2, z), GLASS, { glow: CABIN_GLOW });
    // door leaves
    for (const dx of cab ? [-1.3] : [-1.5, 1.5]) {
      b.box(1.25, 2.0, 0.035, at(dx, 1.5, z), 0xd9c11c);
      b.box(0.03, 2.0, 0.04, at(dx, 1.5, z), 0x1e2226);
      b.box(1.05, 1.3, 0.04, at(dx, 1.85, z), GLASS, { glow: CABIN_GLOW });
    }
  }
  if (cab) {
    b.box(0.07, 1.55, 2.24, at(L / 2 - 0.28, 2.2, 0, 0.17), GLASS);
    b.box(0.55, 1.05, 2.34, at(L / 2 - 0.3, 0.98, 0), BVG_YELLOW);
    b.box(0.06, 0.3, 1.5, at(L / 2 - 0.4, 3.12, 0), 0x101214);
    for (const z of [-0.82, 0.82]) b.box(0.06, 0.16, 0.36, at(L / 2 - 0.01, 0.95, z), part === 'front' ? HEAD : 0x5a0f0a, { glow: part === 'front' ? HEAD : TAIL });
  } else {
    b.box(0.3, 2.3, 2.1, at(L / 2 - 0.05, 1.75, 0), 0x1c1f22);
  }
  b.box(0.3, 2.3, 2.1, at(-L / 2 + 0.05, 1.75, 0), 0x1c1f22);
  if (part === 'panto') {
    b.box(1.6, 0.12, 1.2, xf(0, 3.4, 0), DARK);
    b.box(0.05, 1.5, 0.05, xf(-0.35, 4.0, 0, 0, 0, 0.6), DARK);
    b.box(0.05, 1.5, 0.05, xf(-0.3, 5.0, 0, 0, 0, -0.55), DARK);
    b.box(0.08, 0.05, 1.5, xf(0.1, 5.58, 0), DARK);
  }
  return b.build();
}

export interface CarSpec {
  geometry: THREE.BufferGeometry;
  length: number;
}

/** Berlin S-Bahn car in traffic red and ochre. */
export function sBahnCar(cabEnd: -1 | 0 | 1): CarSpec {
  const b = new MeshBuilder(true);
  const L = 18.2;
  const red = 0xb5161e;
  const ochre = 0xd8a11f;
  b.box(L - 0.3, 1.0, 2.96, xf(0, 1.55, 0), red);
  b.box(L - 0.3, 1.25, 2.96, xf(0, 2.67, 0), ochre);
  b.box(L - 0.8, 0.32, 2.5, xf(0, 3.45, 0), 0x7f8487);
  b.box(L - 1.2, 0.5, 2.5, xf(0, 0.82, 0), DARK);
  for (const x of [-L / 2 + 3, L / 2 - 3]) b.box(2.6, 0.55, 2.3, xf(x, 0.3, 0), 0x18191b);
  for (const side of [-1, 1]) {
    const z = side * 1.485;
    for (const dx of [-5.6, 0, 5.6]) {
      b.box(1.5, 2.05, 0.03, xf(dx, 2.12, z), 0x8f1218);
      b.box(1.2, 0.85, 0.035, xf(dx, 2.62, z), GLASS, { glow: CABIN_GLOW });
    }
    for (const dx of [-7.9, -2.8, 2.8, 7.9]) b.box(dx % 5 ? 2.5 : 2.2, 0.9, 0.03, xf(dx, 2.62, z), GLASS, { glow: CABIN_GLOW });
  }
  for (const end of [-1, 1]) {
    const x = (end * (L - 0.3)) / 2;
    if (end === cabEnd) {
      b.box(0.06, 1.1, 2.6, xf(x + end * 0.02, 2.7, 0), GLASS);
      b.box(0.08, 0.9, 2.9, xf(x + end * 0.02, 1.6, 0), 0x1d1f22);
      for (const z of [-1.05, 1.05]) b.box(0.06, 0.16, 0.3, xf(x + end * 0.07, 1.45, z), HEAD, { glow: HEAD });
      b.box(0.06, 0.16, 0.3, xf(x + end * 0.07, 3.2, 0), HEAD, { glow: HEAD });
    } else {
      b.box(0.5, 2.2, 2.2, xf(x + end * 0.1, 2.1, 0), 0x1c1f22);
    }
  }
  return { geometry: b.build(), length: L };
}

/** Double-deck regional coach. */
export function regionalCoach(): CarSpec {
  const b = new MeshBuilder(true);
  const L = 26.6;
  const red = 0xc4161f;
  b.box(L - 0.4, 3.9, 2.78, xf(0, 2.55, 0), red);
  b.box(L - 1, 0.3, 2.3, xf(0, 4.62, 0), 0x8a8f92);
  b.box(L - 0.4, 0.16, 2.8, xf(0, 4.42, 0), 0xdadcdd);
  for (const x of [-L / 2 + 3.4, L / 2 - 3.4]) b.box(2.8, 0.6, 2.3, xf(x, 0.32, 0), 0x18191b);
  for (const side of [-1, 1]) {
    const z = side * 1.395;
    b.box(L - 9.5, 0.75, 0.03, xf(0, 1.75, z), GLASS, { glow: CABIN_GLOW });
    b.box(L - 9.5, 0.75, 0.03, xf(0, 3.65, z), GLASS, { glow: CABIN_GLOW });
    for (const x of [-L / 2 + 2.6, L / 2 - 2.6]) {
      b.box(1.5, 2.1, 0.035, xf(x, 2.1, z), 0x9d1219);
      b.box(1.2, 0.8, 0.04, xf(x, 2.65, z), GLASS, { glow: CABIN_GLOW });
    }
  }
  for (const end of [-1, 1]) b.box(0.5, 3.4, 2.2, xf((end * L) / 2, 2.4, 0), 0x1c1f22);
  return { geometry: b.build(), length: L };
}

/** Electric locomotive with a raised pantograph; faces +X. */
export function locomotive(): CarSpec {
  const b = new MeshBuilder(true);
  const L = 19;
  const red = 0xc4161f;
  b.box(L - 0.6, 2.9, 2.9, xf(0, 2.45, 0), red);
  b.box(L - 2.4, 0.35, 2.4, xf(0, 4.05, 0), 0x7f8487);
  b.box(L - 0.8, 0.7, 2.6, xf(0, 0.75, 0), DARK);
  for (const x of [-5.6, 5.6]) b.box(3.2, 0.6, 2.4, xf(x, 0.32, 0), 0x18191b);
  for (const end of [-1, 1]) {
    const x = (end * (L - 0.6)) / 2;
    b.box(0.08, 1.0, 2.5, xf(x + end * 0.02, 3.1, 0), GLASS);
    b.box(0.5, 0.9, 2.9, xf(x, 1.5, 0), 0xdadcdd);
    for (const z of [-1.0, 1.0]) b.box(0.06, 0.18, 0.3, xf(x + end * 0.27, 1.65, z), end > 0 ? HEAD : 0x5a0f0a, { glow: end > 0 ? HEAD : TAIL });
  }
  for (const side of [-1, 1]) {
    b.box(L - 4, 0.7, 0.03, xf(0, 3.0, side * 1.46), 0x9d1219);
    b.box(6, 0.5, 0.035, xf(0, 2.2, side * 1.465), 0xdadcdd);
  }
  // pantograph up to the contact wire, 5.5 m above the rail
  b.box(1.8, 0.14, 1.3, xf(-3, 4.3, 0), DARK);
  b.box(0.06, 0.95, 0.06, xf(-3.3, 4.7, 0, 0, 0, 0.7), DARK);
  b.box(0.06, 0.95, 0.06, xf(-3.25, 5.15, 0, 0, 0, -0.7), DARK);
  b.box(0.1, 0.06, 1.7, xf(-2.9, 5.47, 0), DARK);
  return { geometry: b.build(), length: L };
}

function wheels(b: MeshBuilder, axles: number[], track: number, radius: number): void {
  for (const x of axles) {
    for (const side of [-1, 1]) {
      b.add(wheelGeometry, xf(x, radius, (side * track) / 2, 0, Math.PI / 2, 0, [radius / 0.33, 1, radius / 0.33]), 0x17181a);
    }
  }
}
const wheelGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10);

/** Passenger car. `tint: 1` faces take the per-instance paint colour. */
export function car(style: 'sedan' | 'hatch' | 'van' | 'taxi'): CarSpec {
  const b = new MeshBuilder(true);
  const paint = { tint: 1 };
  const dims = { sedan: [4.55, 1.8, 0.72, 0.56], hatch: [4.2, 1.82, 0.8, 0.68], van: [5.3, 1.98, 1.25, 0.85], taxi: [4.7, 1.82, 0.74, 0.58] }[style];
  const [L, W, bodyH, cabinH] = dims;
  const floor = 0.26;
  b.box(L, bodyH, W, xf(0, floor + bodyH / 2, 0), 0xffffff, paint);
  const cabinL = style === 'van' ? L * 0.74 : style === 'hatch' ? L * 0.62 : L * 0.5;
  const cabinX = style === 'van' ? -L * 0.1 : style === 'hatch' ? -L * 0.12 : -L * 0.06;
  const top = floor + bodyH + cabinH;
  b.box(cabinL, cabinH, W - 0.16, xf(cabinX, floor + bodyH + cabinH / 2, 0), GLASS, { glow: 0x221c10 });
  b.box(cabinL - 0.35, 0.06, W - 0.22, xf(cabinX, top, 0), 0xffffff, paint);
  // roof pillars keep the greenhouse from reading as a solid black block
  for (const side of [-1, 1]) {
    for (const px of [cabinX - cabinL / 2 + 0.05, cabinX, cabinX + cabinL / 2 - 0.05]) {
      b.box(0.1, cabinH, 0.05, xf(px, floor + bodyH + cabinH / 2, side * (W / 2 - 0.07)), 0xffffff, paint);
    }
  }
  for (const side of [-1, 1]) {
    b.box(0.05, 0.14, 0.36, xf(L / 2, floor + bodyH * 0.62, side * (W / 2 - 0.3)), HEAD, { glow: HEAD });
    b.box(0.05, 0.12, 0.36, xf(-L / 2, floor + bodyH * 0.68, side * (W / 2 - 0.3)), 0x7a0f0a, { glow: TAIL });
  }
  b.box(0.06, 0.2, W * 0.5, xf(L / 2 + 0.01, floor + bodyH * 0.3, 0), 0x1a1c1e);
  if (style === 'taxi') b.box(0.3, 0.14, 0.7, xf(cabinX, top + 0.1, 0), 0xf5d21e, { glow: 0xf5d21e });
  wheels(b, [L * 0.31, -L * 0.31], W - 0.1, style === 'van' ? 0.36 : 0.32);
  return { geometry: b.build(), length: L };
}

/** Yellow BVG double-decker. */
export function bus(): CarSpec {
  const b = new MeshBuilder(true);
  const L = 13.7;
  const W = 2.55;
  b.box(L, 3.75, W, xf(0, 0.32 + 1.875, 0), BVG_YELLOW);
  b.box(L - 0.4, 0.12, W - 0.2, xf(0, 4.12, 0), 0xe6e4dc);
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.005);
    b.box(L - 1.2, 0.95, 0.03, xf(0.1, 1.75, z), GLASS, { glow: CABIN_GLOW });
    b.box(L - 0.8, 0.85, 0.03, xf(0, 3.3, z), GLASS, { glow: CABIN_GLOW });
    b.box(0.05, 0.16, 0.4, xf(L / 2, 0.75, side * 0.9), HEAD, { glow: HEAD });
    b.box(0.05, 0.16, 0.4, xf(-L / 2, 0.9, side * 0.9), 0x7a0f0a, { glow: TAIL });
  }
  b.box(0.04, 1.3, W - 0.3, xf(L / 2 + 0.01, 1.7, 0), GLASS);
  b.box(0.04, 0.9, W - 0.3, xf(L / 2 + 0.01, 3.3, 0), GLASS);
  b.box(0.05, 0.3, 1.6, xf(L / 2 + 0.02, 2.55, 0), 0x101214, { glow: 0xffb21e });
  wheels(b, [L * 0.3, -L * 0.22, -L * 0.33], W - 0.1, 0.48);
  return { geometry: b.build(), length: L };
}
