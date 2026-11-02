// Smoke, flame, sparks, ash and embers for every hour, streamed by span: kitchen
// smoke and anvil sparks at noon, dust on the hot wind, lines of burning pine as
// the dragon circles, Dale burning roof by roof at dusk, ash and embers by night.
import * as THREE from 'three';
import { FALLS_Z, SLOPE_BURNS, terrainHeight, GATE, GATE_ROAD, PLAZA, TOWN, bankX, riverAt, slopeIgnite, terraceLevel, townIgnite } from '../core/layout.js';
import { band, rng } from '../core/util.js';
import { Billboards } from './particles.js';

/** Collects every place that can burn, from the built world. */
function fireSources(world) {
  const rand = rng(77);
  const roofs = world.houses.houses
    .filter((h) => h.ignite < 90)
    .map((h) => ({ p: [h.x, h.y + h.h + 1.2, h.z], ign: h.ignite, size: Math.min(h.w, h.depth) * 0.75 }));
  const pines = world.vegetation.pines.filter((p) => p.ign < 90).map((p) => ({ p: [p.x, p.y + p.s * 0.2, p.z], ign: p.ign, size: p.s * 0.38 }));
  const trees = world.vegetation.trees.filter((p) => p.ign < 90).map((p) => ({ p: [p.x, p.y + p.s * 0.3, p.z], ign: p.ign, size: p.s * 0.5 }));
  const stalls = world.market.stalls.map((s) => ({ p: [s.x, s.y + 0.8, s.z], ign: s.ignite, size: 3.4 }));
  // The square becomes a lake of fire.
  const square = [];
  for (let i = 0; i < 180; i++) {
    const z = PLAZA.z0 + rand() * (PLAZA.z1 - PLAZA.z0);
    const x = bankX(z, 1, PLAZA.d0 + 4 + rand() * (PLAZA.d1 - PLAZA.d0 - 8));
    square.push({ p: [x, terraceLevel(1, z), z], ign: townIgnite(x, z) + 0.03, size: 2.2 + rand() * 2.5 });
  }
  // Fire poured down the stone channel and along the Gate road.
  const channel = [];
  for (let z = GATE.z + 10; z < TOWN.z0 + 20; z += 7) {
    const r = riverAt(z);
    for (const side of [-1, 1]) channel.push({ p: [r.x + side * (r.w + 1.2), r.y + 3.6, z], ign: slopeIgnite(r.x, z), size: 4 + rand() * 3 });
    const q = GATE_ROAD.at(((z - GATE.z) / (TOWN.z0 - GATE.z)) * GATE_ROAD.length);
    channel.push({ p: [q.x + (rand() - 0.5) * 8, q.y, q.z], ign: slopeIgnite(q.x, q.z), size: 2.5 + rand() * 3 });
  }
  // A furnace mouth at the Gate by night.
  const gate = [];
  for (let i = 0; i < 26; i++) gate.push({ p: [GATE.x + (rand() - 0.5) * 26, GATE.y, GATE.z - 4 - rand() * 14], ign: 2.95 + rand() * 0.15, size: 6 + rand() * 9 });
  // Bright lines where his breath licked the upper slopes.
  const slopes = [];
  for (const b of SLOPE_BURNS) {
    const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    for (let d = 0; d < len; d += 7) {
      const k = d / len;
      for (let j = 0; j < 2; j++) {
        const x = b.a[0] + (b.b[0] - b.a[0]) * k + (rand() - 0.5) * 70, z = b.a[1] + (b.b[1] - b.a[1]) * k + (rand() - 0.5) * 50;
        slopes.push({ p: [x, terrainHeight(x, z), z], ign: b.t0 + (b.t1 - b.t0) * k + rand() * 0.04, size: 5 + rand() * 6 });
      }
    }
  }
  return { roofs, pines, trees, stalls, square, channel, gate, slopes };
}

function fromSources(kind, list, per, extra = () => {}) {
  const rand = rng(list.length * 13 + per);
  const count = list.length * per;
  return new Billboards(kind, count, (i, origin, seed, param) => {
    const s = list[Math.floor(i / per)];
    origin.set(s.p, i * 3);
    seed.set([rand(), rand(), rand(), rand()], i * 4);
    param.set([s.ign, s.size, 0, 0], i * 4);
    extra(i, s, origin, seed, param, rand);
  });
}

/** A streamed bundle of billboard systems. */
function bundle(systems, fractions) {
  const group = new THREE.Group();
  for (const s of systems) group.add(s.mesh);
  return {
    object: group,
    update(S) {
      systems.forEach((s, i) => {
        s.setFraction(S.density * S.scale * (fractions?.[i] ?? 1) + (1 - S.scale) * 0.25);
        s.material.uniforms.uLightCol.value.copy(S.smokeLight);
      });
    },
    dispose() {
      systems.forEach((s) => s.dispose());
    },
  };
}

