// The people of Dale and the Mountain, in three streamed pools:
//  - the townsfolk of noon, uneasy in the shadow hour and fleeing as the dragon circles;
//  - silhouettes running over the bridges and down the southern road at dusk;
//  - the long line of lanterns walking south beside the river by night.
// Every routine is a function of the hour and the clock, so scrubbing never
// leaves anyone stranded: they walk back out of the doors they ran into.
import * as THREE from 'three';
import { BRIDGES, GATE, GATE_ROAD, PLAZA, QUAY_D, SOUTH_ROAD, TERRACES, TOWERS, TOWN, WEST_PATH, bankX, riverAt, terraceFront, terraceLevel, terrainHeight } from '../core/layout.js';
import { Path, band, lerp, pick, rng, ss } from '../core/util.js';
import { Billboards } from '../fx/particles.js';
import { fieldMask } from '../world/terrain.js';
import { ANIM, CARRY, Crowd } from './figures.js';

const DALE_CLOTH = ['#3f5f86', '#5b7a4a', '#8a4a30', '#b8a888', '#6a4f7a', '#a87a3a', '#4a6a6a', '#7a3a3a', '#c8b898', '#2f4a62'];
const DWARF_CLOTH = ['#2a3f6a', '#3a4f3a', '#5a2a2a', '#4a4a52', '#6a4a2a', '#24344f', '#3f2f4a'];
const CHILD_CLOTH = ['#c84a3a', '#d8a83a', '#3a7ab8', '#5aa05a', '#e0d0b0', '#b85a8a'];
const KINDS = {
  man: { sx: 1.62, sy: 1.76, dwarf: 0 },
  woman: { sx: 1.5, sy: 1.64, dwarf: 0 },
  child: { sx: 1.0, sy: 1.08, dwarf: 0 },
  dwarf: { sx: 1.62, sy: 1.3, dwarf: 1 },
};

const pingpong = (s, L) => {
  const m = ((s % (2 * L)) + 2 * L) % (2 * L);
  return m < L ? [m, 1] : [2 * L - m, -1];
};
const wrap = (s, L) => ((s % L) + L) % L;

function streetPaths() {
  const paths = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k <= TERRACES; k++) {
      const d = k === 0 ? QUAY_D - 6 : terraceFront(k) + 2.6;
      const pts = [];
      for (let z = TOWN.z0 + 6; z <= TOWN.z1 - 6; z += 10) {
        if (side > 0 && k >= 1 && k <= 3 && z > PLAZA.z0 - 2 && z < PLAZA.z1 + 2) continue;
        pts.push([bankX(z, side, d), z, terraceLevel(k, z)]);
      }
      // Split at the gap the square leaves on the east bank.
      let run = [];
      for (let i = 0; i < pts.length; i++) {
        if (run.length && pts[i][1] - run[run.length - 1][1] > 15) {
          if (run.length > 2) paths.push(new Path(run));
          run = [];
        }
        run.push(pts[i]);
      }
      if (run.length > 2) paths.push(new Path(run));
    }
  }
  return paths;
}

function plazaPaths() {
  const out = [];
  for (const d of [46, 60, 88, 102]) {
    const pts = [];
    for (let z = PLAZA.z0 + 3; z <= PLAZA.z1 - 3; z += 6) pts.push([bankX(z, 1, d), z, terraceLevel(1, z)]);
    out.push(new Path(pts));
  }
  const cross = [];
  for (let d = 34; d <= 120; d += 6) cross.push([bankX(0, 1, d), 0, terraceLevel(1, 0)]);
  out.push(new Path(cross));
  return out;
}

function bridgePaths() {
  return BRIDGES.map((b) => {
    const pts = [];
    for (let d = -QUAY_D - 4; d <= QUAY_D + 4; d += 3) {
      const x = bankX(b.z, 1, d);
      pts.push([x, b.z + (d > 0 ? 0.8 : -0.8) * 0, b.deckY ? b.deckY(x) + 0.05 : b.y]);
    }
    return new Path(pts);
  });
}

