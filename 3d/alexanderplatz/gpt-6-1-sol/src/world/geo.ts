export const ORIGIN = { lat: 52.5219, lon: 13.4132 };
export const METRES_PER_DEGREE = 111_319.49079327358;

export function project(lat: number, lon: number): [number, number] {
  return [
    (lon - ORIGIN.lon) * METRES_PER_DEGREE * Math.cos((ORIGIN.lat * Math.PI) / 180),
    (ORIGIN.lat - lat) * METRES_PER_DEGREE,
  ];
}

export function unproject(x: number, z: number) {
  return {
    lat: ORIGIN.lat - z / METRES_PER_DEGREE,
    lon: ORIGIN.lon + x / (METRES_PER_DEGREE * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
}

export function seededRandom(seed = 42) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function polygonArea(points: readonly (readonly number[])[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area / 2);
}

export function routePoint(points: readonly (readonly [number, number])[], distance: number) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return { x: points[0]?.[0] ?? 0, z: points[0]?.[1] ?? 0, angle: 0 };
  let cursor = ((distance % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (cursor <= lengths[i] || i === lengths.length - 1) {
      const a = points[i],
        b = points[i + 1];
      const t = lengths[i] ? cursor / lengths[i] : 0;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        angle: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    cursor -= lengths[i];
  }
  return { x: points[0][0], z: points[0][1], angle: 0 };
}