export class Fire {
  constructor(scene, stream, world) {
    this.src = fireSources(world);
    const src = this.src;
    const chimneys = world.houses.chimneyTops.filter((c, i) => c.k >= 0 && i % 4 === 0);
    const forges = world.market.forges;

    stream.add('kitchen-smoke', [0, 1.6], () => bundle([fromSources('kitchen', chimneys.map((c) => ({ p: [c.x, c.y, c.z], ign: c.ignite, size: 1 })), 7)]));
    stream.add('anvil-sparks', [0, 1.3], () => bundle([fromSources('smithy', forges.map((f) => ({ p: [f.x, f.y + 1.0, f.z], ign: 0, size: 1 })), 40, (i, s, o, seed, param) => (param[i * 4] = s.phase ?? 0))]));
    stream.add('hot-wind-dust', [0.6, 2.4], () => bundle([new Billboards('dust', 2600, (i, o, seed) => seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4))]));
    stream.add('slope-fires', [1.85, 4], () =>
      bundle([fromSources('flame', [...src.pines, ...src.slopes], 1), fromSources('sparks', [...src.pines.filter((_, i) => i % 3 === 0), ...src.slopes], 3), fromSources('smoke', [...src.pines.filter((_, i) => i % 5 === 0), ...src.slopes.filter((_, i) => i % 4 === 0)], 3)]),
    );
    stream.add('dale-burning', [2.6, 4], () =>
      bundle([
        fromSources('flame', [...src.roofs, ...src.trees], 3),
        fromSources('flame', [...src.stalls, ...src.square, ...src.channel], 2),
        fromSources('flame', src.gate, 4),
        fromSources('sparks', [...src.roofs, ...src.square], 6),
        fromSources('smoke', [...src.roofs.filter((_, i) => i % 3 === 0), ...src.square.filter((_, i) => i % 6 === 0)], 4),
        fromSources('smoke', src.gate.slice(0, 8).map((g) => ({ ...g, size: 1.6 })), 18),
      ]),
    );
    stream.add('night-ash', [3.1, 4], () => bundle([new Billboards('ash', 7000, (i, o, seed) => seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4))]));
    stream.add('ember-beds', [3, 4], () => {
      const rand = rng(5);
      return bundle([
        new Billboards('embers', 4200, (i, origin, seed, param) => {
          const z = TOWN.z0 + rand() * (TOWN.z1 - TOWN.z0);
          const r = riverAt(z);
          const side = rand() < 0.5 ? -1 : 1;
          const d = r.w + 6 + rand() * 200;
          const x = r.x + side * d;
          const k = Math.min(6, Math.max(0, Math.floor((d - 30) / 30) + 1));
          origin.set([x, terraceLevel(d < 30 ? 0 : k, z) + 0.2, z], i * 3);
          seed.set([rand(), rand(), rand(), rand()], i * 4);
          param.set([townIgnite(x, z), 0, 0, 0], i * 4);
        }),
      ]);
    });

    // Spray at the falls: always resident.
    const rand = rng(9);
    this.mist = new Billboards('mist', 360, (i, origin, seed) => {
      const z = FALLS_Z + 6;
      const r = riverAt(z);
      origin.set([r.x + (rand() - 0.5) * r.w * 2, r.y - 1, z], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    });
    scene.add(this.mist.mesh);

    // Firelight over Dale: a few warm lights that follow the burning.
    this.lights = [];
    for (const [z, d, side] of [[-290, 60, -1], [-200, 90, 1], [-90, 70, -1], [0, 75, 1], [80, 90, -1], [160, 70, 1], [-30, 150, -1]]) {
      const x = bankX(z, side, d);
      const light = new THREE.PointLight(0xff6a24, 0, 700, 1.6);
      light.position.set(x, terraceLevel(2, z) + 28, z);
      light.userData.ign = townIgnite(x, z);
      scene.add(light);
      this.lights.push(light);
    }
  }

  update(S) {
    const L = S.light;
    S.smokeLight = S.smokeLight || new THREE.Color();
    this.tmp = this.tmp || new THREE.Color();
    S.smokeLight.copy(L.hemiSky).multiplyScalar(L.hemi * 0.6).add(this.tmp.copy(L.sunColor).multiplyScalar(Math.min(1, L.sun * 0.25) * Math.max(0, Math.min(1, L.sunDir.y * 3))));
    this.mist.material.uniforms.uLightCol.value.copy(S.smokeLight);
    for (const [i, l] of this.lights.entries()) {
      const ign = l.userData.ign;
      const k = band(S.t, ign - 0.02, ign + 0.12, ign + 0.45, ign + 1.2) * 0.85 + band(S.t, ign, ign + 0.2, 4, 5) * 0.15;
      const flick = 0.8 + 0.2 * Math.sin(S.time * (7 + i) + i) * Math.sin(S.time * 3.1 + i * 2);
      l.intensity = k * 1700 * flick;
    }
  }
}
