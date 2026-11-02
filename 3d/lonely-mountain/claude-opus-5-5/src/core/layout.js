// Geography of the valley: one scene unit is one metre. +x is east, -z is north
// (towards the Mountain), +z is south (towards the vantage and the Long Lake).
import { fbm, ridged, hash01 } from './noise.js';
import { Path, catmull, clamp, lerp, ss } from './util.js';

export const PEAK = { x: -150, z: -2050 };
export const GATE = { x: 14, y: 40, z: -705, halfW: 15, h: 44 };
export const CULVERT = { x: -40, y: 37, z: -704 };
export const LAKE = { x: 0, y: -28, z: 7400, rx: 2600, rz: 1500 };

// Dale: terraces stepping up both banks of the river.
export const TOWN = { z0: -335, z1: 238 };
export const QUAY_D = 30;
export const TERRACE_W = 30;
export const TERRACES = 6;
export const QUAY_RISE = 4.5;
export const TERRACE_RISE = 6.5;

// The market square cuts into the east bank, from the quay up to the fourth terrace.
export const PLAZA = { z0: -50, z1: 52, d0: QUAY_D, d1: 124 };

// River control points: [x, z, water level, half width]. z is strictly increasing.
const RIVER_CTRL = [
  [-40, -704, 37, 6],
  [-38, -640, 35.6, 6.5],
  [-24, -540, 33, 7],
  [-10, -430, 29, 8],
  [0, -330, 24, 10],
  [9, -200, 20.5, 11],
  [-3, -60, 17, 12],
  [6, 80, 14.5, 12],
  [1, 200, 12, 12],
  [-3, 250, 11, 11],
  [-6, 266, -3, 12],
  [-26, 380, -5, 14],
  [-86, 560, -7, 16],
  [-168, 820, -9, 18],
  [-250, 1200, -11, 21],
  [-300, 1800, -13, 24],
  [-220, 3000, -17, 28],
  [-80, 4600, -22, 34],
  [0, 6200, -27.5, 60],
];

const R_STEP = 2;
const R_Z0 = RIVER_CTRL[0][1];
const R_Z1 = RIVER_CTRL[RIVER_CTRL.length - 1][1];
const R_N = Math.ceil((R_Z1 - R_Z0) / R_STEP) + 1;
const rX = new Float32Array(R_N), rY = new Float32Array(R_N), rW = new Float32Array(R_N);
{
  let seg = 0;
  for (let i = 0; i < R_N; i++) {
    const z = R_Z0 + i * R_STEP;
    while (seg < RIVER_CTRL.length - 2 && RIVER_CTRL[seg + 1][1] < z) seg++;
    const c = (j) => RIVER_CTRL[clamp(j, 0, RIVER_CTRL.length - 1)];
    const p0 = c(seg - 1), p1 = c(seg), p2 = c(seg + 1), p3 = c(seg + 2);
    const u = clamp((z - p1[1]) / (p2[1] - p1[1]));
    rX[i] = catmull(p0[0], p1[0], p2[0], p3[0], u);
    rW[i] = catmull(p0[3], p1[3], p2[3], p3[3], u);
    rY[i] = lerp(p1[2], p2[2], u);
  }
}

/** River centre x, water level y and half width w at z. */
export function riverAt(z, out = { x: 0, y: 0, w: 0, dx: 0 }) {
  const f = clamp((z - R_Z0) / R_STEP, 0, R_N - 1.001);
  const i = Math.floor(f), k = f - i;
  out.x = rX[i] + (rX[i + 1] - rX[i]) * k;
  out.y = rY[i] + (rY[i + 1] - rY[i]) * k;
  out.w = rW[i] + (rW[i + 1] - rW[i]) * k;
  out.dx = (rX[i + 1] - rX[i]) / R_STEP;
  return out;
}
export const RIVER_RANGE = [R_Z0, R_Z1];

const _r = { x: 0, y: 0, w: 0, dx: 0 };

/** Level of terrace k (0 = quay) at z. */
export const terraceLevel = (k, z) => riverAt(z, _r).y + QUAY_RISE + k * TERRACE_RISE;
/** Distance from the river of the street at the front of terrace k (k >= 1). */
export const terraceFront = (k) => QUAY_D + (k - 1) * TERRACE_W;
/** World position at signed distance d from the river centre (side: -1 west, +1 east). */
export const bankX = (z, side, d) => riverAt(z, _r).x + side * d;

