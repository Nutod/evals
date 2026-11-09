import { describe, expect, it } from 'vitest';
import { centroid, pointInRing, toRing } from '../../src/core/geo';
import { fromLatLon, osm } from '../../src/data/osm';
import { FERNSEHTURM } from '../../src/world/landmarks/fernsehturm';
import { MARIENKIRCHE } from '../../src/world/landmarks/marienkirche';
import { PARK_INN } from '../../src/world/landmarks/parkinn';
import { RATHAUS } from '../../src/world/landmarks/rathaus';
import { WELTZEITUHR, ZONE_CITIES } from '../../src/world/landmarks/weltzeituhr';

describe('baked OpenStreetMap data', () => {
  it('keeps the attribution and snapshot date', () => {
    expect(osm.meta.attribution).toContain('OpenStreetMap contributors');
    expect(osm.meta.attribution).toContain('ODbL');
    expect(Number.isNaN(Date.parse(osm.meta.osmBase))).toBe(false);
  });

  it('carries a substantial neighbourhood', () => {
    expect(osm.buildings.length).toBeGreaterThan(800);
    expect(osm.roads.length).toBeGreaterThan(500);
    expect(osm.tram.length).toBeGreaterThan(100);
    expect(osm.trees.length / 3).toBeGreaterThan(1500);
    expect(osm.rail.s).toHaveLength(2);
    expect(osm.rail.r).toHaveLength(2);
  });

  it('places landmarks where they stand in Berlin', () => {
    // reference coordinates from public sources, tolerance covers footprint size
    const expected: Record<string, [number, number, number]> = {
      fernsehturm: [52.52082, 13.40942, 15],
      weltzeituhr: [52.52117, 13.41334, 10],
      rathaus: [52.51859, 13.40839, 40],
      marienkirche: [52.52064, 13.40688, 35],
      neptunbrunnen: [52.51975, 13.40674, 30],
    };
    for (const [key, [lat, lon, tolerance]] of Object.entries(expected)) {
      const [x, z] = fromLatLon(lat, lon);
      const [cx, cz] = centroid(toRing(osm.landmarks[key as 'rathaus'].p));
      expect(Math.hypot(cx - x, cz - z), key).toBeLessThan(tolerance);
    }
  });

  it('keeps generic buildings off the hand-modelled footprints', () => {
    for (const key of ['fernsehturm', 'parkInn', 'station', 'rathaus', 'marienkirche'] as const) {
      const ring = toRing(osm.landmarks[key].p);
      const inside = osm.buildings.filter((b) => {
        const c = centroid(toRing(b.p));
        return pointInRing(c[0], c[1], ring);
      });
      expect(inside, key).toHaveLength(0);
    }
  });

  it('has plausible building heights', () => {
    for (const b of osm.buildings) {
      expect(b.h).toBeGreaterThan(0);
      expect(b.h).toBeLessThan(200);
      expect(b.p.length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('landmark dimensions', () => {
  it('match published figures', () => {
    expect(FERNSEHTURM.height).toBe(368);
    expect(FERNSEHTURM.sphereRadius * 2).toBe(32);
    expect(FERNSEHTURM.footRadius * 2).toBe(32);
    expect(FERNSEHTURM.deckHeight).toBeCloseTo(203.8, 1);
    expect(FERNSEHTURM.restaurantHeight).toBeCloseTo(207.5, 1);
    expect(PARK_INN.roofHeight).toBe(125);
    expect(PARK_INN.mastHeight).toBeCloseTo(149.5, 1);
    expect(WELTZEITUHR.height).toBe(10);
    expect(WELTZEITUHR.columnHeight).toBe(2.7);
    expect(ZONE_CITIES).toHaveLength(WELTZEITUHR.zones);
    expect(ZONE_CITIES[12]).toContain('Berlin');
    expect(RATHAUS.towerHeight).toBe(74);
    expect(MARIENKIRCHE.spireTip).toBe(90);
  });
});
