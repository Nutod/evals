import * as THREE from 'three';
import { centroid, headingToRotY, toRing, type P2, type Polyline } from '../core/geo';
import { tintMaterial } from '../core/materials';
import { mulberry32 } from '../core/rng';
import { osm } from '../data/osm';
import { RAIL, stadtbahnTracks } from '../world/rail';
import type { World } from '../world/world';
import { locomotive, regionalCoach, sBahnCar, type CarSpec } from './models';

const CRUISE = 15;
const ACCEL = 0.85;
const BRAKE = 0.95;
const DWELL = 18;
const COUPLING = 0.5;
const BOGIE_INSET = 2.6;

interface Consist {
  line: Polyline;
  /** +1 runs along the stored polyline, -1 against it. */
  dir: 1 | -1;
  cars: { mesh: THREE.Mesh; length: number }[];
  length: number;
  /** Distance the nose has travelled from its entry end. */
  p: number;
  v: number;
  dwell: number;
  stopped: boolean;
  wait: number;
  stopAt: number;
  group: THREE.Group;
}

/**
 * Right-hand running: of two parallel tracks stored in the same direction,
 * the one on the right carries trains along that direction.
 */
export function assignDirections(a: Polyline, b: Polyline, near: P2): [Polyline, Polyline] {
  const sa = a.at(a.project(near[0], near[1]).s);
  const sb = b.at(b.project(near[0], near[1]).s);
  const rightward = (sb.x - sa.x) * -sa.tz + (sb.z - sa.z) * sa.tx;
  return rightward > 0 ? [b, a] : [a, b];
}

export interface TrainSim {
  count: number;
  positions(): P2[];
}

export function buildTrains(world: World): TrainSim {
  const rng = mulberry32(171);
  const tracks = stadtbahnTracks();
  const stationCentre = centroid(toRing(osm.landmarks.station.p));
  const material = tintMaterial({ roughness: 0.45, metalness: 0.25, envMapIntensity: 1.1 });
  const sFront = sBahnCar(1);
  const sMid = sBahnCar(0);
  const sRear = sBahnCar(-1);
  const coach = regionalCoach();
  const loco = locomotive();
  const consists: Consist[] = [];

  const make = (line: Polyline, dir: 1 | -1, specs: CarSpec[], start: number): void => {
    const group = new THREE.Group();
    const cars = specs.map((spec) => {
      const mesh = new THREE.Mesh(spec.geometry, material);
      mesh.castShadow = true;
      group.add(mesh);
      return { mesh, length: spec.length };
    });
    world.layers.trains.add(group);
    const length = cars.reduce((s, c) => s + c.length + COUPLING, -COUPLING);
    const stationS = line.project(stationCentre[0], stationCentre[1]).s;
    const stopAt = (dir > 0 ? stationS : line.length - stationS) + length / 2;
    consists.push({ line, dir, cars, length, p: start * line.length, v: CRUISE, dwell: 0, stopped: start * line.length > stopAt, wait: 0, stopAt, group });
  };

  const [sForward, sBackward] = assignDirections(tracks.s[0], tracks.s[1], stationCentre);
  const [rForward, rBackward] = assignDirections(tracks.r[0], tracks.r[1], stationCentre);
  const halfTrain = [sFront, sMid, sMid, sRear];
  const fullTrain = [sFront, sMid, sMid, sRear, sFront, sMid, sMid, sRear];
  make(sForward, 1, halfTrain, 0.18);
  make(sForward, 1, fullTrain, 0.72);
  make(sBackward, -1, fullTrain, 0.3);
  make(sBackward, -1, halfTrain, 0.85);
  make(rForward, 1, [loco, coach, coach, coach, coach], 0.5);
  make(rBackward, -1, [loco, coach, coach, coach, coach], 0.05);

  const f = { x: 0, z: 0, tx: 1, tz: 0 };
  const r = { x: 0, z: 0, tx: 1, tz: 0 };
  const arc = (c: Consist, travelled: number): number => (c.dir > 0 ? travelled : c.line.length - travelled);
  const place = (c: Consist): void => {
    let front = c.p;
    for (const car of c.cars) {
      c.line.at(arc(c, front - BOGIE_INSET), f);
      c.line.at(arc(c, front - car.length + BOGIE_INSET), r);
      car.mesh.position.set((f.x + r.x) / 2, RAIL.railTop, (f.z + r.z) / 2);
      car.mesh.rotation.y = headingToRotY(f.x - r.x, f.z - r.z);
      front -= car.length + COUPLING;
    }
  };

  world.updaters.push((dt) => {
    for (const c of consists) {
      if (c.wait > 0) {
        c.wait -= dt;
        if (c.wait <= 0) {
          c.p = 0;
          c.v = CRUISE;
          c.stopped = false;
          c.group.visible = true;
        }
        continue;
      }
      if (c.dwell > 0) {
        c.dwell -= dt;
        continue;
      }
      let target = CRUISE;
      if (!c.stopped) {
        const d = c.stopAt - c.p;
        if (d < 0.5 && c.v < 0.5) {
          c.v = 0;
          c.dwell = DWELL;
          c.stopped = true;
          continue;
        }
        target = Math.min(target, Math.sqrt(Math.max(0.15, 2 * BRAKE * 0.8 * Math.max(d, 0))));
      }
      // keep clear of the train ahead on the same track
      for (const o of consists) {
        if (o === c || o.line !== c.line || o.wait > 0) continue;
        const gap = o.p - o.length - c.p - 25;
        if (gap > -o.length && gap < 200) target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * BRAKE * 0.8 * gap));
      }
      c.v = Math.max(0, c.v + THREE.MathUtils.clamp(target - c.v, -BRAKE * dt, ACCEL * dt));
      c.p += c.v * dt;
      if (c.p - c.length > c.line.length) {
        c.wait = 10 + rng() * 25;
        c.group.visible = false;
        continue;
      }
      place(c);
    }
  });
  for (const c of consists) place(c);

  return {
    count: consists.length,
    positions: () => consists.filter((c) => c.wait <= 0).map((c) => [c.cars[0].mesh.position.x, c.cars[0].mesh.position.z]),
  };
}