function bump(x, z, cx, cz, r, h) {
  const dx = x - cx, dz = z - cz;
  return h * Math.exp(-(dx * dx + dz * dz) / (r * r));
}

function ridge(x, z, ax, az, bx, bz, ha, hb, width) {
  const dx = bx - ax, dz = bz - az;
  const k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
  const d = Math.hypot(x - ax - dx * k, z - az - dz * k);
  return lerp(ha, hb, k) * Math.exp(-(d * d) / (width * width));
}

const smax = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return lerp(a, b, h) + k * h * (1 - h);
};

/** The Mountain's mass alone (single peak, two great western shoulders). */
function mountain(x, z) {
  const dx = x - PEAK.x, dz = z - PEAK.z;
  const ang = Math.atan2(dz, dx);
  // The southern skirt ends abruptly at the Gate's face; elsewhere the flanks run long.
  const south = 1 + 0.95 * ss(950, 1750, dz) * ss(700, 200, Math.abs(dx));
  const rr = Math.hypot(dx, dz) * south * (1 + 0.08 * Math.sin(ang * 3 + 1.1) + 0.05 * Math.sin(ang * 5 + 2.3) + 0.03 * Math.sin(ang * 9));
  let m = 0;
  const R = 2700;
  if (rr < R) m = 1180 * Math.pow(1 - rr / R, 1.55);
  m += 300 * Math.exp(-(rr * rr) / (340 * 340));
  const s1 = ridge(x, z, -520, -1880, -1750, -1380, 860, 360, 400);
  const s2 = ridge(x, z, -560, -2420, -1900, -2820, 780, 320, 420);
  const sE = ridge(x, z, 240, -1820, 1500, -1150, 480, 140, 340);
  m = smax(m, s1, 160);
  m = smax(m, s2, 160);
  m = smax(m, sE, 140);
  // Buttresses and gullies.
  m += (ridged(x * 0.0014, z * 0.0014, 5) - 0.35) * 210 * clamp(m / 600 + 0.05);
  m += fbm(x * 0.009, z * 0.009, 3) * 18 * clamp(m / 200);
  return Math.max(0, m);
}

/** 1 inside Dale's terraced footprint, fading to 0 outside. */
export function townMask(x, z) {
  const d = Math.abs(x - riverAt(z, _r).x);
  return ss(TOWN.z0 - 50, TOWN.z0, z) * (1 - ss(TOWN.z1 - 6, TOWN.z1 + 20, z)) * (1 - ss(QUAY_D + TERRACES * TERRACE_W, QUAY_D + TERRACES * TERRACE_W + 70, d));
}

function townGround(d, z, r, east) {
  if (d < r.w) return r.y - 3.2 * (1 - (d / r.w) ** 2);
  const quay = r.y + QUAY_RISE;
  if (d < QUAY_D) return quay;
  if (east && z > PLAZA.z0 - 6 && z < PLAZA.z1 + 6 && d < PLAZA.d1) {
    const plaza = quay + TERRACE_RISE;
    const edge = ss(PLAZA.z0 - 6, PLAZA.z0, z) * (1 - ss(PLAZA.z1, PLAZA.z1 + 6, z));
    const k = Math.min(TERRACES, Math.floor((d - QUAY_D) / TERRACE_W) + 1);
    const local = d - QUAY_D - (k - 1) * TERRACE_W;
    const terr = quay + (k - 1) * TERRACE_RISE + TERRACE_RISE * ss(0, 3, local);
    return lerp(terr, plaza, edge);
  }
  const k = Math.min(TERRACES, Math.floor((d - QUAY_D) / TERRACE_W) + 1);
  const local = d - QUAY_D - (k - 1) * TERRACE_W;
  return quay + (k - 1) * TERRACE_RISE + TERRACE_RISE * ss(0, 3, local);
}

export const GATE_ROAD = new Path([
  [31, -330], [29, -400], [25, -480], [21, -560], [17, -630], [14, -672], [14, -700],
]).smooth(6);
for (const p of GATE_ROAD.pts) {
  const k = clamp((p[1] + 330) / -370);
  p[2] = lerp(riverAt(-330).y + QUAY_RISE, GATE.y, ss(0, 1, k));
}