/** Nearest door to a point, for running to shelter. */
function nearestDoor(doors, x, z) {
  let best = doors[0], bd = Infinity;
  for (const d of doors) {
    if (d.k < 0) continue;
    const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

const P = { x: 0, y: 0, z: 0, tx: 0, tz: 1 };

class Pool {
  constructor(name, people, ponies, capacityPeople, capacityPonies) {
    // The stream shows and hides this group as the hour comes and goes.
    this.group = new THREE.Group();
    this.group.name = name;
    this.scene = this.group;
    this.people = people;
    this.ponies = ponies;
    this.crowd = new Crowd(this.group, 'person', capacityPeople, name);
    this.herd = ponies.length ? new Crowd(this.group, 'pony', capacityPonies, `${name}-ponies`) : null;
    this.anim = [0, 0, 0, 0];
    this.look = [0, 0, 0, 0];
  }

  draw(S, agents, crowd, frac) {
    crowd.begin(S.camera);
    const n = Math.floor(agents.length * frac);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.keep && i > n) continue;
      const p = a.pose(S, a, this.anim, this.look);
      if (!p) continue;
      crowd.push(p.x, p.y, p.z, p.rot, a.sx * (p.scale ?? 1), a.sy * (p.scale ?? 1), a.color, this.anim, this.look);
    }
    crowd.end();
  }

  update(S) {
    const frac = S.density * (0.35 + 0.65 * S.scale);
    this.draw(S, this.people, this.crowd, frac);
    if (this.herd) this.draw(S, this.ponies, this.herd, frac);
  }

  dispose() {
    this.crowd.dispose(this.scene);
    this.herd?.dispose(this.scene);
  }
}

function person(rand, kind, extra = {}) {
  const K = KINDS[kind];
  const pal = kind === 'dwarf' ? DWARF_CLOTH : kind === 'child' ? CHILD_CLOTH : DALE_CLOTH;
  const v = 0.9 + rand() * 0.2;
  return {
    kind,
    sx: K.sx * v,
    sy: K.sy * v,
    dwarf: K.dwarf,
    color: new THREE.Color(pick(rand, pal)).offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08),
    shade: rand(),
    phase: rand() * 6.28,
    r: rand(),
    ...extra,
  };
}

const randomKind = (rand, dwarves = 0.25) => {
  const r = rand();
  return r < dwarves ? 'dwarf' : r < dwarves + 0.12 ? 'child' : r < dwarves + 0.42 ? 'woman' : 'man';
};

/** Shared flight to shelter as the dragon comes: returns null once indoors. */
function flee(S, a, out, anim) {
  const f = ss(a.fleeAt, a.fleeAt + 0.2 + a.r * 0.08, S.t);
  if (f <= 0) return false;
  if (f >= 0.985) return null;
  const e = f * f;
  const tx = a.door.x, tz = a.door.z;
  out.x = lerp(out.x, tx, e);
  out.z = lerp(out.z, tz, e);
  out.y = lerp(out.y, a.door.y, e);
  out.rot = Math.atan2(tx - out.x, tz - out.z);
  anim[0] = ANIM.run;
  anim[2] = 9;
  return true;
}

function setLook(look, a, turn = 0) {
  look[0] = a.dwarf;
  look[1] = turn;
  look[2] = a.shade;
  look[3] = a.king ? 1 : 0;
}

