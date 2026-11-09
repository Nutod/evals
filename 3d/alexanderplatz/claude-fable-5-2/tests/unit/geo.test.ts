import { describe, expect, it } from 'vitest';
import { obb, offsetPolyline, pointInRing, Polyline, ringArea, segmentsCross, SegmentIndex, type P2 } from '../../src/core/geo';
import { fromLatLon, osm, toLatLon } from '../../src/data/osm';

describe('geometry', () => {
  const square: P2[] = [[0, 0], [10, 0], [10, 4], [0, 4]];

  it('measures rings in plan coordinates', () => {
    expect(ringArea(square)).toBe(40);
    expect(pointInRing(5, 2, square)).toBe(true);
    expect(pointInRing(11, 2, square)).toBe(false);
  });

  it('finds the oriented bounding box of a rotated rectangle', () => {
    const a = 0.6;
    const rect = square.map(([x, z]): P2 => [x * Math.cos(a) - z * Math.sin(a) + 50, x * Math.sin(a) + z * Math.cos(a) - 20]);
    const box = obb(rect);
    expect(box.halfL).toBeCloseTo(5, 6);
    expect(box.halfW).toBeCloseTo(2, 6);
    expect(Math.abs(box.ux * Math.cos(a) + box.uz * Math.sin(a))).toBeCloseTo(1, 6);
    // v is u turned to the right
    expect(box.vx).toBeCloseTo(-box.uz, 9);
    expect(box.vz).toBeCloseTo(box.ux, 9);
  });

  it('samples and projects along a polyline by arc length', () => {
    const line = new Polyline([[0, 0], [10, 0], [10, 10]]);
    expect(line.length).toBe(20);
    expect(line.at(15)).toMatchObject({ x: 10, z: 5, tx: 0, tz: 1 });
    expect(line.at(-5)).toMatchObject({ x: 0, z: 0 });
    expect(line.project(12, 7)).toEqual({ s: 17, dist: 2 });
  });

  it('offsets to the right of travel', () => {
    // heading east, right is south (+z)
    expect(offsetPolyline([[0, 0], [10, 0]], 2)).toEqual([[0, 2], [10, 2]]);
    const corner = offsetPolyline([[0, 0], [10, 0], [10, 10]], 1);
    expect(corner[1][0]).toBeCloseTo(9, 6);
    expect(corner[1][1]).toBeCloseTo(1, 6);
  });

  it('detects crossing segments and nearest segments', () => {
    expect(segmentsCross([0, 0], [4, 4], [0, 4], [4, 0])).toBe(true);
    expect(segmentsCross([0, 0], [1, 1], [3, 0], [3, 5])).toBe(false);
    const index = new SegmentIndex<string>();
    index.add([[0, 0], [100, 0]], 'a');
    index.add([[0, 50], [100, 50]], 'b');
    expect(index.nearest(40, 12, 30)).toMatchObject({ data: 'a', dist: 12, x: 40, z: 0, tx: 1, tz: 0 });
    expect(index.nearest(40, 200, 30)).toBeNull();
  });
});

describe('projection', () => {
  it('puts the origin at the configured coordinates and round-trips', () => {
    const { lat, lon } = osm.meta.origin;
    expect(fromLatLon(lat, lon).map(Math.abs)).toEqual([0, 0]);
    const back = toLatLon(...fromLatLon(52.5208, 13.4094));
    expect(back.lat).toBeCloseTo(52.5208, 9);
    expect(back.lon).toBeCloseTo(13.4094, 9);
  });

  it('uses metres: north is -z, east is +x', () => {
    const { lat, lon } = osm.meta.origin;
    const [, z] = fromLatLon(lat + 0.001, lon);
    const [x] = fromLatLon(lat, lon + 0.001);
    expect(z).toBeCloseTo(-111.27, 1);
    expect(x).toBeCloseTo(67.86, 1);
  });
});
