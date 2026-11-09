import { describe, expect, it } from 'vitest';
import { Polyline, type P2 } from '../../src/core/geo';
import { mulberry32 } from '../../src/core/rng';
import { Network, throughRoutes } from '../../src/sim/network';
import { chooseNext, laneNetwork } from '../../src/sim/traffic';
import { assignDirections } from '../../src/sim/trains';
import { stopsAlong, tramNetwork, tramRoutes } from '../../src/sim/trams';
import { stadtbahnTracks } from '../../src/world/rail';
import { inBounds } from '../../src/world/world';

describe('network', () => {
  it('finds shortest paths and through-routes', () => {
    const net = new Network();
    const p = (x: number, z: number): P2 => [x, z];
    net.add(0, 1, [p(0, 0), p(100, 0)], null);
    net.add(1, 2, [p(100, 0), p(200, 0)], null);
    net.add(1, 3, [p(100, 0), p(100, 300)], null);
    net.add(3, 2, [p(100, 300), p(200, 0)], null);
    const { dist, via } = net.shortestPaths(0);
    expect(dist.get(2)).toBe(200);
    expect(net.pathTo(2, via).map((e) => e.to)).toEqual([1, 2]);
    expect(net.sources()).toEqual([0]);
    expect(net.sinks()).toEqual([2]);
    const routes = throughRoutes(net, () => true, 50);
    expect(routes).toHaveLength(1);
    expect(routes[0].line.length).toBe(200);
  });
});

describe('trams', () => {
  const routes = tramRoutes();

  it('run on several long routes that enter and leave at the map edge', () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const r of routes) {
      expect(r.line.length).toBeGreaterThan(500);
      const start = r.line.pts[0];
      const end = r.line.pts[r.line.pts.length - 1];
      expect(inBounds(start[0], start[1], 90)).toBe(false);
      expect(inBounds(end[0], end[1], 90)).toBe(false);
    }
  });

  it('follow connected track without jumps', () => {
    for (const r of routes) {
      for (let i = 1; i < r.line.pts.length; i++) {
        const a = r.line.pts[i - 1];
        const b = r.line.pts[i];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(250);
      }
    }
  });

  it('call at mapped stops, and cross the plaza', () => {
    const withStops = routes.filter((r) => stopsAlong(r.line).length > 0);
    expect(withStops.length).toBeGreaterThan(0);
    // at least one route passes within 150 m of the world clock
    expect(routes.some((r) => r.line.project(105, -7).dist < 150)).toBe(true);
    expect(tramNetwork().edges.length).toBeGreaterThan(100);
  });
});

describe('road traffic', () => {
  const net = laneNetwork();

  it('never makes a U-turn onto the same street', () => {
    const rng = mulberry32(7);
    for (const edge of net.edges.slice(0, 400)) {
      const next = chooseNext(net, edge, rng);
      if (!next) continue;
      expect(next.from).toBe(edge.to);
      expect(next.data.roadIndex === edge.data.roadIndex && next.data.forward !== edge.data.forward).toBe(false);
    }
  });

  it('keeps right: opposing lanes of a two-way street sit on opposite sides', () => {
    const pair = net.edges.filter((e) => !e.data.road.o && e.data.roadIndex === net.edges.find((x) => !x.data.road.o)!.data.roadIndex);
    const forward = pair.find((e) => e.data.forward)!;
    const backward = pair.find((e) => !e.data.forward)!;
    const mid = forward.line.at(forward.line.length / 2);
    const other = backward.line.at(backward.line.length / 2);
    // the oncoming lane is to the left of the direction of travel
    const left = (other.x - mid.x) * mid.tz + (other.z - mid.z) * -mid.tx;
    expect(left).toBeGreaterThan(0.5);
  });
});

describe('Stadtbahn', () => {
  it('assigns the right-hand track to each direction', () => {
    const south = new Polyline([[0, 5], [100, 5]]);
    const north = new Polyline([[0, -5], [100, -5]]);
    // heading east, the southern track is on the right
    expect(assignDirections(south, north, [50, 0])[0]).toBe(south);
    expect(assignDirections(north, south, [50, 0])[0]).toBe(south);
  });

  it('has four tracks through the station, each over a kilometre long', () => {
    const { s, r } = stadtbahnTracks();
    for (const line of [...s, ...r]) expect(line.length).toBeGreaterThan(1000);
  });
});