export class Population {
  constructor(scene, stream, world) {
    this.world = world;
    this.vignettes = [];
    const doors = world.houses.doors;
    const market = world.market;
    const streets = streetPaths();
    const aisles = plazaPaths();
    const bridges = bridgePaths();
    this.bridges = bridges;

    // ---------- the townsfolk: noon, shadow, circling ----------
    const vignette = (this.v = {});
    stream.add('townsfolk', [0, 2.5], () => {
      const rand = rng(1234);
      const people = [];
      const ponies = [];
      const out = { x: 0, y: 0, z: 0, rot: 0 };
      const walker = (path, kind, opts = {}) => {
        const a = person(rand, kind, { path, s0: rand() * path.length * 2, v: 0.9 + rand() * 0.6, ...opts });
        const home = path.at(rand() * path.length, P);
        a.door = opts.door || nearestDoor(doors, home.x, home.z);
        a.fleeAt = opts.fleeAt ?? 1.66 + rand() * 0.42;
        a.pose = (S, a, anim, look) => {
          const [s, dir] = a.loop ? [wrap(a.s0 + a.v * S.time * a.dir, a.path.length), a.dir] : pingpong(a.s0 + a.v * S.time, a.path.length);
          a.path.at(s, P);
          out.x = P.x + P.tz * a.lane;
          out.z = P.z - P.tx * a.lane;
          out.y = P.y;
          out.rot = Math.atan2(P.tx * dir, P.tz * dir);
          anim[0] = a.carry === CARRY.chest ? ANIM.overhead : ANIM.walk;
          anim[1] = a.phase;
          anim[2] = a.v * 5.2;
          anim[3] = a.carry || 0;
          setLook(look, a);
          if (a.loop && (s < 6 || s > a.path.length - 4)) return null;
          const fl = flee(S, a, out, anim);
          if (fl === null) return null;
          return out;
        };
        a.lane = (rand() - 0.5) * 3.2;
        people.push(a);
        return a;
      };
      const stander = (x, y, z, rot, kind, anim0, opts = {}) => {
        const a = person(rand, kind, { x, y, z, rot, anim0, ...opts });
        a.door = opts.door || nearestDoor(doors, x, z);
        a.fleeAt = opts.fleeAt ?? 1.64 + rand() * 0.4;
        a.pose = (S, a, anim, look) => {
          out.x = a.x; out.y = a.y; out.z = a.z; out.rot = a.rot;
          anim[0] = a.anim0; anim[1] = a.phase; anim[2] = a.speed || 2.2; anim[3] = a.carry || 0;
          setLook(look, a, a.turn ? Math.sin(S.time * 0.4 + a.phase) * 0.6 : 0);
          if (a.watcher) {
            // The shadow hour: turn to the north and point.
            const w = band(S.t, 0.72 + a.r * 0.15, 0.92 + a.r * 0.1, 1.6, 1.75);
            if (w > 0.5) {
              out.rot = Math.PI + (a.r - 0.5) * 0.5;
              anim[0] = ANIM.point;
            }
          }
          if (a.uneasy && S.t > 0.8 && S.t < 1.7) look[1] = Math.sin(S.time * 0.9 + a.phase) * 0.9;
          if (a.window && !a.window(S)) return null;
          const fl = flee(S, a, out, anim);
          if (fl === null) return null;
          return out;
        };
        people.push(a);
        return a;
      };

      // Street walkers on every terrace and quay.
      for (let i = 0; i < 950; i++) walker(pick(rand, streets), randomKind(rand));
      // Standers, gossiping in pairs; some will turn north and point.
      for (let i = 0; i < 300; i++) {
        const path = pick(rand, streets);
        path.at(rand() * path.length, P);
        const off = 1.5 + rand() * 2;
        const rot = rand() * 6.28;
        for (let j = 0; j < (rand() < 0.6 ? 2 : 1); j++) {
          const x = P.x + P.tz * off + Math.sin(rot) * j * 0.9, z = P.z - P.tx * off + Math.cos(rot) * j * 0.9;
          stander(x, P.y, z, rot + j * Math.PI, randomKind(rand), rand() < 0.5 ? ANIM.haggle : ANIM.idle, { watcher: rand() < 0.3, uneasy: true, speed: 1.6 + rand() });
        }
      }
      // The market: shoppers in the aisles, browsers at the stalls, a vendor behind every table.
      for (let i = 0; i < 260; i++) walker(pick(rand, aisles), randomKind(rand, 0.3), { v: 0.6 + rand() * 0.5 });
      for (const s of market.stalls) {
        const fwd = [Math.sin(s.rot), Math.cos(s.rot)];
        stander(s.x - fwd[0] * 0.7, s.y, s.z - fwd[1] * 0.7, s.rot, rand() < 0.3 ? 'dwarf' : rand() < 0.5 ? 'woman' : 'man', ANIM.haggle, { speed: 1.4 + rand(), watcher: rand() < 0.15 });
        const nb = s.isToy ? 0 : Math.floor(rand() * 3);
        for (let j = 0; j < nb; j++) {
          const a = (rand() - 0.5) * 3.6;
          const right = [Math.cos(s.rot), -Math.sin(s.rot)];
          stander(s.x + fwd[0] * 2.3 + right[0] * a, s.y, s.z + fwd[1] * 2.3 + right[1] * a, s.rot + Math.PI, randomKind(rand, 0.3), rand() < 0.6 ? ANIM.haggle : ANIM.idle, { speed: 1.2 + rand(), uneasy: true });
        }
      }
      // Children crowding the toy-maker's stall.
      const toy = market.toy;
      const tf = [Math.sin(toy.rot), Math.cos(toy.rot)];
      for (let i = 0; i < 16; i++) {
        const a = (rand() - 0.5) * 6, b = 2.2 + rand() * 2.4;
        const right = [Math.cos(toy.rot), -Math.sin(toy.rot)];
        stander(toy.x + tf[0] * b + right[0] * a, toy.y, toy.z + tf[1] * b + right[1] * a, toy.rot + Math.PI + (rand() - 0.5), 'child', rand() < 0.5 ? ANIM.jump : ANIM.idle, { speed: 3 + rand() * 2, fleeAt: 1.62 + rand() * 0.2 });
      }
      // The child who lets a clockwork bird go with the wild ones.
      const childPos = new THREE.Vector3(toy.x + tf[0] * 4.6, toy.y, toy.z + tf[1] * 4.6);
      vignette.child = childPos;
      stander(childPos.x, childPos.y, childPos.z, Math.PI * 0.9, 'child', ANIM.idle, {
        keep: true,
        color: new THREE.Color('#d8a83a'),
        fleeAt: 1.9,
        window: () => true,
        speed: 3,
      }).pose = ((base) => (S, a, anim, look) => {
        const o = base(S, a, anim, look);
        if (o && S.t > 0.75 && S.t < 1.85) anim[0] = ANIM.jump;
        return o;
      })(people[people.length - 1].pose);

      // A dwarf and a man haggling over a chest.
      const hs = market.stalls[Math.floor(market.stalls.length * 0.45)];
      const hf = [Math.sin(hs.rot), Math.cos(hs.rot)];
      const hx = hs.x + hf[0] * 2.6, hz = hs.z + hf[1] * 2.6;
      stander(hx - 0.7, hs.y, hz, Math.PI / 2, 'dwarf', ANIM.front, { keep: true, carry: CARRY.chest, speed: 2, color: new THREE.Color('#2a3f6a') });
      stander(hx + 0.75, hs.y, hz, -Math.PI / 2, 'man', ANIM.haggle, { keep: true, speed: 2.2, color: new THREE.Color('#8a4a30') });
      vignette.haggle = new THREE.Vector3(hx, hs.y, hz);

      // Smiths at their anvils.
      for (const f of market.forges) {
        const fw = [Math.sin(f.rot), Math.cos(f.rot)];
        stander(f.x - fw[0] * 0.75, f.y, f.z - fw[1] * 0.75, f.rot, rand() < 0.6 ? 'dwarf' : 'man', ANIM.hammer, { keep: true, phase: f.phase, fleeAt: 1.85 + rand() * 0.2 });
        stander(f.x + fw[0] * 1.6 + 1.2, f.y, f.z + fw[1] * 1.6, f.rot + Math.PI, 'man', ANIM.idle, { fleeAt: 1.8 });
      }
      // Harpers by the fountain, and the people listening.
      const fz = market.fountain;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        stander(fz.x + Math.cos(a) * 6.4, fz.y + 0.3, fz.z + Math.sin(a) * 6.4, Math.atan2(Math.cos(a), Math.sin(a)), i % 2 ? 'man' : 'dwarf', i < 3 ? ANIM.sit : ANIM.idle, { speed: 2 });
      }
      // Porters on the Gate road: dwarves bring finished work down; men carry grain and wool up.
      const gateDoor = { x: GATE.x, y: GATE.y, z: GATE.z - 12 };
      for (let i = 0; i < 260; i++) {
        const down = rand() < 0.5;
        const a = walker(GATE_ROAD, down ? 'dwarf' : rand() < 0.8 ? 'man' : 'woman', {
          loop: true,
          dir: down ? -1 : 1,
          s0: rand() * GATE_ROAD.length,
          v: 0.8 + rand() * 0.4,
          carry: down ? (rand() < 0.75 ? CARRY.chest : CARRY.none) : rand() < 0.8 ? CARRY.sack : CARRY.none,
        });
        // Those nearer the Gate run for it; the rest run down into Dale.
        const s0 = wrap(a.s0, GATE_ROAD.length);
        if (a.dwarf || s0 > GATE_ROAD.length * 0.55) a.door = gateDoor;
        a.lane = (down ? -1 : 1) * (1.2 + rand() * 1.4);
      }
      // Pack ponies walking up with the men.
      for (let i = 0; i < 60; i++) {
        const a = { ...person(rand, 'man'), sx: 1.25, sy: 1.25, path: GATE_ROAD, s0: rand() * GATE_ROAD.length, v: 0.9 + rand() * 0.2, loop: true, dir: rand() < 0.6 ? 1 : -1, lane: 0 };
        a.color = new THREE.Color(pick(rand, ['#6a4a30', '#8a6a48', '#3a2a20', '#a08060', '#5a5048']));
        a.lane = a.dir * 2.4;
        a.door = a.dir > 0 ? nearestDoor(doors, 30, -330) : gateDoor;
        a.fleeAt = 1.7 + rand() * 0.3;
        a.pose = (S, a, anim, look) => {
          const s = wrap(a.s0 + a.v * S.time * a.dir, a.path.length);
          if (s < 6 || s > a.path.length - 4) return null;
          a.path.at(s, P);
          out.x = P.x + P.tz * a.lane; out.z = P.z - P.tx * a.lane; out.y = P.y;
          out.rot = Math.atan2(P.tx * a.dir, P.tz * a.dir);
          anim[0] = ANIM.walk; anim[1] = a.phase; anim[2] = a.v * 6; anim[3] = 1;
          look[0] = 0; look[1] = 0; look[2] = 0; look[3] = 0;
          if (flee(S, a, out, anim) === null) return null;
          return out;
        };
        ponies.push(a);
      }
      // Tethered ponies at the edge of the square, pulling at their ropes in the hot wind.
      for (let i = 0; i < 14; i++) {
        const z = PLAZA.z0 + 6 + i * 7;
        const a = { ...person(rand, 'man'), sx: 1.25, sy: 1.25 };
        a.color = new THREE.Color(pick(rand, ['#6a4a30', '#8a6a48', '#3a2a20', '#d8d0c0']));
        a.x = bankX(z, 1, PLAZA.d1 - 8); a.y = terraceLevel(1, z); a.z = z;
        a.fleeAt = 1.75 + rand() * 0.2;
        a.door = { x: a.x - 40, y: a.y, z: a.z + 160 };
        a.pose = (S, a, anim, look) => {
          out.x = a.x; out.y = a.y; out.z = a.z; out.rot = -Math.PI / 2 + Math.sin(S.time * 0.3 + a.phase) * 0.2;
          anim[0] = ANIM.idle; anim[1] = a.phase; anim[2] = 1; anim[3] = 0;
          look[0] = 0; look[1] = band(S.t, 0.55, 0.85, 1.8, 2.0) * (1 + Math.sin(S.time * 3 + a.phase)); look[2] = 0; look[3] = 0;
          const f = flee(S, a, out, anim);
          if (f === null) return null;
          if (f) anim[0] = 2;
          return out;
        };
        ponies.push(a);
      }
      // Walkers on the bridges and folk along the quays.
      for (let i = 0; i < 90; i++) walker(pick(rand, bridges), randomKind(rand), { v: 0.8 + rand() * 0.5 });
      for (let i = 0; i < 60; i++) {
        const z = TOWN.z0 + 20 + rand() * (TOWN.z1 - TOWN.z0 - 40);
        const side = rand() < 0.5 ? -1 : 1;
        const r = riverAt(z);
        stander(bankX(z, side, r.w + 2.5), terraceLevel(0, z), z, side > 0 ? -Math.PI / 2 : Math.PI / 2, rand() < 0.8 ? 'man' : 'child', ANIM.idle, { turn: true, watcher: rand() < 0.2 });
      }
      // Reapers in the barley south of the falls.
      for (let i = 0; i < 80; i++) {
        let x, z, h;
        for (let k = 0; k < 30; k++) {
          x = -500 + rand() * 1000; z = 300 + rand() * 700; h = terrainHeight(x, z);
          if (fieldMask(x, z, h) > 0.6) break;
        }
        const a = stander(x, h, z, rand() * 6.28, rand() < 0.7 ? 'man' : 'woman', rand() < 0.5 ? ANIM.hammer : ANIM.idle, { speed: 2, watcher: rand() < 0.4, phase: rand(), door: { x: x + 30, y: h, z: z + 180 } });
        a.fleeAt = 1.7 + rand() * 0.3;
      }
      // Watchers on the bell towers, pointing north in the shadow hour.
      for (const t of TOWERS) {
        for (const o of [-2.4, 2.4]) {
          stander(t.x + o, t.y + t.h - 13.2, t.z + 3.8, Math.PI, 'man', ANIM.point, { keep: true, window: (S) => band(S.t, 0.7, 0.85, 1.65, 1.8) > 0.5, fleeAt: 9 });
        }
      }
      // The sentry hauling on the Gate chain as the doors grind shut.
      const g = world.gate.chainBottom;
      stander(g.x + 1.4, GATE.y, g.z + 1.6, -0.5, 'dwarf', ANIM.pull, { keep: true, color: new THREE.Color('#5a2a2a'), window: (S) => band(S.t, 1.55, 1.7, 2.6, 2.75) > 0.5, fleeAt: 9, speed: 1.6 });
      stander(g.x + 3.2, GATE.y, g.z + 2.4, -0.6, 'dwarf', ANIM.pull, { keep: true, color: new THREE.Color('#2a3f6a'), window: (S) => band(S.t, 1.62, 1.75, 2.55, 2.7) > 0.5, fleeAt: 9, speed: 1.6, phase: 1.3 });

      const pool = new Pool('townsfolk', people, ponies, people.length, ponies.length);
      return { object: pool.group, update: (S) => pool.update(S), dispose: () => pool.dispose() };
    });

