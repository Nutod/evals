import * as THREE from 'three';
import { centroid, SegmentIndex, toRing, type P2 } from '../core/geo';
import { tintMaterial } from '../core/materials';
import { MeshBuilder, xf } from '../core/mesh';
import { mulberry32, pick } from '../core/rng';
import { osm, type OsmRoad } from '../data/osm';
import { inBounds, type World } from '../world/world';
import { Network, type Edge } from './network';

const TOPS = [0x2f3b52, 0x8a2f2f, 0xd9d4c8, 0x39424a, 0x4f6b4a, 0xc9a23a, 0x6a4a78, 0x1f1f22, 0xb5533a, 0x3f6f8f, 0xe8e6e0, 0x7a8a99];
const BOTTOMS = [0x23262d, 0x34405a, 0x4a4a4a, 0x6b6253, 0x1c1c1f, 0x2d3a4f, 0x7c7468];

/** A low-poly walker facing +Z. `aLimb` marks arms and legs so the shader can swing them. */
function figureGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  const limbs: [start: number, end: number, pivotY: number, amp: number][] = [];
  const part = (pivotY: number, amp: number, build: () => void): void => {
    const start = b.vertexCount;
    build();
    limbs.push([start, b.vertexCount, pivotY, amp]);
  };
  const skin = 0xd9a98a;
  for (const side of [-1, 1]) {
    part(0.86, side * 0.6, () => {
      b.box(0.15, 0.84, 0.17, xf(side * 0.095, 0.44, 0), 0xffffff, { tint: 2 });
      b.box(0.15, 0.08, 0.26, xf(side * 0.095, 0.04, 0.04), 0x1c1c1e);
    });
    part(1.42, -side * 0.5, () => {
      b.box(0.095, 0.56, 0.11, xf(side * 0.245, 1.15, 0), 0xffffff, { tint: 1 });
      b.box(0.085, 0.1, 0.1, xf(side * 0.245, 0.83, 0), skin);
    });
  }
  part(0, 0, () => {
    b.box(0.39, 0.6, 0.23, xf(0, 1.16, 0), 0xffffff, { tint: 1 });
    b.add(new THREE.SphereGeometry(0.118, 10, 8), xf(0, 1.6, 0.01), skin);
    b.add(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), xf(0, 1.615, -0.012), 0x3a2c22);
  });
  const g = b.build();
  const limb = new Float32Array(b.vertexCount * 3);
  for (const [start, end, pivotY, amp] of limbs) {
    for (let i = start; i < end; i++) {
      limb[i * 3] = pivotY;
      limb[i * 3 + 1] = amp;
    }
  }
  g.setAttribute('aLimb', new THREE.Float32BufferAttribute(limb, 3));
  return g;
}

interface Walker {
  x: number;
  z: number;
  /** Target for plaza wanderers. */
  tx: number;
  tz: number;
  heading: number;
  speed: number;
  phase: number;
  pause: number;
  /** Footpath walkers follow graph edges instead of free targets. */
  edge: Edge | null;
  s: number;
  /** Sideways offset from the path centreline. */
  side: number;
  /** Centre and radius of the area a wanderer roams. */
  home: P2;
  range: number;
}

export interface PeopleSim {
  count: number;
  walking: number;
  positions(): P2[];
}

