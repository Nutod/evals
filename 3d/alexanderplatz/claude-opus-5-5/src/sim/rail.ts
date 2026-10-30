import * as THREE from 'three';
import { osm } from '../osm';
import { rng } from '../lib/geom';
import { canvasTexture } from '../lib/textures';
import { registerNight } from '../scene/night';
import { DECK_Y, heavyRailEdges, tramEdges } from '../scene/streets';
import { gentleChooser, Network, Walker } from './network';

interface Livery {
  body: string;
  lower: string;
  band: [number, number];
  decks?: number;
  doors: number;
}

/** Side elevation: body colours, window band(s) and doors. Canvas y=0 is the roof line. */
function sideTextures(l: Livery) {
  const W = 512, H = 128;
  const windows = (ctx: CanvasRenderingContext2D, color: (i: number) => string) => {
    const decks = l.decks ?? 1;
    for (let d = 0; d < decks; d++) {
      const top = H * (l.band[0] + d * 0.36), h = H * (l.band[1] - l.band[0]);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = color(i + d * 6);
        ctx.fillRect(14 + i * ((W - 28) / 6) + 4, top, (W - 28) / 6 - 8, h);
      }
    }
  };
  const r = rng(l.body.length + l.lower.length);
  const lit = Array.from({ length: 12 }, () => r() < 0.85);
  const map = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = l.body;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = l.lower;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    windows(ctx, () => '#1d2830');
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    for (let i = 0; i < l.doors; i++) {
      const x = ((i + 0.5) / l.doors) * W - 22;
      ctx.strokeRect(x, H * 0.16, 44, H * 0.76);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, 4);
  });
  const glow = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    windows(ctx, (i) => (lit[i] ? '#fff2d0' : '#000'));
  });
  return { map, glow };
}

function vehicleMaterials(l: Livery, roof: number) {
  const { map, glow } = sideTextures(l);
  const side = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, roughness: 0.45, metalness: 0.2 });
  registerNight(side, 1, 0);
  const end = new THREE.MeshStandardMaterial({ color: new THREE.Color(l.body), roughness: 0.4, metalness: 0.2 });
  const top = new THREE.MeshStandardMaterial({ color: roof, roughness: 0.7 });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (length runs along x).
  return [end, end, top, top, side, side];
}

/** Car body along +x; the nose end (+x) is rounded off for cab cars. */
function bodyGeometry(length: number, width: number, height: number, cab: boolean) {
  const g = new THREE.BoxGeometry(length, height, width, 4, 1, 1).translate(0, height / 2 + 0.45, 0);
  if (cab) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      if (x > length / 2 - 0.01 && y > height * 0.55) pos.setX(i, x - 0.7);
    }
    g.computeVertexNormals();
  }
  return g;
}

interface ConsistSpec {
  name: string;
  count: number;
  sections: number;
  sectionLength: number;
  gap: number;
  width: number;
  height: number;
  maxSpeed: number;
  y: number;
  livery: Livery;
  roof: number;
  pantograph?: boolean;
}

interface Stop {
  at: THREE.Vector2;
  lateral: number;
  dwell: number;
}

interface Consist {
  walker: Walker;
  speed: number;
  dwell: number;
  /** Odometer value until which stops are ignored (just served one). */
  cooldown: number;
}

const pos = new THREE.Vector2(), dir = new THREE.Vector2(), pos2 = new THREE.Vector2(), dir2 = new THREE.Vector2();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);

class ConsistSystem {
  readonly group = new THREE.Group();
  private consists: Consist[] = [];
  private cabs: THREE.InstancedMesh;
  private mids: THREE.InstancedMesh;
  private pantographs?: THREE.InstancedMesh;
  private lights: THREE.InstancedMesh;
  private entries;

  constructor(net: Network, private spec: ConsistSpec, private stops: Stop[], seed: number) {
    this.group.name = spec.name;
    const r = rng(seed);
    const materials = vehicleMaterials(spec.livery, spec.roof);
    const { count, sections, sectionLength: L, width: W, height: H } = spec;
    this.cabs = new THREE.InstancedMesh(bodyGeometry(L, W, H, true), materials, count * 2);
    this.mids = new THREE.InstancedMesh(bodyGeometry(L, W, H, false), materials, Math.max(1, count * (sections - 2)));
    for (const mesh of [this.cabs, this.mids]) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    if (spec.pantograph) {
      const parts = [new THREE.BoxGeometry(0.08, 1.4, 1.6).rotateZ(0.6).translate(0, H + 1.2, 0), new THREE.BoxGeometry(0.3, 0.06, 1.8).translate(0.4, H + 1.85, 0)];
      this.pantographs = new THREE.InstancedMesh(mergeBoxes(parts), new THREE.MeshStandardMaterial({ color: 0x3b3f42, metalness: 0.6, roughness: 0.5 }), count);
      this.pantographs.frustumCulled = false;
      this.group.add(this.pantographs);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, depthWrite: false });
    registerNight(lightMat, 1, 0.15, 'opacity');
    const lightGeo = mergeBoxes([-1, 1].map((s) => new THREE.BoxGeometry(0.05, 0.25, 0.35).translate(L / 2 + 0.03, 1.1, s * (W / 2 - 0.45))));
    this.lights = new THREE.InstancedMesh(lightGeo, lightMat, count);
    this.lights.frustumCulled = false;
    this.group.add(this.lights);