    // ---------- dusk: silhouettes running for the south ----------
    const flightPaths = this.flightPaths();
    stream.add('flight', [2.55, 3.55], () => {
      const rand = rng(77);
      const people = [];
      const out = { x: 0, y: 0, z: 0, rot: 0 };
      for (let i = 0; i < 360; i++) {
        const path = pick(rand, flightPaths);
        const a = person(rand, randomKind(rand, 0.15), { path, s0: rand() * path.length, v: 3.2 + rand() * 1.8, lane: (rand() - 0.5) * 3 });
        if (rand() < 0.15) a.carry = CARRY.sack;
        a.pose = (S, a, anim, look) => {
          const vis = band(S.t, 2.55 + a.r * 0.12, 2.72 + a.r * 0.12, 3.3 + a.r * 0.15, 3.5 + a.r * 0.1);
          if (vis < 0.5) return null;
          const s = wrap(a.s0 + a.v * S.time, a.path.length);
          if (s > a.path.length - 10) return null;
          a.path.at(s, P);
          out.x = P.x + P.tz * a.lane; out.z = P.z - P.tx * a.lane; out.y = P.y;
          out.rot = Math.atan2(P.tx, P.tz);
          anim[0] = ANIM.run; anim[1] = a.phase; anim[2] = 9 + a.v; anim[3] = a.carry || 0;
          setLook(look, a);
          return out;
        };
        people.push(a);
      }
      // A family crossing the bridge with a cradle.
      const fam = flightPaths[0];
      const famS0 = 10;
      [['man', CARRY.cradle, 0, '#5a4a3a'], ['woman', 0, -2.2, '#6a3a3a'], ['child', 0, -3.6, '#c84a3a']].forEach(([kind, carry, off, col]) => {
        const a = person(rand, kind, { keep: true, carry, off, color: new THREE.Color(col) });
        a.pose = (S, a, anim, look) => {
          if (band(S.t, 2.6, 2.75, 3.35, 3.5) < 0.5) return null;
          const s = wrap(famS0 + S.time * 2.6, 220) + a.off;
          fam.at(Math.max(0, s), P);
          out.x = P.x + P.tz * (kind === 'man' ? 0 : 0.8); out.z = P.z - P.tx * 0.8; out.y = P.y;
          out.rot = Math.atan2(P.tx, P.tz);
          anim[0] = carry ? ANIM.front : ANIM.run; anim[1] = a.phase; anim[2] = 8; anim[3] = carry;
          setLook(look, a);
          return out;
        };
        people.push(a);
      });
      const pool = new Pool('flight', people, [], people.length, 0);
      return { object: pool.group, update: (S) => pool.update(S), dispose: () => pool.dispose() };
    });
    this.familyAt = (S) => {
      const s = wrap(10 + (S?.time ?? 0) * 2.6, 220);
      return flightPaths[0].at(s, { x: 0, y: 0, z: 0 });
    };