export const SOUTH_ROAD = new Path([
  [22, 252], [42, 350], [58, 480], [44, 650], [6, 840], [-74, 1080], [-136, 1380], [-170, 1800], [-120, 2400], [-20, 3200], [60, 4200], [120, 5400],
]).smooth(8, (x, z) => terrainHeight(x, z) + 0.1);
export const WEST_PATH = new Path([
  [-30, 262], [-84, 380], [-168, 560], [-262, 800], [-352, 1200], [-404, 1800], [-338, 3000],
]).smooth(8, (x, z) => terrainHeight(x, z) + 0.1);

/** Distance to the nearest road and that road's surface height (or NaN). */
export function roadInfo(x, z) {
  const a = GATE_ROAD.distance(x, z);
  const b = SOUTH_ROAD.distance(x, z);
  const c = WEST_PATH.distance(x, z);
  return Math.min(a, b, c * 1.4);
}

/** Natural ground height, before Dale's terraces are cut. */
function naturalHeight(x, z) {
  const r = riverAt(z, _r);
  const d = Math.abs(x - r.x);
  // North of the Gate the river is inside the Mountain: no bed, no valley walls.
  const south = ss(GATE.z - 260, GATE.z + 40, z);
  let h;
  if (d < r.w && z > GATE.z) {
    const q = d / r.w;
    h = r.y - 3.2 * (1 - q * q);
  } else {
    const narrow = 1 - ss(300, 700, z);
    const dd = Math.max(0, d - r.w);
    const walls = Math.min(dd, 14) * 0.25 + Math.min(Math.max(0, dd - 14), 900) * lerp(0.03, 0.09, narrow) + narrow * 0.0006 * Math.min(Math.max(0, dd - 150), 320) ** 2;
    h = r.y + 0.6 + walls * south;
  }
  const hillAmt = ss(r.w + 30, r.w + 320, d);
  h += (fbm(x * 0.0011, z * 0.0011, 5) * 46 + fbm(x * 0.005, z * 0.005, 3) * 7) * hillAmt;
  h += fbm(x * 0.035, z * 0.035, 2) * 0.7 * ss(r.w, r.w + 8, d);

  // Hills, spurs and far country rise away from the river; the valley floor stays at water level.
  const valley = ss(r.w + 16, r.w + 240, d);
  let hills = bump(x, z, 400, 780, 380, 92) + bump(x, z, 720, 980, 520, 110) + bump(x, z, -760, 980, 520, 85) + bump(x, z, 1100, 300, 600, 130);
  hills += bump(x, z, -1300, 300, 900, 160) + bump(x, z, 1600, -400, 900, 220);
  // Spurs running south from the Mountain frame the valley of Dale.
  hills += ridge(x, z, 520, -1150, 580, -120, 300, 60, 270);
  hills += ridge(x, z, -560, -1200, -620, -60, 320, 70, 290);
  hills += bump(x, z, 0, -9000, 4200, 260) + bump(x, z, -4200, 3200, 2600, 420) + bump(x, z, 4600, 4800, 3000, 520);
  hills += bump(x, z, -3600, 9800, 3200, 640) + bump(x, z, 3800, 10600, 3600, 760) + bump(x, z, -5200, -3500, 3000, 380);
  h += hills * Math.max(valley, 1 - south);
  const le = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  if (le < 1.8) h = lerp(LAKE.y - 9 * (1 - Math.min(le, 1)), h, ss(0.75, 1.8, le));

  // The Mountain, with a gorge cut back to the sheer face of the Front Gate.
  const along = clamp((z - GATE.z) / 600);
  const gw = 55 + along * 160;
  const soft = lerp(45, 300, along);
  const cx = lerp(GATE.x - 10, 0, along);
  const cut = ss(GATE.z - 30, GATE.z + 1, z) * ss(gw + soft, gw, Math.abs(x - cx));
  h += mountain(x, z) * (1 - cut);

  // Forecourt before the Gate.
  const court = ss(60, 40, Math.abs(x - GATE.x + 2)) * ss(GATE.z - 2, GATE.z + 4, z) * (1 - ss(-650, -620, z));
  if (court > 0 && x > CULVERT.x + 12) h = lerp(h, GATE.y, court);
  return h;
}

