// Value noise for terrain and placement on the CPU, with a matching GLSL chunk.

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, y, octaves = 5) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Ridged multifractal in [0, ~1]: sharp crests for mountain flanks. */
export function ridged(x, y, octaves = 5) {
  let sum = 0, amp = 0.55, f = 1, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 11.3));
    n *= n * weight;
    weight = Math.min(1, n * 1.6);
    sum += n * amp;
    f *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

export const hash01 = hash;

export const GLSL_NOISE = /* glsl */ `
float lmHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lmHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lmNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = lmHash(i), b = lmHash(i + vec2(1.0, 0.0)), c = lmHash(i + vec2(0.0, 1.0)), d = lmHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float lmNoise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lmHash3(i), lmHash3(i + vec3(1, 0, 0)), f.x), mix(lmHash3(i + vec3(0, 1, 0)), lmHash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lmHash3(i + vec3(0, 0, 1)), lmHash3(i + vec3(1, 0, 1)), f.x), mix(lmHash3(i + vec3(0, 1, 1)), lmHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lmFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * lmNoise(p); p = p * 2.03 + vec2(17.1, -9.3); a *= 0.5; }
  return s;
}
float lmFbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * lmNoise3(p); p = p * 2.07 + vec3(11.3, -7.1, 3.7); a *= 0.5; }
  return s;
}
`;
