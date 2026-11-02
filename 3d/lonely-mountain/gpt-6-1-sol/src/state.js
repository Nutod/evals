export const HOURS = [
  {
    name: "Noon",
    time: "12:00",
    caption: "A kingdom at its height",
    note: "Bells above the market. Grain goes up to the Mountain; finished silver comes down. The river carries on.",
    icon: "sun",
  },
  {
    name: "Shadow",
    time: "15:00",
    caption: "An ill wind from the north",
    note: "The awnings pull at their ropes. Birds leave the northern slopes. For a little longer, the bargaining continues.",
    icon: "wind",
  },
  {
    name: "Circling",
    time: "17:00",
    caption: "The mountain has a shadow of its own",
    note: "A red-gold shape wheels above the summit. The bells sound the alarm. At the Front Gate, the chains begin to move.",
    icon: "dragon",
  },
  {
    name: "Fire",
    time: "19:00",
    caption: "The ruin of Dale",
    note: "Fire follows the channel down from the Gate. Across the bridges, families run south. The bell towers still stand.",
    icon: "flame",
  },
  {
    name: "Night",
    time: "23:00",
    caption: "The long road south",
    note: "A king without his mountain. Dwarves and men walk together beside the River Running, carrying what they could save.",
    icon: "moon",
  },
];

export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
export function seeded(seed = 93241) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function residentHours(value) {
  const center = Math.round(clamp(value, 0, 4));
  return [center - 1, center, center + 1].filter((h) => h >= 0 && h <= 4);
}
export function ignitionAt(x, z, seed = 0) {
  return (
    2.35 + clamp((z + 20) / 175) * 0.7 + Math.abs(x) * 0.0015 + seed * 0.17
  );
}
export function damageAt(value, ignition) {
  return smooth(ignition, ignition + 0.5, value);
}
export function sampleDay(value) {
  const t = clamp(value, 0, 4);
  const hour = Math.round(t);
  return {
    value: t,
    hour,
    label: HOURS[hour].name,
    resident: residentHours(t),
    wind: 0.12 + smooth(0.3, 1.2, t) * 0.88,
    alarm: smooth(1.3, 2, t),
    evacuation: smooth(2.1, 3.7, t),
    night: smooth(3.05, 4, t),
    fire: smooth(2.15, 3.05, t) * (1 - smooth(3.15, 4.4, t) * 0.85),
    dragon: smooth(0.65, 1.9, t) * (1 - smooth(3.35, 3.8, t)),
    gate: smooth(1.65, 2.7, t),
    kitchen: 1 - smooth(1.7, 2.6, t),
    trade: 1 - smooth(1.4, 2.5, t),
  };
}
export function budgets(quality = "high", density = 1) {
  const scale = { low: 0.4, medium: 0.7, high: 1 }[quality] ?? 1;
  return {
    people: Math.round(2400 * scale * clamp(density, 0.15, 1)),
    particles: Math.round(8500 * scale),
    trees: Math.round(5200 * Math.max(0.65, scale)),
    detailDistance: quality === "low" ? 95 : quality === "medium" ? 170 : 260,
  };
}