/** Ground height everywhere: the single source of truth for placing anything. */
export function terrainHeight(x, z) {
  const nat = naturalHeight(x, z);
  const m = townMask(x, z);
  if (m <= 0) return nat;
  const r = riverAt(z, _r);
  const d = Math.abs(x - r.x);
  return lerp(nat, townGround(d, z, r, x > r.x), m);
}

/** Terrace index (0 quay … 6) and level for a point in Dale. */
export function terraceAt(x, z) {
  const r = riverAt(z, _r);
  const d = Math.abs(x - r.x);
  if (d < QUAY_D) return 0;
  return Math.min(TERRACES, Math.floor((d - QUAY_D) / TERRACE_W) + 1);
}

export function inPlaza(x, z, margin = 0) {
  const r = riverAt(z, _r);
  const d = x - r.x;
  return z > PLAZA.z0 - margin && z < PLAZA.z1 + margin && d > PLAZA.d0 - margin && d < PLAZA.d1 + margin;
}
export const plazaLevel = (z) => terraceLevel(1, z);
export const plazaCenter = () => {
  const z = (PLAZA.z0 + PLAZA.z1) / 2;
  return { x: bankX(z, 1, (PLAZA.d0 + PLAZA.d1) / 2), y: plazaLevel(z), z };
};

// Bell towers: [side, terrace, z]. They are the anchors that survive every hour.
export const TOWERS = [
  { side: -1, k: 2, z: -228, h: 46 },
  { side: 1, k: 4, z: 6, h: 52 },
  { side: -1, k: 3, z: 42, h: 44 },
  { side: 1, k: 2, z: 172, h: 40 },
  { side: -1, k: 5, z: -112, h: 48 },
  { side: 1, k: 3, z: -262, h: 42 },
].map((t) => {
  const d = terraceFront(t.k) + 15;
  const x = bankX(t.z, t.side, d);
  return { ...t, d, x, y: terraceLevel(t.k, t.z) };
});

// Bridges over the river in Dale. The southern one stands over the falls.
export const BRIDGES = [-250, 0, 140, 247].map((z) => ({ z, x: riverAt(z).x, y: riverAt(z).y + QUAY_RISE, span: 2 * QUAY_D, falls: z > 240 }));
export const FALLS_Z = 258;

/** Hour at which a point in Dale catches fire: an orderly cascade south from the Gate and out from the river. */
export function townIgnite(x, z) {
  const r = riverAt(z, _r);
  const d = Math.abs(x - r.x);
  const zn = clamp((z - TOWN.z0) / (TOWN.z1 - TOWN.z0));
  return 2.74 + zn * 0.44 + clamp(d / 220) * 0.1 + hash01(Math.floor(x), Math.floor(z * 7)) * 0.05;
}

// Burn lines: where the dragon's breath licks the upper slopes in the circling hour.
export const SLOPE_BURNS = [
  { a: [260, -1500], b: [60, -900], t0: 1.86, t1: 2.2 },
  { a: [-760, -1300], b: [-430, -820], t0: 1.95, t1: 2.3 },
  { a: [-160, -1200], b: [250, -1050], t0: 2.08, t1: 2.4 },
  { a: [520, -800], b: [380, -420], t0: 2.2, t1: 2.5 },
];

/** Ignition hour for vegetation, or 99 if the point never burns. */
export function slopeIgnite(x, z) {
  let best = 99;
  for (const b of SLOPE_BURNS) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
    const k = clamp(((x - b.a[0]) * dx + (z - b.a[1]) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - b.a[0] - dx * k, z - b.a[1] - dz * k);
    const width = 70 + 40 * fbm(x * 0.01, z * 0.01, 2);
    if (d < width) best = Math.min(best, lerp(b.t0, b.t1, k) + (d / width) * 0.18);
  }
  const tm = townMask(x, z);
  if (tm > 0.3) best = Math.min(best, townIgnite(x, z) + 0.06);
  // Fire spreads down the gorge along the Gate road.
  if (z < TOWN.z0 + 40 && z > GATE.z && Math.abs(x - 10) < 140) best = Math.min(best, 2.66 + (z - GATE.z) / 380 * 0.14 + Math.abs(x - 10) / 900);
  return best;
}

// Camera vantage on the southern slopes, across the valley from the Gate.
export const VANTAGE = { pos: [300, 0, 900], target: [-40, 170, -700] };
VANTAGE.pos[1] = terrainHeight(VANTAGE.pos[0], VANTAGE.pos[2]) + 85;