    this.entries = net.entries();
    const choose = gentleChooser(r, 60);
    const total = this.length;
    // Spread consists along long edges so they don't start bunched.
    const candidates = net.edges.filter((e) => e.length > total * 0.5);
    for (let i = 0; i < count; i++) {
      const edge = candidates[Math.floor(r() * candidates.length)] ?? net.edges[0];
      const walker = new Walker(net, choose, { edge, forward: r() < 0.5 }, Math.min(edge.length, total), total + 60);
      this.consists.push({ walker, speed: spec.maxSpeed * (0.6 + r() * 0.4), dwell: 0, cooldown: 0 });
    }
  }

  get length() {
    return this.spec.sections * (this.spec.sectionLength + this.spec.gap);
  }

  update(dt: number) {
    const { sections, sectionLength: L, gap, maxSpeed, y } = this.spec;
    let cab = 0, mid = 0;
    this.consists.forEach((c, index) => {
      // Speed control: brake towards upcoming stops, dwell, then pull away.
      let target = maxSpeed;
      if (c.dwell > 0) {
        c.dwell -= dt;
        target = 0;
        c.speed = 0;
      } else {
        c.walker.sampleBack(this.length / 2, pos, dir);
        for (const stop of this.stops) {
          if (c.walker.odometer < c.cooldown) break;
          const to = pos2.subVectors(stop.at, pos);
          const along = to.dot(dir);
          const lateral = Math.abs(to.cross(dir));
          if (lateral > stop.lateral || along < -1 || along > 90) continue;
          if (along < 0.6) {
            c.dwell = stop.dwell;
            c.cooldown = c.walker.odometer + 120;
            break;
          }
          target = Math.min(target, Math.max(1.2, Math.sqrt(2 * 0.9 * along)));
        }
      }
      c.speed += THREE.MathUtils.clamp(target - c.speed, -2.5 * dt, 1.1 * dt);
      c.walker.advance(c.speed * dt);
      if (c.walker.stuck && this.entries.length) {
        const entry = this.entries[Math.floor(Math.random() * this.entries.length)];
        c.walker.reset(entry, Math.min(entry.edge.length, this.length));
        c.cooldown = 0;
      }

      for (let k = 0; k < sections; k++) {
        const front = k * (L + gap);
        c.walker.sampleBack(front, pos, dir);
        c.walker.sampleBack(front + L, pos2, dir2);
        const heading = dir.copy(pos).sub(pos2);
        if (heading.lengthSq() < 1e-6) heading.copy(dir2);
        const yaw = -Math.atan2(heading.y, heading.x) + (k === sections - 1 ? Math.PI : 0);
        v3.set((pos.x + pos2.x) / 2, y, (pos.y + pos2.y) / 2);
        m4.compose(v3, q.setFromAxisAngle(Y, yaw), s3);
        if (k === 0 || k === sections - 1) this.cabs.setMatrixAt(cab++, m4);
        else this.mids.setMatrixAt(mid++, m4);
        if (k === 0) this.lights.setMatrixAt(index, m4);
        if (k === 1 && this.pantographs) this.pantographs.setMatrixAt(index, m4);
      }
    });
    for (const mesh of [this.cabs, this.mids, this.lights, this.pantographs]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }
}

function mergeBoxes(parts: THREE.BufferGeometry[]) {
  const positions: number[] = [], normals: number[] = [];
  for (const p of parts) {
    const g = p.toNonIndexed();
    positions.push(...(g.attributes.position.array as Float32Array));
    normals.push(...(g.attributes.normal.array as Float32Array));
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}

export interface RailTraffic {
  trams: ConsistSystem;
  sbahn: ConsistSystem;
  regional: ConsistSystem;
}

export function buildRailTraffic(stationCenter: THREE.Vector2): RailTraffic {
  const tramStops: Stop[] = osm.stops.filter((s) => s.k === 'tram').map((s) => ({ at: new THREE.Vector2(...s.p), lateral: 4, dwell: 14 }));
  const stationStop: Stop[] = [{ at: stationCenter, lateral: 25, dwell: 22 }];

  const trams = new ConsistSystem(new Network(tramEdges), {
    name: 'trams', count: 11, sections: 5, sectionLength: 7.6, gap: 0.5, width: 2.4, height: 3.0, maxSpeed: 11, y: 0.05, roof: 0xd8d8d4, pantograph: true,
    // BVG yellow with dark window band.
    livery: { body: '#f0c800', lower: '#3c3f41', band: [0.2, 0.62], doors: 2 },
  }, tramStops, 11);

  const sbahnNet = new Network(heavyRailEdges.filter((e) => e.k === 'light_rail'));
  const sbahn = new ConsistSystem(sbahnNet, {
    name: 'sbahn', count: 6, sections: 6, sectionLength: 18.4, gap: 0.6, width: 3.0, height: 3.4, maxSpeed: 16, y: DECK_Y + 0.15, roof: 0x6b6f72,
    // Berlin S-Bahn red and ochre.
    livery: { body: '#e3a92f', lower: '#9e2a25', band: [0.2, 0.58], doors: 3 },
  }, stationStop, 21);

  const regional = new ConsistSystem(new Network(heavyRailEdges.filter((e) => e.k === 'rail')), {
    name: 'regional', count: 2, sections: 5, sectionLength: 26.8, gap: 0.6, width: 2.8, height: 4.3, maxSpeed: 18, y: DECK_Y + 0.15, roof: 0x8a8d90,
    livery: { body: '#c8161d', lower: '#e9e9e6', band: [0.14, 0.36], decks: 2, doors: 2 },
  }, stationStop, 31);
  return { trams, sbahn, regional };
}