    // ---------- night: the long line of lanterns ----------
    stream.add('lantern-line', [3.3, 4], () => {
      const rand = rng(4242);
      const people = [];
      const ponies = [];
      const out = { x: 0, y: 0, z: 0, rot: 0 };
      const lines = [
        { path: SOUTH_ROAD, n: 720, gap: 2.3, head: 1250 },
        { path: WEST_PATH, n: 240, gap: 2.6, head: 900 },
      ];
      this.lanterns = [];
      for (const [li, L] of lines.entries()) {
        for (let i = 0; i < L.n; i++) {
          const king = li === 0 && i === 0;
          const kind = king ? 'dwarf' : randomKind(rand, 0.35);
          const a = person(rand, kind, { keep: king, king, li, i, line: L, lane: (i % 2 ? 1 : -1) * (0.6 + rand() * 0.5) });
          if (king) {
            a.color = new THREE.Color('#3a2a5a');
            a.shade = 0.95;
          }
          a.carry = king ? CARRY.none : rand() < 0.42 ? CARRY.lantern : rand() < 0.12 ? CARRY.sack : rand() < 0.05 ? CARRY.chest : CARRY.none;
          a.pose = (S, a, anim, look) => {
            const vis = ss(3.3 + a.r * 0.4, 3.42 + a.r * 0.4, S.t);
            if (vis <= 0.01) return null;
            const L = a.line;
            const s = L.head + S.time * 0.75 - a.i * L.gap;
            if (s < 4 || s > L.path.length - 2) return null;
            L.path.at(s, P);
            out.x = P.x + P.tz * a.lane; out.z = P.z - P.tx * a.lane; out.y = P.y;
            out.rot = Math.atan2(P.tx, P.tz);
            out.scale = vis;
            anim[0] = a.carry === CARRY.chest ? ANIM.front : ANIM.walk; anim[1] = a.phase; anim[2] = 3.6; anim[3] = a.carry;
            // The old king looks back, once, toward the Mountain.
            const back = a.king ? band((S.time % 46) / 46, 0.45, 0.5, 0.62, 0.68) * 2.3 : 0;
            setLook(look, a, back);
            return out;
          };
          people.push(a);
          if (a.carry === CARRY.lantern) this.lanterns.push(a);
          // Ponies and laden carts at intervals.
          if (!king && i % 16 === 7) {
            const pny = { ...person(rand, 'man'), sx: 1.25, sy: 1.25, i: i + 0.5, line: L, lane: 0 };
            pny.color = new THREE.Color(pick(rand, ['#6a4a30', '#3a2a20', '#8a6a48']));
            pny.pose = (S, a, anim, look) => {
              const vis = ss(3.35, 3.6, S.t);
              if (vis <= 0.01) return null;
              const s = a.line.head + S.time * 0.75 - a.i * a.line.gap;
              if (s < 4 || s > a.line.path.length - 2) return null;
              a.line.path.at(s, P);
              out.x = P.x; out.z = P.z; out.y = P.y; out.rot = Math.atan2(P.tx, P.tz); out.scale = vis;
              anim[0] = ANIM.walk; anim[1] = a.phase; anim[2] = 4.2; anim[3] = 1;
              look[0] = 0; look[1] = 0; look[2] = 0; look[3] = 0;
              return out;
            };
            ponies.push(pny);
          }
        }
      }
      const glow = new Billboards('live', this.lanterns.length);
      const pool = new Pool('lantern-line', people, ponies, people.length, ponies.length);
      pool.group.add(glow.mesh);
      return {
        object: pool.group,
        update: (S) => {
          pool.update(S);
          // Lantern halos, so the line reads from the far slopes.
          const o = glow.origin.array, prm = glow.param.array;
          let n = 0;
          const frac = S.density * (0.35 + 0.65 * S.scale);
          for (const a of this.lanterns) {
            if (a.i > a.line.n * frac) continue;
            const L = a.line;
            const s = L.head + S.time * 0.75 - a.i * L.gap;
            const vis = ss(3.3 + a.r * 0.4, 3.42 + a.r * 0.4, S.t);
            if (s < 4 || s > L.path.length - 2 || vis < 0.01) continue;
            L.path.at(s, P);
            const swing = Math.sin(S.time * 3.6 + a.phase) * 0.12;
            o[n * 3] = P.x + P.tz * a.lane + P.tz * 0.35 * a.sx;
            o[n * 3 + 1] = P.y + 0.75 * a.sy;
            o[n * 3 + 2] = P.z - P.tx * a.lane + swing;
            const d = Math.hypot(o[n * 3] - S.camera.position.x, o[n * 3 + 2] - S.camera.position.z);
            prm[n * 4] = Math.max(0.9, d * 0.006);
            prm[n * 4 + 1] = 0.55 + 0.1 * Math.sin(S.time * 9 + a.phase);
            prm[n * 4 + 2] = vis * 0.9;
            n++;
          }
          glow.origin.needsUpdate = true;
          glow.param.needsUpdate = true;
          glow.mesh.geometry.instanceCount = n;
        },
        dispose: () => {
          pool.dispose();
          glow.dispose();
        },
      };
    });
    this.kingAt = (S) => SOUTH_ROAD.at(1250 + (S?.time ?? 0) * 0.75, { x: 0, y: 0, z: 0 });