export function buildPeople(world: World): PeopleSim {
  const rng = mulberry32(191);
  const total = world.quality.people;
  const waiting = Math.min(world.spots.length, Math.round(total * 0.22));
  const count = total + waiting;
  const mesh = new THREE.InstancedMesh(figureGeometry(), tintMaterial({ roughness: 0.85, metalness: 0, secondColor: true, limbs: true }), count);
  const colour2 = new Float32Array(count * 3);
  const walk = new Float32Array(count);
  const walkAttr = new THREE.InstancedBufferAttribute(walk, 1);
  walkAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aWalk', walkAttr);
  mesh.geometry.setAttribute('aColor2', new THREE.InstancedBufferAttribute(colour2, 3));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  world.layers.people.add(mesh);

  const roads = new SegmentIndex<OsmRoad>();
  for (const r of osm.roads) if (r.k !== 'service') roads.add(toRing(r.p), r);
  const onRoad = (x: number, z: number): boolean => {
    const hit = roads.nearest(x, z, 14);
    return !!hit && hit.dist < hit.data.w / 2 + 0.8;
  };
  const walkable = (x: number, z: number): boolean => inBounds(x, z, 20) && !world.collision.blocked(x, z) && !onRoad(x, z);
  const clearWalk = (ax: number, az: number, bx: number, bz: number): boolean => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5));
    for (let i = 1; i <= n; i++) if (!walkable(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  };

  // footpath graph, walkable both ways, limited to the busy middle of the map
  const paths = new Network();
  for (const p of osm.paths) {
    if (p.k === 'steps' || p.bp) continue;
    const pts = toRing(p.p);
    if (Math.hypot(pts[0][0], pts[0][1] + 40) > 520) continue;
    paths.add(p.a, p.b, pts, null);
    paths.add(p.b, p.a, pts.slice().reverse(), null);
  }

  // crowds gather around the plaza, the station forecourt and the park by the tower
  const plaza = centroid(toRing(osm.landmarks.voelkerbrunnen.p));
  const clock = centroid(toRing(osm.landmarks.weltzeituhr.p));
  const tower = centroid(toRing(osm.landmarks.fernsehturm.p));
  const neptune = centroid(toRing(osm.landmarks.neptunbrunnen.p));
  const homes: { c: P2; r: number; weight: number }[] = [
    { c: [(plaza[0] + clock[0]) / 2, (plaza[1] + clock[1]) / 2], r: 105, weight: 5 },
    { c: clock, r: 26, weight: 2 },
    { c: tower, r: 120, weight: 2 },
    { c: neptune, r: 90, weight: 1.5 },
  ];
  const homeWeights = homes.reduce((s, h) => s + h.weight, 0);
  const randomHome = (): { c: P2; r: number } => {
    let roll = rng() * homeWeights;
    for (const h of homes) if ((roll -= h.weight) <= 0) return h;
    return homes[0];
  };
  const spotNear = (c: P2, r: number): P2 | null => {
    for (let tries = 0; tries < 30; tries++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * r;
      const x = c[0] + Math.cos(a) * d;
      const z = c[1] + Math.sin(a) * d;
      if (walkable(x, z)) return [x, z];
    }
    return null;
  };

  const walkers: Walker[] = [];
  const colour = new THREE.Color();
  for (let i = 0; i < total; i++) {
    const onPath = i % 5 < 2 && paths.edges.length > 0;
    const w: Walker = { x: 0, z: 0, tx: 0, tz: 0, heading: 0, speed: 1.05 + rng() * 0.6, phase: rng() * 6.28, pause: 0, edge: null, s: 0, side: (rng() - 0.5) * 2.2, home: [0, 0], range: 0 };
    if (onPath) {
      w.edge = pick(rng, paths.edges);
      w.s = rng() * w.edge.line.length;
    } else {
      const h = randomHome();
      const start = spotNear(h.c, h.r) ?? h.c;
      w.home = h.c;
      w.x = w.tx = start[0];
      w.z = w.tz = start[1];
      w.range = h.r;
    }
    walkers.push(w);
    mesh.setColorAt(i, colour.setHex(pick(rng, TOPS)));
    colour.setHex(pick(rng, BOTTOMS)).toArray(colour2, i * 3);
  }

  // people standing on platforms and at tram stops
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (let i = 0; i < waiting; i++) {
    const spot = world.spots[Math.floor((i * world.spots.length) / waiting)];
    const k = total + i;
    const s = 0.94 + rng() * 0.14;
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    mesh.setMatrixAt(k, m4.compose(pos.set(spot[0] + (rng() - 0.5) * 0.8, spot[1], spot[2] + (rng() - 0.5) * 0.8), q, scale.set(s, s, s)));
    mesh.setColorAt(k, colour.setHex(pick(rng, TOPS)));
    colour.setHex(pick(rng, BOTTOMS)).toArray(colour2, k * 3);
    walk[k] = 0;
  }
  const heights = walkers.map(() => 0.92 + rng() * 0.16);

  const sample = { x: 0, z: 0, tx: 1, tz: 0 };
  const step = (dt: number): void => {
    walkers.forEach((w, i) => {
      let moving = false;
      if (w.edge) {
        w.s += w.speed * dt;
        if (w.s >= w.edge.line.length) {
          const options = paths.outgoing(w.edge.to).filter((e) => e.to !== w.edge!.from);
          const next = options.length ? pick(rng, options) : pick(rng, paths.outgoing(w.edge.to));
          w.edge = next ?? pick(rng, paths.edges);
          w.s = 0;
        }
        w.edge.line.at(w.s, sample);
        w.x = sample.x - sample.tz * w.side;
        w.z = sample.z + sample.tx * w.side;
        w.heading = Math.atan2(sample.tx, sample.tz);
        moving = true;
      } else if (w.pause > 0) {
        w.pause -= dt;
      } else {
        const dx = w.tx - w.x;
        const dz = w.tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          // arrived: maybe linger, then head for somewhere new in sight
          if (rng() < 0.3) w.pause = 2 + rng() * 12;
          for (let tries = 0; tries < 6; tries++) {
            const next = spotNear(w.home, w.range);
            if (next && clearWalk(w.x, w.z, next[0], next[1])) {
              w.tx = next[0];
              w.tz = next[1];
              break;
            }
          }
        } else {
          const stepLen = Math.min(d, w.speed * dt);
          w.x += (dx / d) * stepLen;
          w.z += (dz / d) * stepLen;
          // turn smoothly toward the target
          const want = Math.atan2(dx, dz);
          let turn = want - w.heading;
          turn = ((turn + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          w.heading += THREE.MathUtils.clamp(turn, -4 * dt, 4 * dt);
          moving = true;
        }
      }
      if (moving) {
        w.phase += dt * w.speed * 4.4;
        walk[i] = w.phase;
      } else {
        // ease the limbs back to a standing pose
        walk[i] = w.phase = Math.round(w.phase / Math.PI) * Math.PI;
      }
      q.setFromAxisAngle(up, w.heading);
      const h = heights[i];
      mesh.setMatrixAt(i, m4.compose(pos.set(w.x, 0.01, w.z), q, scale.set(h, h, h)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    walkAttr.needsUpdate = true;
  };
  world.updaters.push(step);
  step(0);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { count, walking: total, positions: () => walkers.map((w) => [w.x, w.z]) };
}
