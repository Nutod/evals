import { describe, expect, it } from 'vitest';
import { ORIGIN, project, unproject, seededRandom, polygonArea, routePoint } from '../src/world/geo';
import { LANDMARKS } from '../src/world/landmark-data';
import data from '../src/world/map-data.json';

describe('local geographic coordinates', () => {
  it('puts the square at zero with east +X and north -Z', () => {
    expect(project(ORIGIN.lat, ORIGIN.lon)).toEqual([0, 0]);
    expect(project(ORIGIN.lat + 0.001, ORIGIN.lon)[1]).toBeCloseTo(-111.31949);
    expect(project(ORIGIN.lat, ORIGIN.lon + 0.001)[0]).toBeCloseTo(67.7, 0);
  });

  it('round-trips geographic points at metre scale', () => {
    const [x, z] = project(52.520815, 13.409419);
    expect(x).toBeLessThan(-250);
    expect(z).toBeGreaterThan(115);
    expect(unproject(x, z)).toEqual({ lat: 52.520815, lon: 13.409419 });
  });

  it('produces reproducible procedural variation', () => {
    const a = seededRandom(7),
      b = seededRandom(7),
      c = seededRandom(8);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values[0]).not.toEqual(c());
    expect(values.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('measures clockwise and counterclockwise polygons equally', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
  });
});

describe('route motion', () => {
  const loop = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ] as const;
  it('wraps seamlessly around a closed route including negative distances', () => {
    expect(routePoint(loop, 0)).toEqual(routePoint(loop, 40));
    expect(routePoint(loop, -5)).toEqual(routePoint(loop, 35));
    expect(routePoint(loop, 5)).toEqual({ x: 5, z: 0, angle: Math.PI / 2 });
  });
  it('handles zero-length routes without NaN', () => {
    expect(
      routePoint(
        [
          [1, 2],
          [1, 2],
        ],
        100,
      ),
    ).toEqual({ x: 1, z: 2, angle: 0 });
    expect(routePoint([], 100)).toEqual({ x: 0, z: 0, angle: 0 });
  });
});

describe('geographic scene data', () => {
  it('includes a meaningful real geographic neighbourhood', () => {
    expect(data.buildings.length).toBeGreaterThan(300);
    expect(data.roads.length).toBeGreaterThan(500);
    expect(data.trees.length).toBeGreaterThan(500);
    for (const building of data.buildings) {
      expect(building.height).toBeGreaterThanOrEqual(2);
      expect(building.points.length).toBeGreaterThan(3);
      expect(building.points.flat().every(Number.isFinite)).toBe(true);
    }
  });
  it('keeps independently built landmarks out of the background footprints', () => {
    expect(
      data.buildings.some((b) =>
        /Fernsehturm|Rotes Rathaus|Park Inn|Marienkirche|Bahnhof Alexanderplatz|Weltzeituhr/.test(b.name),
      ),
    ).toBe(false);
    expect(LANDMARKS.map((p) => p.id)).toHaveLength(6);
    expect(new Set(LANDMARKS.map((p) => p.id)).size).toBe(6);
    expect(LANDMARKS.find((p) => p.id === 'tower')?.height).toBe(368);
    expect(LANDMARKS.find((p) => p.id === 'park-inn')?.height).toBe(125);
    expect(LANDMARKS.every((p) => p.position.every(Number.isFinite))).toBe(true);
  });
});
