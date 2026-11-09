import * as THREE from 'three';
import { headingToRotY, toRing, type P2, type Polyline } from '../core/geo';
import { tintMaterial } from '../core/materials';
import { mulberry32 } from '../core/rng';
import { FONT_CONDENSED, textSign } from '../core/textures';
import { osm } from '../data/osm';
import { inBounds, type World } from '../world/world';
import { TRAM_SEGMENT, tramSegment, type TramPart } from './models';
import { Network, throughRoutes, type Route } from './network';

const CRUISE = 9.5;
const ACCEL = 1.0;
const BRAKE = 1.3;
const DWELL = 14;
const PARTS: TramPart[] = ['front', 'panto', 'mid', 'mid', 'rear'];
const LINES = [
  { line: 'M4', destination: 'Hackescher Markt' },
  { line: 'M5', destination: 'Zingster Straße' },
  { line: 'M6', destination: 'Riesaer Straße' },
  { line: 'M2', destination: 'Heinersdorf' },
  { line: 'M4', destination: 'Falkenberg' },
  { line: 'M5', destination: 'Hauptbahnhof' },
];

/** The directed tram track graph. Tracks are mapped one way per direction of travel. */
export function tramNetwork(): Network {
  const net = new Network();
  for (const t of osm.tram) if (!t.s) net.add(t.a, t.b, toRing(t.p), null);
  return net;
}

/** Routes that enter and leave at the edge of the modelled area. */
export function tramRoutes(net = tramNetwork()): Route[] {
  const atEdge = (p: P2): boolean => !inBounds(p[0], p[1], 90);
  return throughRoutes(net, atEdge, 500, 2, 8);
}

/** Arc lengths along a route where trams call, from mapped stop positions. */
export function stopsAlong(line: Polyline): number[] {
  const stops: number[] = [];
  for (const s of osm.tramStops) {
    const hit = line.project(s.x, s.z);
    if (hit.dist < 7 && !stops.some((d) => Math.abs(d - hit.s) < 40)) stops.push(hit.s);
  }
  return stops.sort((a, b) => a - b);
}

interface Tram {
  route: Route;
  stops: number[];
  /** Arc length of the nose. */
  s: number;
  v: number;
  dwell: number;
  nextStop: number;
  wait: number;
  segments: THREE.Mesh[];
  group: THREE.Group;
}

export interface TramSim {
  count: number;
  routes: number;
  /** Plan positions of every tram nose, for tests and labels. */
  positions(): P2[];
}

export function buildTrams(world: World): TramSim {
  const routes = tramRoutes();
  const rng = mulberry32(161);
  const material = tintMaterial({ roughness: 0.42, metalness: 0.25, envMapIntensity: 1.1 });
  const geometries = new Map<TramPart, THREE.BufferGeometry>();
  for (const p of new Set(PARTS)) geometries.set(p, tramSegment(p));
  const length = PARTS.length * TRAM_SEGMENT;
  const trams: Tram[] = [];

  routes.forEach((route, ri) => {
    const stops = stopsAlong(route.line);
    const perRoute = route.line.length > 1100 ? 2 : 1;
    const info = LINES[ri % LINES.length];
    const sign = textSign(`${info.line}  ${info.destination}`, { bg: '#0b0c0d', fg: '#ffb321', font: FONT_CONDENSED, weight: 600, px: 48, pad: 0.22 });
    const signMaterial = new THREE.MeshBasicMaterial({ map: sign.texture, toneMapped: false });
    for (let k = 0; k < perRoute; k++) {
      const group = new THREE.Group();
      const segments = PARTS.map((part) => {
        const m = new THREE.Mesh(geometries.get(part)!, material);
        m.castShadow = true;
        group.add(m);
        return m;
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), signMaterial);
      board.position.set(TRAM_SEGMENT / 2 - 0.36, 3.12, 0);
      board.rotation.y = Math.PI / 2;
      segments[0].add(board);
      world.layers.trams.add(group);
      const s = ((k + 0.25 + rng() * 0.3) / perRoute) * route.line.length;
      trams.push({ route, stops, s, v: CRUISE, dwell: 0, nextStop: stops.findIndex((d) => d > s + 20), wait: 0, segments, group });
    }
  });

  const a = { x: 0, z: 0, tx: 1, tz: 0 };
  const b = { x: 0, z: 0, tx: 1, tz: 0 };
  const place = (t: Tram): void => {
    const line = t.route.line;
    t.segments.forEach((seg, i) => {
      line.at(t.s - i * TRAM_SEGMENT - 0.4, a);
      line.at(t.s - (i + 1) * TRAM_SEGMENT + 0.4, b);
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      seg.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
      if (dx * dx + dz * dz > 1e-4) seg.rotation.y = headingToRotY(dx, dz);
    });
  };

  const head = { x: 0, z: 0, tx: 1, tz: 0 };
  const other = { x: 0, z: 0, tx: 1, tz: 0 };
  /** Distance to the nearest tram ahead on any route, within a narrow corridor. */
  const gapAhead = (t: Tram): number => {
    t.route.line.at(t.s, head);
    let gap = Infinity;
    for (const o of trams) {
      if (o === t || o.wait > 0) continue;
      for (const back of [0, length * 0.5, length]) {
        o.route.line.at(o.s - back, other);
        const dx = other.x - head.x;
        const dz = other.z - head.z;
        const ahead = dx * head.tx + dz * head.tz;
        const side = Math.abs(-dx * head.tz + dz * head.tx);
        if (ahead > 0.5 && ahead < 60 && side < 2.6) gap = Math.min(gap, ahead);
      }
    }
    return gap;
  };

  world.updaters.push((dt) => {
    for (const t of trams) {
      if (t.wait > 0) {
        t.wait -= dt;
        if (t.wait <= 0) {
          t.s = 0;
          t.v = CRUISE;
          t.nextStop = t.stops.length ? 0 : -1;
          t.group.visible = true;
        }
        continue;
      }
      if (t.dwell > 0) {
        t.dwell -= dt;
        continue;
      }
      let target = CRUISE;
      const stop = t.nextStop >= 0 ? t.stops[t.nextStop] : undefined;
      if (stop !== undefined) {
        const d = stop - t.s;
        if (d < 0.4 && t.v < 0.6) {
          t.v = 0;
          t.dwell = DWELL;
          t.nextStop = t.nextStop + 1 < t.stops.length ? t.nextStop + 1 : -1;
          continue;
        }
        target = Math.min(target, Math.sqrt(Math.max(0.2, 2 * BRAKE * 0.8 * Math.max(d, 0))));
      }
      const gap = gapAhead(t) - 9;
      if (gap < 60) target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * BRAKE * 0.8 * gap));
      t.v += THREE.MathUtils.clamp(target - t.v, -BRAKE * dt, ACCEL * dt);
      t.v = Math.max(0, t.v);
      t.s += t.v * dt;
      if (t.s - length > t.route.line.length) {
        // left the area: come back in after a pause
        t.wait = 6 + rng() * 14;
        t.group.visible = false;
        continue;
      }
      place(t);
    }
  });
  for (const t of trams) place(t);

  return {
    count: trams.length,
    routes: routes.length,
    positions: () => trams.filter((t) => t.wait <= 0).map((t) => [t.segments[0].position.x, t.segments[0].position.z]),
  };
}
