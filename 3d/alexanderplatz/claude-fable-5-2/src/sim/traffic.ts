import * as THREE from 'three';
import { headingToRotY, offsetPolyline, toRing, type P2 } from '../core/geo';
import { tintMaterial } from '../core/materials';
import { mulberry32, pick, type Rng } from '../core/rng';
import { osm, type OsmRoad, type RoadKind } from '../data/osm';
import { inBounds, type World } from '../world/world';
import { BVG_YELLOW, bus, car, type CarSpec } from './models';
import { Network, type Edge } from './network';

interface Lane {
  road: OsmRoad;
  /** Index of the road segment, to recognise U-turns. */
  roadIndex: number;
  forward: boolean;
}

const SPEED: Record<RoadKind, number> = { primary: 12.5, secondary: 11, tertiary: 9.5, residential: 7, service: 5 };
const ACCEL = 2.2;
const BRAKE = 4.0;
const PAINT = [0xf1f1ee, 0xe2e2df, 0x1b1c1f, 0x2a2d33, 0x8e9499, 0xb9bdc1, 0x5c6066, 0x1f3a63, 0x2d5d8c, 0x8c1f1f, 0xa33a2a, 0x3d5a40, 0x6b4f3a, 0xd9c7a0];

/** Drivable lanes as a directed graph: right-hand traffic, up to two lanes each way. */
export function laneNetwork(): Network<Lane> {
  const net = new Network<Lane>();
  osm.roads.forEach((road, roadIndex) => {
    if (road.k === 'service') return;
    const pts = toRing(road.p);
    const oneway = road.o ?? 0;
    const add = (forward: boolean, offset: number): void => {
      const dirPts: P2[] = forward ? pts : pts.slice().reverse();
      net.add(forward ? road.a : road.b, forward ? road.b : road.a, offsetPolyline(dirPts, offset), { road, roadIndex, forward });
    };
    if (oneway) {
      const n = Math.min(2, road.l);
      const laneW = road.w / Math.max(1, road.l);
      for (let j = 0; j < n; j++) add(oneway > 0, (j - (n - 1) / 2) * laneW);
    } else {
      const n = Math.max(1, Math.min(2, Math.floor(road.l / 2)));
      const laneW = road.w / Math.max(2, road.l);
      for (let j = 0; j < n; j++) {
        add(true, (j + 0.5) * laneW);
        add(false, (j + 0.5) * laneW);
      }
    }
  });
  return net;
}

/** Picks the next lane at a junction: no U-turns, straight ahead most likely. */
export function chooseNext(net: Network<Lane>, edge: Edge<Lane>, rng: Rng): Edge<Lane> | null {
  const end = edge.line.at(edge.line.length);
  const options = net.outgoing(edge.to).filter((e) => !(e.data.roadIndex === edge.data.roadIndex && e.data.forward !== edge.data.forward));
  if (!options.length) return null;
  const weights = options.map((e) => {
    const start = e.line.at(0);
    const cos = start.tx * end.tx + start.tz * end.tz;
    const sameRoad = e.data.road.n && e.data.road.n === edge.data.road.n ? 1.6 : 1;
    return (Math.pow(Math.max(0, 1 + cos), 2) + 0.06) * sameRoad;
  });
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return options[i];
  }
  return options[options.length - 1];
}

interface Vehicle {
  edge: Edge<Lane>;
  next: Edge<Lane> | null;
  s: number;
  v: number;
  pace: number;
  length: number;
  mesh: THREE.InstancedMesh;
  slot: number;
}

export interface TrafficSim {
  count: number;
  lanes: number;
  positions(): P2[];
}