    this.S = null;
    const at = (fn, dy = 2) => () => {
      const p = fn(this.S);
      return new THREE.Vector3(p.x, p.y + dy, p.z);
    };
    const viewNear = (fn, back, up) => () => {
      const p = fn(this.S);
      return { pos: new THREE.Vector3(p.x + back[0], p.y + up, p.z + back[1]), target: new THREE.Vector3(p.x, p.y + 1.5, p.z) };
    };
    this.vignettes = [
      { hour: 0, label: 'Haggling over a chest', focus: at(() => vignette.haggle ?? market.fountain, 2.4), view: viewNear(() => vignette.haggle ?? market.fountain, [9, 9], 4) },
      { hour: 0, label: 'The toy-maker’s stall', focus: at(() => market.toyPole, 4.5), view: viewNear(() => market.toyPole, [8, 10], 4) },
      { hour: 1, label: 'A clockwork bird let go', focus: at(() => vignette.child ?? market.toyPole, 2), view: viewNear(() => vignette.child ?? market.toyPole, [7, 12], 5) },
      { hour: 1, label: 'Watchers on the towers', focus: at(() => TOWERS[1], TOWERS[1].h - 10), view: viewNear(() => ({ x: TOWERS[1].x, y: TOWERS[1].y + TOWERS[1].h - 14, z: TOWERS[1].z }), [30, 40], 10) },
      { hour: 3, label: 'A family with a cradle', focus: at(this.familyAt, 2.5), view: viewNear(this.familyAt, [14, 18], 7) },
      { hour: 4, label: 'The old king looks back', focus: at(this.kingAt, 2.5), view: viewNear(this.kingAt, [10, 22], 5) },
    ];
  }

  flightPaths() {
    // From the streets of Dale south along the quays, over the falls bridge and away.
    const falls = BRIDGES[3];
    const paths = [];
    for (const side of [-1, 1]) {
      for (const start of [-250, -120, 0]) {
        const pts = [];
        for (let z = start; z <= falls.z - 8; z += 12) pts.push([bankX(z, side, side < 0 ? 22 : 24), z, terraceLevel(0, z)]);
        // Cross the falls bridge to the east bank.
        for (let d = side * 26; side < 0 ? d <= 26 : d >= 24; d += side < 0 ? 4 : -40) {
          const x = bankX(falls.z, 1, d);
          pts.push([x, falls.z, falls.deckY ? falls.deckY(x) : falls.y]);
          if (side > 0) break;
        }
        const road = SOUTH_ROAD;
        for (let s = 4; s < 700; s += 14) {
          const p = road.at(s);
          pts.push([p.x, p.z, terrainHeight(p.x, p.z)]);
        }
        paths.push(new Path(pts));
      }
    }
    // Across the middle bridge from the west bank, then down the east quay.
    const mid = BRIDGES[1];
    const pts = [];
    for (let d = -40; d <= 26; d += 3) {
      const x = bankX(mid.z, 1, d);
      pts.push([x, mid.z, Math.abs(d) <= 32 && mid.deckY ? mid.deckY(x) : terraceLevel(0, mid.z)]);
    }
    for (let z = mid.z + 10; z <= falls.z - 8; z += 12) pts.push([bankX(z, 1, 24), z, terraceLevel(0, z)]);
    for (let s = 4; s < 600; s += 14) {
      const p = SOUTH_ROAD.at(s);
      pts.push([p.x, p.z, terrainHeight(p.x, p.z)]);
    }
    paths.unshift(new Path(pts));
    return paths;
  }

  update(S) {
    this.S = S;
  }
}
