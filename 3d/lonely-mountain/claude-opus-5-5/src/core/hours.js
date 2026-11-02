// The five hours of the day and the light that belongs to each. Values between
// hours are interpolated, so the slider always lands on a complete world.
import * as THREE from 'three';
import { clamp, ss } from './util.js';

export const HOURS = [
  { key: 'noon', label: 'Noon', clock: '12:00', note: 'The kingdom at its height. Bells ring for market; dwarves carry finished work down from the Gate, men carry grain and wool up. Look for a dwarf and a man haggling over a chest in the square.' },
  { key: 'shadow', label: 'Shadow', clock: '15:20', note: 'A hot dry wind from the north. Barley bends, awnings snap, birds lift and stream south. A child at the toy stall lets a clockwork bird go with them. High over the northern moors hangs one dark speck.' },
  { key: 'circling', label: 'Circling', clock: '17:40', note: 'The dragon banks around the peak. His shadow races down the Mountain and across Dale. Bells ring wild, the market empties, and a dwarf sentry hauls on the Gate chain as the doors grind shut.' },
  { key: 'fire', label: 'Fire', clock: '19:50', note: 'He settles on the rock above the Gate. Fire pours down the stone channel and along the terraces. A family crosses the bridge carrying a cradle; the bell towers stand black against the flames.' },
  { key: 'night', label: 'Night', clock: '23:30', note: 'Smoke hides the stars. The Gate glows like a furnace door, Dale is a field of embers, and a long line of lanterns walks south beside the river. At its head the old king looks back, once.' },
];

const c = (hex) => new THREE.Color(hex);
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// One keyframe per hour.
const KEYS = [
  {
    sunDir: v(0.28, 0.92, 0.3), sunColor: c('#fff1dc'), sun: 2.6,
    hemiSky: c('#a9c8ec'), hemiGround: c('#8c7c5c'), hemi: 0.8,
    fog: c('#bcd0e4'), fogDensity: 0.000105, exposure: 0.62, bloom: 0.18,
    zenith: c('#3a74c4'), horizon: c('#cfe0f0'), north: c('#cfe0f0'), northAmt: 0,
    clouds: 0.38, smoke: 0, smokeLit: c('#000000'), wind: 0.16, windDir: [0.35, 0.94], fire: 0, ash: 0, haze: 0,
  },
  {
    sunDir: v(-0.42, 0.66, 0.62), sunColor: c('#ffcf9a'), sun: 2.4,
    hemiSky: c('#b49a7c'), hemiGround: c('#7a5a3a'), hemi: 0.95,
    fog: c('#c8a07a'), fogDensity: 0.00014, exposure: 0.62, bloom: 0.22,
    zenith: c('#56688a'), horizon: c('#dcb084'), north: c('#8a3f1c'), northAmt: 1,
    clouds: 0.22, smoke: 0, smokeLit: c('#000000'), wind: 1, windDir: [0.08, 1], fire: 0, ash: 0, haze: 0.5,
  },
  {
    sunDir: v(-0.52, 0.4, 0.75), sunColor: c('#ffb466'), sun: 2.4,
    hemiSky: c('#c09a78'), hemiGround: c('#8a5a34'), hemi: 0.85,
    fog: c('#d6a274'), fogDensity: 0.00013, exposure: 0.66, bloom: 0.36,
    zenith: c('#4c6890'), horizon: c('#f2b878'), north: c('#7a3a20'), northAmt: 0.55,
    clouds: 0.3, smoke: 0.12, smokeLit: c('#ff8a40'), wind: 0.85, windDir: [0.15, 1], fire: 0.12, ash: 0, haze: 0.35,
  },
  {
    sunDir: v(-0.78, 0.035, 0.62), sunColor: c('#ff6a32'), sun: 0.9,
    hemiSky: c('#5a3a58'), hemiGround: c('#b4441a'), hemi: 0.75,
    fog: c('#4a2a28'), fogDensity: 0.0002, exposure: 0.9, bloom: 0.85,
    zenith: c('#141528'), horizon: c('#c84a1e'), north: c('#3a1810'), northAmt: 0.6,
    clouds: 0.15, smoke: 0.62, smokeLit: c('#ff5a1a'), wind: 0.55, windDir: [0.2, 1], fire: 1, ash: 0.25, haze: 0.2,
  },
  {
    sunDir: v(-0.6, -0.3, 0.5), sunColor: c('#000000'), sun: 0,
    hemiSky: c('#140e10'), hemiGround: c('#5a1c08'), hemi: 0.55,
    fog: c('#0d0909'), fogDensity: 0.00026, exposure: 1.3, bloom: 1.0,
    zenith: c('#030303'), horizon: c('#1c0d08'), north: c('#0a0605'), northAmt: 0,
    clouds: 0, smoke: 1, smokeLit: c('#7a2a0c'), wind: 0.12, windDir: [0.3, 1], fire: 0.55, ash: 1, haze: 0,
  },
];

/** Interpolated light for hour t. Returns a reused object. */
const out = {};
for (const k of Object.keys(KEYS[0])) {
  const val = KEYS[0][k];
  out[k] = val.clone ? val.clone() : Array.isArray(val) ? [...val] : val;
}
export function lightAt(t) {
  t = clamp(t, 0, 4);
  const i = Math.min(3, Math.floor(t));
  const f = ss(0, 1, t - i);
  const a = KEYS[i], b = KEYS[i + 1];
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k];
    if (va.isColor) out[k].copy(va).lerp(vb, f);
    else if (va.isVector3) out[k].copy(va).lerp(vb, f).normalize();
    else if (Array.isArray(va)) {
      out[k][0] = va[0] + (vb[0] - va[0]) * f;
      out[k][1] = va[1] + (vb[1] - va[1]) * f;
    } else out[k] = va + (vb - va) * f;
  }
  return out;
}

export const hourIndex = (t) => clamp(Math.round(t), 0, 4);