export function buildTraffic(world: World): TrafficSim {
  const rng = mulberry32(181);
  const net = laneNetwork();
  const total = world.quality.cars;
  const material = tintMaterial({ roughness: 0.35, metalness: 0.45, envMapIntensity: 1.2 });

  const kinds: { spec: CarSpec; share: number; paint: () => number }[] = [
    { spec: car('sedan'), share: 0.36, paint: () => pick(rng, PAINT) },
    { spec: car('hatch'), share: 0.3, paint: () => pick(rng, PAINT) },
    { spec: car('van'), share: 0.13, paint: () => pick(rng, [0xf1f1ee, 0xe2e2df, 0xf1f1ee, 0x8e9499, 0xd9c21e]) },
    { spec: car('taxi'), share: 0.12, paint: () => 0xe9dfb5 },
    { spec: bus(), share: 0.09, paint: () => BVG_YELLOW },
  ];
  const meshes = kinds.map((k) => {
    const mesh = new THREE.InstancedMesh(k.spec.geometry, material, Math.ceil(total * k.share) + 1);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    world.layers.cars.add(mesh);
    return mesh;
  });

  // cars enter where a lane starts at the edge of the map
  const entries = net.edges.filter((e) => {
    const p = net.position.get(e.from)!;
    return !inBounds(p[0], p[1], 70) || !net.incoming.get(e.from)?.length;
  });
  const byEdge = new Map<number, Vehicle[]>();
  const enter = (v: Vehicle, edge: Edge<Lane>, s: number): void => {
    const list = byEdge.get(v.edge.id);
    if (list) list.splice(list.indexOf(v), 1);
    v.edge = edge;
    v.s = s;
    v.next = chooseNext(net, edge, rng);
    const target = byEdge.get(edge.id);
    if (target) target.push(v);
    else byEdge.set(edge.id, [v]);
  };

  const vehicles: Vehicle[] = [];
  const colour = new THREE.Color();
  kinds.forEach((kind, ki) => {
    const n = Math.round(total * kind.share);
    for (let i = 0; i < n; i++) {
      const mesh = meshes[ki];
      const slot = mesh.count++;
      mesh.setColorAt(slot, colour.setHex(kind.paint()));
      // buses keep to the main roads
      const pool = ki === 4 ? net.edges.filter((e) => e.data.road.k === 'primary' || e.data.road.k === 'secondary') : net.edges;
      const edge = pick(rng, pool);
      const v: Vehicle = { edge, next: null, s: 0, v: 0, pace: 0.82 + rng() * 0.3, length: kind.spec.length, mesh, slot };
      vehicles.push(v);
      byEdge.set(edge.id, [...(byEdge.get(edge.id) ?? []), v]);
      v.s = rng() * edge.line.length;
      v.next = chooseNext(net, edge, rng);
      v.v = SPEED[edge.data.road.k] * 0.6;
    }
  });
  for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sample = { x: 0, z: 0, tx: 1, tz: 0 };
  const place = (v: Vehicle): void => {
    v.edge.line.at(v.s - v.length / 2, sample);
    q.setFromAxisAngle(up, headingToRotY(sample.tx, sample.tz));
    v.mesh.setMatrixAt(v.slot, m4.compose(pos.set(sample.x, 0.03, sample.z), q, one));
  };

  world.updaters.push((dt) => {
    for (const v of vehicles) {
      const limit = SPEED[v.edge.data.road.k] * v.pace;
      // gap to the car ahead in this lane, or to whoever just entered the next one
      let gap = Infinity;
      for (const o of byEdge.get(v.edge.id)!) {
        if (o !== v && o.s > v.s) gap = Math.min(gap, o.s - o.length - v.s);
      }
      const toEnd = v.edge.line.length - v.s;
      if (v.next) {
        for (const o of byEdge.get(v.next.id) ?? []) gap = Math.min(gap, toEnd + o.s - o.length);
      }
      const free = gap - 2.2;
      let target = limit;
      if (free < 45) target = Math.min(target, free <= 0 ? 0 : Math.sqrt(2 * BRAKE * 0.7 * free));
      // slow for the turn at the end of the lane
      if (v.next && toEnd < 22) {
        const a = v.edge.line.at(v.edge.line.length, sample);
        const ex = a.tx;
        const ez = a.tz;
        const b = v.next.line.at(0, sample);
        const cos = ex * b.tx + ez * b.tz;
        if (cos < 0.8) target = Math.min(target, 4.2 + toEnd * 0.35);
      }
      v.v = Math.max(0, v.v + THREE.MathUtils.clamp(target - v.v, -BRAKE * dt, ACCEL * dt));
      v.s += v.v * dt;
      if (v.s >= v.edge.line.length) {
        if (v.next) enter(v, v.next, v.s - v.edge.line.length);
        else {
          enter(v, pick(rng, entries), 0);
          v.v = SPEED[v.edge.data.road.k] * 0.7;
        }
      }
      place(v);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  });
  for (const v of vehicles) place(v);

  return {
    count: vehicles.length,
    lanes: net.edges.length,
    positions: () =>
      vehicles.map((v) => {
        const p = v.edge.line.at(v.s);
        return [p.x, p.z];
      }),
  };
}
