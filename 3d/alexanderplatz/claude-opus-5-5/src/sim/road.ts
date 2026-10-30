import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, rng } from '../lib/geom';
import { registerNight } from '../scene/night';
import { driveEdges, walkEdges } from '../scene/streets';
import { gentleChooser, Network, Walker, type Link } from './network';

const Y = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector2(), dir = new THREE.Vector2();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();

function tinted(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Hatchback-ish car: white body (tinted per instance), dark glass, black wheels. */
function carGeometry() {
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateX(Math.PI / 2);
  return mergeGeometries([
    tinted(new THREE.BoxGeometry(4.4, 0.75, 1.8).translate(0, 0.62, 0), 0xffffff),
    tinted(new THREE.BoxGeometry(2.5, 0.62, 1.62).translate(-0.25, 1.3, 0), 0x2a3238),
    tinted(new THREE.BoxGeometry(2.3, 0.08, 1.64).translate(-0.25, 1.64, 0), 0xffffff),
    ...[[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]].map(([x, z]) => tinted(wheel.clone().translate(x, 0.33, z), 0x161616)),
  ])!;
}

/** BVG-style yellow double-decker bus. */
function busGeometry() {
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateX(Math.PI / 2);
  return mergeGeometries([
    tinted(new THREE.BoxGeometry(13.7, 3.9, 2.55).translate(0, 2.3, 0), 0xf0c400),
    tinted(new THREE.BoxGeometry(13.2, 0.95, 2.57).translate(0, 3.15, 0), 0x22292e),
    tinted(new THREE.BoxGeometry(12.0, 0.95, 2.57).translate(-0.6, 1.55, 0), 0x22292e),
    tinted(new THREE.BoxGeometry(0.05, 0.95, 2.2).translate(6.86, 3.15, 0), 0x22292e),
    ...[[4.8, 1.1], [4.8, -1.1], [-2.5, 1.1], [-2.5, -1.1], [-4, 1.1], [-4, -1.1]].map(([x, z]) => tinted(wheel.clone().translate(x, 0.5, z), 0x161616)),
  ])!;
}

const CAR_COLORS = ['#f4f4f2', '#1b1c1e', '#8d9196', '#c3c7cb', '#2b3b5c', '#5a5f63', '#7d1f22', '#f1e9c9', '#f1e9c9', '#3c4a3f', '#b8b0a2'];

interface Driver {
  walker: Walker;
  speed: number;
  maxSpeed: number;
  lane: number;
  offset: number;
  length: number;
  bus: boolean;
  key: string;
}

/** Signalised junctions alternate between two approach groups. */
class Signals {
  private ref = new Map<number, THREE.Vector2>();
  constructor(private nodes: Set<number>) {}

  isRed(node: number, heading: THREE.Vector2, time: number) {
    if (!this.nodes.has(node)) return false;
    let ref = this.ref.get(node);
    if (!ref) this.ref.set(node, (ref = heading.clone()));
    const group = Math.abs(ref.dot(heading)) > 0.6 ? 0 : 1;
    const cycle = 44;
    const t = (time + hash(node) * cycle) % cycle;
    const green = group === 0 ? t < 19 : t >= 22 && t < 41;
    return !green;
  }
}

export class RoadTraffic {
  readonly cars = new THREE.Group();
  private drivers: Driver[] = [];
  private carMesh: THREE.InstancedMesh;
  private busMesh: THREE.InstancedMesh;
  private headlights: THREE.InstancedMesh;
  private taillights: THREE.InstancedMesh;
  private net: Network;
  private signals: Signals;
  private entries: Link[];
  private random = rng(99);
  private time = 0;

  constructor(carCount: number, busCount: number) {
    this.cars.name = 'cars';
    this.net = new Network(driveEdges.filter((e) => e.k !== 'service'), true);
    const major = new Set(['primary', 'secondary', 'tertiary']);
    const degree = new Map<number, { n: number; major: boolean }>();
    for (const e of this.net.edges) for (const n of [e.a, e.b]) {
      const d = degree.get(n) ?? { n: 0, major: false };
      d.n++;
      d.major ||= major.has(e.src.k);
      degree.set(n, d);
    }
    this.signals = new Signals(new Set([...degree].filter(([, d]) => d.n >= 3 && d.major).map(([n]) => n)));
    this.entries = this.net.entries();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 });
    this.carMesh = new THREE.InstancedMesh(carGeometry(), material, carCount);
    this.busMesh = new THREE.InstancedMesh(busGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 }), busCount);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, depthWrite: false });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false });
    registerNight(headMat, 1, 0.1, 'opacity');
    registerNight(tailMat, 1, 0.25, 'opacity');
    const lamp = (x: number, w: number) => mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.05, 0.16, 0.34).translate(x, 0.75, s * w)))!;
    const total = carCount + busCount;
    this.headlights = new THREE.InstancedMesh(lamp(2.22, 0.6), headMat, total);
    this.taillights = new THREE.InstancedMesh(lamp(-2.22, 0.62), tailMat, total);
    for (const mesh of [this.carMesh, this.busMesh, this.headlights, this.taillights]) {
      mesh.frustumCulled = false;
      this.cars.add(mesh);
    }
    this.carMesh.castShadow = this.busMesh.castShadow = true;
    this.carMesh.receiveShadow = this.busMesh.receiveShadow = true;

    const choose = gentleChooser(this.random, 100);
    const color = new THREE.Color();
    const roads = this.net.edges.filter((e) => e.length > 20);
    for (let i = 0; i < total; i++) {
      const bus = i >= carCount;
      const pool = bus ? roads.filter((e) => major.has(e.src.k)) : roads;
      const edge = pool[Math.floor(this.random() * pool.length)];
      const forward = edge.src.o ? true : this.random() < 0.5;
      const walker = new Walker(this.net, choose, { edge, forward }, this.random() * edge.length, 30);
      const lanes = Math.max(1, Math.round((edge.src.w ?? 7) / 3.3));
      this.drivers.push({
        walker, speed: 0, maxSpeed: bus ? 9 : 9 + this.random() * 5,
        lane: Math.floor(this.random() * lanes), offset: 0, length: bus ? 13.7 : 4.4, bus, key: '',
      });
      if (!bus) this.carMesh.setColorAt(i, color.set(CAR_COLORS[Math.floor(this.random() * CAR_COLORS.length)]));
    }
  }

  private laneOffset(d: Driver) {
    const e = d.walker.link.edge.src;
    const w = e.w ?? 7;
    if (!e.o) return w / 4;
    const lanes = Math.max(1, Math.round(w / 3.3));
    return (Math.min(d.lane, lanes - 1) - (lanes - 1) / 2) * (w / lanes);
  }

  update(dt: number) {
    this.time += dt;
    // Group drivers by the directed link they are on for simple car following.
    const queues = new Map<string, Driver[]>();
    for (const d of this.drivers) {
      d.key = `${d.walker.link.edge.index}:${d.walker.link.forward}`;
      const list = queues.get(d.key);
      if (list) list.push(d); else queues.set(d.key, [d]);
    }
    for (const list of queues.values()) list.sort((a, b) => a.walker.along - b.walker.along);

    let car = 0, bus = 0;
    this.drivers.forEach((d, index) => {
      const list = queues.get(d.key)!;
      const leader = list[list.indexOf(d) + 1];
      let target = d.maxSpeed * (d.walker.link.edge.src.k === 'residential' ? 0.6 : 1);
      if (leader) target = Math.min(target, Math.max(0, (leader.walker.along - leader.length / 2 - d.walker.along - d.length / 2 - 2.5) * 0.9));
      const { edge, forward } = d.walker.link;
      d.walker.sampleBack(0, pos, dir);
      const remaining = d.walker.remaining;
      if (remaining < 40 && this.signals.isRed(forward ? edge.b : edge.a, dir, this.time)) {
        target = Math.min(target, Math.max(0, (remaining - 6) * 0.7));
      }
      d.speed += THREE.MathUtils.clamp(target - d.speed, -7 * dt, 2.6 * dt);
      d.speed = Math.max(0, d.speed);
      d.walker.advance(d.speed * dt);
      if (d.walker.stuck) {
        const pool = this.entries.length ? this.entries : [d.walker.link];
        d.walker.reset(pool[Math.floor(this.random() * pool.length)], 0);
        d.speed = d.maxSpeed * 0.5;
      }
      d.offset += (this.laneOffset(d) - d.offset) * Math.min(1, dt * 1.5);

      d.walker.sampleBack(0, pos, dir);
      const yaw = -Math.atan2(dir.y, dir.x);
      v3.set(pos.x - dir.y * d.offset, 0.05, pos.y + dir.x * d.offset);
      m4.compose(v3, q.setFromAxisAngle(Y, yaw), s3.set(1, 1, 1));
      if (d.bus) this.busMesh.setMatrixAt(bus++, m4);
      else this.carMesh.setMatrixAt(car++, m4);
      if (d.bus) m4.multiply(new THREE.Matrix4().makeScale(3.1, 1.6, 2));
      this.headlights.setMatrixAt(index, m4);
      this.taillights.setMatrixAt(index, m4);
    });
    for (const mesh of [this.carMesh, this.busMesh, this.headlights, this.taillights]) mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- pedestrians

interface Walkerson {
  walker: Walker;
  speed: number;
  offset: number;
  phase: number;
  height: number;
}

export class Pedestrians {
  readonly group = new THREE.Group();
  private people: Walkerson[] = [];
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private time = 0;
  /** Street-camera position; people walking through it are hidden. */
  avoid: THREE.Vector2 | null = null;

  constructor(count: number, focus: THREE.Vector2) {
    this.group.name = 'pedestrians';
    const net = new Network(walkEdges);
    const r = rng(1234);
    const torsoGeo = new THREE.CapsuleGeometry(0.2, 0.5, 3, 8).scale(1, 1, 0.7).translate(0, 1.18, 0);
    const headGeo = new THREE.SphereGeometry(0.115, 10, 8).translate(0, 1.68, 0);
    const legGeo = new THREE.BoxGeometry(0.13, 0.82, 0.14).translate(0, -0.41, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.torso = new THREE.InstancedMesh(torsoGeo, mat, count);
    this.head = new THREE.InstancedMesh(headGeo, mat, count);
    this.legs = new THREE.InstancedMesh(legGeo, mat, count * 2);
    for (const mesh of [this.torso, this.head, this.legs]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    // Weight spawn points towards the plaza.
    const weights = net.edges.map((e) => {
      const mid = e.pts[Math.floor(e.pts.length / 2)];
      return e.length / Math.pow(1 + mid.distanceTo(focus) / 180, 2.2);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    const choose = gentleChooser(r, 150);
    const shirts = ['#2d3e50', '#b03a2e', '#e5e1d8', '#1d1f22', '#5d6d7e', '#c49a2a', '#2e6b4f', '#7a4b8c', '#d35d6e', '#486a8e', '#8b7355'];
    const pants = ['#20242a', '#2f3b52', '#4a4a4a', '#6b5d4f', '#1a1a1a', '#3e4a5c'];
    const skins = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d4a07a'];
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let pick = r() * sum, k = 0;
      while (k < weights.length - 1 && (pick -= weights[k]) > 0) k++;
      const edge = net.edges[k];
      const walker = new Walker(net, choose, { edge, forward: r() < 0.5 }, r() * edge.length, 4);
      const width = edge.src.w ?? 2.5;
      this.people.push({ walker, speed: 1.1 + r() * 0.5, offset: (r() - 0.5) * Math.max(0.6, width - 0.8), phase: r() * 10, height: 0.92 + r() * 0.16 });
      this.torso.setColorAt(i, color.set(shirts[Math.floor(r() * shirts.length)]));
      this.head.setColorAt(i, color.set(skins[Math.floor(r() * skins.length)]));
      const leg = pants[Math.floor(r() * pants.length)];
      this.legs.setColorAt(i * 2, color.set(leg));
      this.legs.setColorAt(i * 2 + 1, color.set(leg));
    }
  }

  update(dt: number) {
    this.time += dt;
    const legM = new THREE.Matrix4();
    this.people.forEach((p, i) => {
      p.walker.advance(p.speed * dt);
      if (p.walker.stuck) {
        // Turn around at dead ends.
        const { edge, forward } = p.walker.link;
        p.walker.reset({ edge, forward: !forward }, 0);
      }
      p.walker.sampleBack(0, pos, dir);
      const yaw = -Math.atan2(dir.y, dir.x);
      const stride = this.time * p.speed * 5.2 + p.phase;
      const bob = Math.abs(Math.sin(stride)) * 0.04;
      v3.set(pos.x - dir.y * p.offset, bob, pos.y + dir.x * p.offset);
      q.setFromAxisAngle(Y, yaw);
      const tooClose = this.avoid && Math.hypot(v3.x - this.avoid.x, v3.z - this.avoid.y) < 2.5;
      m4.compose(v3, q, s3.setScalar(tooClose ? 0 : p.height));
      this.torso.setMatrixAt(i, m4);
      this.head.setMatrixAt(i, m4);
      for (const side of [0, 1]) {
        const swing = Math.sin(stride + side * Math.PI) * 0.45;
        legM.makeRotationZ(swing).setPosition(0, 0.84, side ? 0.09 : -0.09);
        this.legs.setMatrixAt(i * 2 + side, legM.premultiply(m4));
      }
    });
    for (const mesh of [this.torso, this.head, this.legs]) mesh.instanceMatrix.needsUpdate = true;
  }
}
