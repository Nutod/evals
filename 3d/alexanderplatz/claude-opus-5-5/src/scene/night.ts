import type * as THREE from 'three';

/**
 * Materials whose glow depends on time of day (lit windows, lamp heads, headlights).
 * Lighting presets call setNightLevel(0..1) and every registered material follows.
 */
interface NightEntry {
  material: THREE.Material & { emissiveIntensity?: number; opacity: number };
  day: number;
  night: number;
  prop: 'emissiveIntensity' | 'opacity';
}

const entries: NightEntry[] = [];

export function registerNight(material: NightEntry['material'], night: number, day = 0, prop: NightEntry['prop'] = 'emissiveIntensity') {
  entries.push({ material, day, night, prop });
  material[prop] = day;
}

export function setNightLevel(level: number) {
  for (const e of entries) e.material[e.prop] = e.day + (e.night - e.day) * level;
}
