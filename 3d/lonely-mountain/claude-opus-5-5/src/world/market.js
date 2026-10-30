// The market square and the small things of Dale: striped stalls, goods, the
// toy-maker's horses and clockwork birds, the fountain, laundry, boats, barrels
// and carts. The square tells the story alone: bright awnings, then awnings
// snapping in the hot wind, torn and flying, abandoned with a toy horse still
// rolling, a lake of fire, and ash where one clockwork bird still flutters.
import * as THREE from 'three';
import { BRIDGES, FALLS_Z, GATE_ROAD, PLAZA, QUAY_RISE, TERRACES, TOWN, bankX, riverAt, terraceFront, terraceLevel, townIgnite } from '../core/layout.js';
import { patch } from '../core/shaderlib.js';
import { band, pick, rng, ss } from '../core/util.js';
import { stoneMaterial } from './materials.js';

const STRIPES = ['#c23b2c', '#2f5d8a', '#d9a531', '#3f7a46', '#7a3a6a', '#d46a2a', '#2e6f6f', '#a23040'];

/** Generic instanced prop: instance colour, chars and glows once its ignition hour passes. */
export function propMaterial(key, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, ...opts });
  return patch(m, {
    key,
    shade: true,
    vertexHead: 'attribute float aIgn; varying float vIgn;',
    vertex: 'vIgn = aIgn;',
    fragmentHead: 'varying float vIgn;',
    color: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.035, 0.03), lmBurn(vIgn) * 0.95); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.38), uAsh * lmBurn(vIgn) * 0.5);',
    emissive: 'totalEmissiveRadiance += lmFireColor(0.5) * pow(lmNoise(vWorldPos.xz * 2.0 + vWorldPos.y + uTime * 0.5), 3.0) * lmEmber(vIgn) * 5.0;',
  });
}

/** Builds an InstancedMesh from [matrix, color, ignite] items. */
function instances(geo, mat, items, scene, name, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo.clone(), mat, Math.max(1, items.length));
  const ign = new Float32Array(Math.max(1, items.length)).fill(99);
  items.forEach(([m, c, g], i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c);
    ign[i] = g;
  });
  mesh.count = items.length;
  mesh.geometry.setAttribute('aIgn', new THREE.InstancedBufferAttribute(ign, 1));
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

const M = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

export class Market {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'market';
    scene.add(this.group);
    const rand = rng(41);
    this.stalls = [];
    const level = (z) => terraceLevel(1, z);
    const ds = [41, 51, 69, 79, 97, 107];
    for (const [ci, d] of ds.entries()) {
      for (let z = PLAZA.z0 + 6; z < PLAZA.z1 - 3; z += 7.6) {
        if (Math.abs(z) < 5) continue;
        if (d > 60 && d < 90 && Math.abs(z) < 14) continue;
        const x = bankX(z, 1, d);
        const faceZ = ci % 2 === 0 ? -1 : 1;
        this.stalls.push({ x, y: level(z), z, d, rot: Math.atan(riverAt(z).dx) + (faceZ > 0 ? Math.PI : 0), seed: rand(), ignite: townIgnite(x, z) - 0.04 });
      }
    }
    // The toy-maker's stall: the corner of the square nearest the southern road.
    this.toy = this.stalls.reduce((a, b) => (b.z - b.d * 0.15 > a.z - a.d * 0.15 ? b : a));
    this.toy.isToy = true;

    this.buildStalls(rand);
    this.buildFountain();
    this.buildToys();
    this.buildLaundry(rand);
    this.buildBoatsAndProps(rand);
    this.buildForges(rand);
  }

  /** Smithies: an anvil, a glowing hearth and a lean-to roof, along the Gate road and the square. */
  buildForges(rand) {
    this.forges = [];
    const spots = [];
    for (const k of [0.12, 0.3, 0.5, 0.7, 0.86]) {
      const p = GATE_ROAD.at(k * GATE_ROAD.length);
      spots.push({ x: p.x + p.tz * 8, y: p.y, z: p.z - p.tx * 8, rot: Math.atan2(p.tx, p.tz) + Math.PI / 2 });
    }
    for (const d of [60, 92]) {
      const z = PLAZA.z0 + 3;
      spots.push({ x: bankX(z, 1, d), y: terraceLevel(1, z), z, rot: Math.PI });
    }
    const iron = [], hearth = [], roof = [];
    for (const f of spots) {
      const fwd = new THREE.Vector3(Math.sin(f.rot), 0, Math.cos(f.rot));
      const right = new THREE.Vector3(Math.cos(f.rot), 0, -Math.sin(f.rot));
      const ign = townIgnite(f.x, f.z);
      iron.push([M(f.x, f.y + 0.4, f.z, f.rot, 0.35, 0.8, 0.35), new THREE.Color('#2a2826'), ign]);
      iron.push([M(f.x, f.y + 0.88, f.z, f.rot, 0.9, 0.18, 0.32), new THREE.Color('#33302d'), ign]);
      const hx = f.x - fwd.x * 2.2, hz = f.z - fwd.z * 2.2;
      hearth.push([M(hx, f.y + 0.5, hz, f.rot, 2.2, 1.0, 1.6), new THREE.Color('#7a6e60'), ign]);
      roof.push([M(f.x - fwd.x * 1.2, f.y + 3.1, f.z - fwd.z * 1.2, f.rot, 5.5, 0.2, 4.4), new THREE.Color('#5a4030'), ign]);
      for (const s of [-1, 1]) roof.push([M(f.x - fwd.x * 1.2 + right.x * s * 2.6 + fwd.x * 2, f.y + 1.5, f.z - fwd.z * 1.2 + right.z * s * 2.6 + fwd.z * 2, f.rot, 0.18, 3.0, 0.18), new THREE.Color('#5a4030'), ign]);
      this.forges.push({ ...f, hearth: new THREE.Vector3(hx, f.y + 1.05, hz), phase: rand() });
    }
    const mat = propMaterial('prop', { metalness: 0.3 });
    instances(new THREE.BoxGeometry(1, 1, 1), mat, iron, this.group, 'anvils');
    instances(new THREE.BoxGeometry(1, 1, 1), mat, hearth, this.group, 'hearths');
    instances(new THREE.BoxGeometry(1, 1, 1), mat, roof, this.group, 'smithy-roofs');
    this.coalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.4, 0.1).multiplyScalar(4) });
    const coals = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.08, 1.1), this.coalMat, this.forges.length);
    this.forges.forEach((f, i) => coals.setMatrixAt(i, M(f.hearth.x, f.hearth.y, f.hearth.z, f.rot)));
    this.group.add(coals);
  }

  buildStalls(rand) {
    const posts = [], tables = [], goods = [], round = [];
    const wood = new THREE.Color('#6b4a30');
    for (const s of this.stalls) {
      const fwd = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
      const right = new THREE.Vector3(Math.cos(s.rot), 0, -Math.sin(s.rot));
      for (const [a, b, h] of [[-2.2, 1.4, 2.7], [2.2, 1.4, 2.7], [-2.2, -1.4, 2.3], [2.2, -1.4, 2.3]]) {
        posts.push([M(s.x + right.x * a + fwd.x * b, s.y + h / 2, s.z + right.z * a + fwd.z * b, s.rot, 0.14, h, 0.14), wood, s.ignite]);
      }
      tables.push([M(s.x + fwd.x * 0.6, s.y + 0.85, s.z + fwd.z * 0.6, s.rot, 4.2, 0.12, 1.4), wood, s.ignite]);
      tables.push([M(s.x + fwd.x * 0.6, s.y + 0.42, s.z + fwd.z * 0.6, s.rot, 4.0, 0.84, 1.2), new THREE.Color('#5a3d26'), s.ignite]);
      if (s.isToy) continue;
      const palette = pick(rand, [['#c9a35a', '#a0663a', '#e2d2a8'], ['#7a2a2a', '#3a5a8a', '#d8c070'], ['#8aa04a', '#c0503a', '#e0b040'], ['#9a9aa6', '#6a6a78', '#c8c8d2'], ['#e6dcc6', '#b89a6a', '#8a6a4a']]);
      for (let g = 0; g < 7; g++) {
        const a = -1.8 + rand() * 3.6, b = 0.2 + rand() * 0.9;
        const c = new THREE.Color(pick(rand, palette)).offsetHSL(0, 0, (rand() - 0.5) * 0.1);
        const px = s.x + right.x * a + fwd.x * b, pz = s.z + right.z * a + fwd.z * b;
        if (rand() < 0.5) goods.push([M(px, s.y + 0.98, pz, rand() * 3, 0.3 + rand() * 0.4, 0.15 + rand() * 0.3, 0.3 + rand() * 0.3), c, s.ignite]);
        else round.push([M(px, s.y + 1.05, pz, 0, 0.22, 0.18, 0.22), c, s.ignite]);
      }
      // Sacks and baskets on the ground beside the stall.
      for (let g = 0; g < 3; g++) {
        const a = -2.6 + rand() * 5.2, b = 1.9 + rand() * 0.7;
        round.push([M(s.x + right.x * a + fwd.x * b, s.y + 0.32, s.z + right.z * a + fwd.z * b, 0, 0.42, 0.36, 0.42), new THREE.Color(pick(rand, ['#b8a07a', '#8a7050', '#a08860'])), s.ignite]);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = propMaterial('prop');
    instances(box, mat, posts, this.group, 'stall-posts');
    instances(box, mat, tables, this.group, 'stall-tables');
    instances(box, mat, goods, this.group, 'goods');
    instances(new THREE.SphereGeometry(1, 8, 6), mat, round, this.group, 'goods-round');

    // Awnings: cloth that flutters, snaps, tears, flies and burns.
    const cloth = new THREE.PlaneGeometry(4.9, 3.4, 10, 6);
    cloth.rotateX(-Math.PI / 2);
    const n = this.stalls.length;
    const awnMat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), {
      key: 'awning',
      shade: true,
      vertexHead: 'attribute vec4 aAwn; attribute vec3 aStripe; varying vec4 vAwn; varying vec3 vStripe; varying vec2 vUv2;',
      vertex: /* glsl */ `
        vAwn = aAwn; vStripe = aStripe; vUv2 = uv;
        float tear = smoothstep(aAwn.y, aAwn.y + 0.12, uT);
        float edge = 1.0 - uv.y; // 0 at the back, 1 at the front valance
        float pin = sin(uv.x * 3.14159);
        float wind = 0.06 + uWind.z * 0.5;
        float flap = sin(uTime * (3.0 + uWind.z * 9.0) + uv.x * 6.0 + aAwn.z * 20.0) * 0.5 + sin(uTime * 13.0 + uv.y * 9.0 + aAwn.z * 7.0) * 0.25 * uWind.z;
        transformed.y += flap * wind * pin * (0.25 + 0.75 * edge) * 0.6;
        transformed.y += pin * (0.12 + uWind.z * 0.2);
        // Torn: strips hang and thrash.
        float strip = floor(uv.x * 6.0);
        float thrash = sin(uTime * 11.0 + strip * 1.9 + aAwn.z * 5.0);
        transformed.y -= tear * edge * (1.4 + 0.6 * thrash);
        transformed.z += tear * edge * thrash * 0.7;
        transformed.x += tear * edge * sin(strip * 2.3 + uTime * 6.0) * 0.25;
      `,
      fragmentHead: 'varying vec4 vAwn; varying vec3 vStripe; varying vec2 vUv2;',
      color: /* glsl */ `
        {
          float stripe = step(0.5, fract(vUv2.x * 7.0));
          vec3 c = mix(diffuseColor.rgb, vStripe, stripe);
          c *= 0.85 + 0.15 * lmNoise(vUv2 * 40.0);
          float burnt = smoothstep(vAwn.x, vAwn.x + 0.3, uT);
          if (lmNoise(vUv2 * 9.0 + vAwn.z * 13.0) < burnt * 1.1) discard;
          c = mix(c, vec3(0.05, 0.03, 0.02), lmBurn(vAwn.x - 0.05) * 0.9);
          diffuseColor.rgb = c;
        }
      `,
      emissive: 'totalEmissiveRadiance += lmFireColor(0.7) * lmEmber(vAwn.x) * 4.0 * smoothstep(0.3, 0.8, lmNoise(vUv2 * 12.0 + uTime));',
    });
    this.awnings = new THREE.InstancedMesh(cloth, awnMat, n);
    const awn = new Float32Array(n * 4), stripe = new Float32Array(n * 3);
    this.flyers = [];
    this.stalls.forEach((s, i) => {
      const c1 = new THREE.Color(s.isToy ? '#d9a531' : pick(rand, STRIPES));
      const c2 = new THREE.Color(rand() < 0.7 ? '#efe6d2' : pick(rand, STRIPES));
      this.awnings.setColorAt(i, c1);
      stripe.set([c2.r, c2.g, c2.b], i * 3);
      const tears = s.isToy ? 99 : rand() < 0.45 ? 1.75 + rand() * 0.4 : 99;
      const flies = !s.isToy && tears > 90 && rand() < 0.14;
      awn.set([s.ignite, tears, s.seed, flies ? 1 : 0], i * 4);
      s.awnMatrix = M(s.x + Math.sin(s.rot) * 0.1, s.y + 2.55, s.z + Math.cos(s.rot) * 0.1, s.rot);
      // Slope the cloth from the high front posts to the low back ones.
      s.awnMatrix.multiply(new THREE.Matrix4().makeRotationX(-0.12));
      this.awnings.setMatrixAt(i, s.awnMatrix);
      if (flies) this.flyers.push({ i, s, flyAt: 1.55 + rand() * 0.6, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), seed: rand() });
    });
    this.awnings.geometry.setAttribute('aAwn', new THREE.InstancedBufferAttribute(awn, 4));
    this.awnings.geometry.setAttribute('aStripe', new THREE.InstancedBufferAttribute(stripe, 3));
    this.awnings.castShadow = true;
    this.awnings.receiveShadow = true;
    this.awnings.name = 'awnings';
    this.group.add(this.awnings);
  }

  buildFountain() {
    const z = 0;
    const x = bankX(z, 1, 75);
    const y = terraceLevel(1, z);
    const stone = stoneMaterial({ color: '#cfc5ae', blocks: 0, key: 'fountain', ignite: '3.15', soot: 0.5 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.8, 1.1, 24, 1, true), stone);
    basin.position.set(x, y + 0.55, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.32, 6, 32).rotateX(Math.PI / 2), stone);
    rim.position.set(x, y + 1.1, z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 5, 10), stone);
    col.position.set(x, y + 2.5, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2, 0.6, 0.8, 16), stone);
    bowl.position.set(x, y + 4.6, z);
    // A stone thrush on the top.
    const bird = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8).scale(1.5, 1, 1), stone);
    bird.position.set(x, y + 5.6, z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.4, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a4a52', roughness: 0.1, metalness: 0.2 }));
    water.position.set(x, y + 0.9, z);
    for (const o of [basin, rim, col, bowl, bird]) o.castShadow = o.receiveShadow = true;
    this.group.add(basin, rim, col, bowl, bird, water);
    this.water = water;
    this.fountain = new THREE.Vector3(x, y, z);
  }

  buildToys() {
    const s = this.toy;
    const fwd = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
    const right = new THREE.Vector3(Math.cos(s.rot), 0, -Math.sin(s.rot));
    this.toyFrame = { fwd, right, s };
    // Painted wooden horses on wheels.
    const horse = new THREE.Group();
    const paint = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.12), paint('#e8e0d0'));
    body.position.y = 0.2;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), paint('#e8e0d0'));
    neck.position.set(0.15, 0.32, 0);
    neck.rotation.z = -0.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), paint('#e8e0d0'));
    head.position.set(0.22, 0.42, 0);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.13), paint('#c23b2c'));
    saddle.position.y = 0.29;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.16), paint('#6b4a30'));
    board.position.y = 0.08;
    horse.add(body, neck, head, saddle, board);
    this.wheels = [];
    for (const [wx, wz] of [[-0.14, 0.09], [0.14, 0.09], [-0.14, -0.09], [0.14, -0.09]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10).rotateX(Math.PI / 2), paint('#c23b2c'));
      w.position.set(wx, 0.05, wz);
      horse.add(w);
      this.wheels.push(w);
    }
    this.horses = [];
    const colors = ['#e8e0d0', '#3a3a3a', '#a0603a', '#d8b860'];
    for (let i = 0; i < 4; i++) {
      const h = horse.clone(true);
      h.children[0].material = paint(colors[i]);
      h.scale.setScalar(i === 0 ? 2.2 : 1.6);
      this.group.add(h);
      this.horses.push({ obj: h, i });
    }
    // Clockwork birds on the toy-maker's pole: gilded, wings that tick.
    const birdMat = new THREE.MeshStandardMaterial({ color: '#d8a640', metalness: 1, roughness: 0.25 });
    this.clockBirds = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6).scale(1.6, 1, 1), birdMat);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.2).translate(0, 0, 0.1), birdMat);
      const wr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.2).translate(0, 0, -0.1), birdMat);
      g.add(b, wl, wr);
      g.scale.setScalar(1.6);
      this.group.add(g);
      this.clockBirds.push({ g, wl, wr, i });
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6), new THREE.MeshStandardMaterial({ color: '#6b4a30' }));
    this.toyPole = new THREE.Vector3(s.x + right.x * 2.6 + fwd.x * 1.8, s.y, s.z + right.z * 2.6 + fwd.z * 1.8);
    pole.position.copy(this.toyPole).add(new THREE.Vector3(0, 2.1, 0));
    this.group.add(pole);
  }

  buildLaundry(rand) {
    const lines = [], cloths = [];
    for (let i = 0; i < 90; i++) {
      const k = 1 + Math.floor(rand() * (TERRACES - 1));
      const side = rand() < 0.5 ? -1 : 1;
      const z = TOWN.z0 + 20 + rand() * (TOWN.z1 - TOWN.z0 - 40);
      if (side > 0 && z > PLAZA.z0 - 8 && z < PLAZA.z1 + 8 && k < 5) continue;
      const d0 = terraceFront(k) + 0.6, d1 = terraceFront(k) + 5.4;
      const y = terraceLevel(k, z) + 4.4;
      const a = new THREE.Vector3(bankX(z, side, d0), y, z), b = new THREE.Vector3(bankX(z, side, d1), y, z);
      const mid = a.clone().lerp(b, 0.5);
      lines.push([M(mid.x, mid.y, mid.z, 0, a.distanceTo(b), 0.03, 0.03), new THREE.Color('#d8d0c0'), townIgnite(mid.x, z)]);
      for (let j = 0; j < 4; j++) {
        const p = a.clone().lerp(b, 0.15 + j * 0.23);
        cloths.push({ p, c: new THREE.Color(pick(rand, ['#f0ead8', '#e4dcc8', '#a8483a', '#4a6a8a', '#d8c070', '#f6f2e8', '#6a8a5a'])), ign: townIgnite(p.x, p.z), seed: rand() });
      }
    }
    instances(new THREE.BoxGeometry(1, 1, 1), propMaterial('prop'), lines, this.group, 'laundry-lines', false);
    const sheet = new THREE.PlaneGeometry(0.9, 1.3, 3, 4);
    sheet.translate(0, -0.65, 0);
    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), {
      key: 'laundry',
      shade: true,
      vertexHead: 'attribute vec2 aL; varying vec2 vL; varying vec2 vUv3;',
      vertex: /* glsl */ `
        vL = aL; vUv3 = uv;
        float hang = 1.0 - uv.y;
        float w = 0.15 + uWind.z * 0.9;
        transformed.z += hang * w * (0.6 + 0.4 * sin(uTime * (4.0 + uWind.z * 8.0) + aL.y * 30.0 + uv.x * 3.0));
        transformed.y += hang * hang * w * 0.35;
      `,
      fragmentHead: 'varying vec2 vL; varying vec2 vUv3;',
      color: 'if (lmNoise(vUv3 * 7.0 + vL.y * 20.0) < smoothstep(vL.x - 0.05, vL.x + 0.15, uT) * 1.1) discard;',
    });
    const mesh = new THREE.InstancedMesh(sheet, mat, cloths.length);
    const al = new Float32Array(cloths.length * 2);
    cloths.forEach((c, i) => {
      mesh.setMatrixAt(i, M(c.p.x, c.p.y, c.p.z, Math.PI / 2 + (rand() - 0.5) * 0.2));
      mesh.setColorAt(i, c.c);
      al.set([c.ign - 0.05, c.seed], i * 2);
    });
    mesh.geometry.setAttribute('aL', new THREE.InstancedBufferAttribute(al, 2));
    mesh.castShadow = true;
    mesh.name = 'laundry';
    this.group.add(mesh);
  }

  buildBoatsAndProps(rand) {
    // Boats moored along the quays.
    const hull = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, 0, Math.PI);
    hull.rotateZ(Math.PI / 2);
    hull.rotateX(Math.PI);
    this.boats = [];
    const boatItems = [];
    for (let i = 0; i < 18; i++) {
      const z = TOWN.z0 + 30 + rand() * (FALLS_Z - TOWN.z0 - 70);
      if (BRIDGES.some((b) => Math.abs(b.z - z) < 10)) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const r = riverAt(z);
      const x = r.x + side * (r.w - 2.2);
      this.boats.push({ x, y: r.y, z, rot: Math.atan(r.dx), seed: rand(), ign: townIgnite(x, z) + 0.1 });
      boatItems.push([M(x, r.y, z), new THREE.Color(pick(rand, ['#6b4a30', '#4a5a6a', '#7a3a2a', '#5a4a38'])), townIgnite(x, z) + 0.1]);
    }
    this.boatMesh = instances(hull, propMaterial('prop'), boatItems, this.group, 'boats');

    // Barrels and crates on the quays and along the Gate road; carts.
    const barrels = [], crates = [], cartBodies = [], wheels = [];
    const addCart = (x, y, z, rot, ign) => {
      const rgt = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
      cartBodies.push([M(x, y + 1.0, z, rot, 1.6, 0.6, 2.8), new THREE.Color('#6b4f34'), ign]);
      for (const s of [-1, 1]) wheels.push([M(x + rgt.x * s * 0.95, y + 0.6, z + rgt.z * s * 0.95, rot + Math.PI / 2, 1.2, 0.12, 1.2), new THREE.Color('#4a3424'), ign]);
    };
    for (let i = 0; i < 260; i++) {
      const onRoad = i < 90;
      let x, z, y;
      if (onRoad) {
        const p = GATE_ROAD.at(rand() * GATE_ROAD.length);
        const side = rand() < 0.5 ? -1 : 1;
        x = p.x + p.tz * side * 5.5;
        z = p.z - p.tx * side * 5.5;
        y = p.y;
      } else {
        z = TOWN.z0 + 10 + rand() * (FALLS_Z - TOWN.z0 - 20);
        const side = rand() < 0.5 ? -1 : 1;
        const r = riverAt(z);
        x = bankX(z, side, r.w + 4 + rand() * 12);
        y = r.y + QUAY_RISE;
        if (BRIDGES.some((b) => Math.abs(b.z - z) < 6)) continue;
      }
      const ign = townIgnite(x, z) + 0.05;
      const c = new THREE.Color(rand() < 0.5 ? '#7a5a3a' : '#8a6a44').offsetHSL(0, 0, (rand() - 0.5) * 0.08);
      if (rand() < 0.08) addCart(x, y, z, rand() * 6.28, ign);
      else if (rand() < 0.55) barrels.push([M(x, y + 0.55, z, rand() * 3, 0.42, 1.1, 0.42), c, ign]);
      else crates.push([M(x, y + 0.4, z, rand() * 3, 0.8, 0.8, 0.8), c, ign]);
    }
    // Carts parked at the market's edge.
    for (let i = 0; i < 10; i++) {
      const z = PLAZA.z0 + 4 + rand() * (PLAZA.z1 - PLAZA.z0 - 8);
      const x = bankX(z, 1, PLAZA.d1 - 4);
      addCart(x, terraceLevel(1, z), z, rand() * 0.6 - 0.3, townIgnite(x, z));
    }
    const mat = propMaterial('prop');
    instances(new THREE.CylinderGeometry(1, 0.9, 1, 10), mat, barrels, this.group, 'barrels');
    instances(new THREE.BoxGeometry(1, 1, 1), mat, crates, this.group, 'crates');
    instances(new THREE.BoxGeometry(1, 1, 1), mat, cartBodies, this.group, 'carts');
    instances(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), mat, wheels, this.group, 'cart-wheels');
  }

  update(S) {
    const t = S.t, time = S.time;
    // Flying awnings: torn loose by the hot wind, they tumble away south.
    const m = new THREE.Matrix4();
    for (const f of this.flyers) {
      const k = Math.max(0, t - f.flyAt);
      if (k <= 0) {
        this.awnings.setMatrixAt(f.i, f.s.awnMatrix);
        continue;
      }
      const dist = k * 520 + Math.sin(time * 2 + f.seed * 9) * 2 * Math.min(1, k * 5);
      const pos = new THREE.Vector3(f.s.x + 0.15 * dist * Math.sin(f.seed * 9), f.s.y + 2.6 + Math.sqrt(k) * 90 + Math.sin(time * 3 + f.seed) * 1.5, f.s.z + dist);
      const q = new THREE.Quaternion().setFromAxisAngle(f.spin, k * 18 + time * 2.5 * Math.min(1, k * 4));
      const sc = k > 0.6 ? 0.0001 : 1;
      m.compose(pos, q, new THREE.Vector3(sc, sc, sc));
      this.awnings.setMatrixAt(f.i, m);
    }
    this.awnings.instanceMatrix.needsUpdate = true;

    // Toy horses: rolling back and forth on the toy-maker's table at noon; one
    // left rolling across the empty square as the dragon circles.
    const { fwd, right, s } = this.toyFrame;
    for (const h of this.horses) {
      let a, b, y, roll;
      if (h.i === 0) {
        const abandoned = ss(1.75, 2.15, t);
        const tableA = -1.6 + 3.2 * (0.5 + 0.5 * Math.sin(time * 0.9));
        const groundRun = 3 + 9 * ss(1.8, 2.6, t) + Math.sin(time * 0.55) * 2.5 * band(t, 1.8, 2.1, 2.7, 3.0);
        a = THREE.MathUtils.lerp(tableA, -groundRun * 0.4, abandoned);
        b = THREE.MathUtils.lerp(0.7, 2.8 + groundRun, abandoned);
        y = THREE.MathUtils.lerp(s.y + 0.92, s.y + 0.02, abandoned);
        roll = THREE.MathUtils.lerp(Math.cos(time * 0.9), Math.cos(time * 0.55) * band(t, 1.8, 2.1, 2.7, 3.0), abandoned);
        h.obj.visible = t < 3.2;
      } else {
        a = -1.6 + (h.i - 1) * 1.1 + Math.sin(time * 1.3 + h.i) * 0.35 * (1 - ss(1.5, 1.9, t));
        b = 0.5;
        y = s.y + 0.92;
        roll = Math.cos(time * 1.3 + h.i);
        h.obj.visible = t < 2.95;
      }
      h.obj.position.set(s.x + right.x * a + fwd.x * b, y, s.z + right.z * a + fwd.z * b);
      h.obj.rotation.y = s.rot + Math.PI / 2 + (roll < 0 ? Math.PI : 0) * 0;
      for (const w of this.wheels) w.rotation.z = time * 4;
    }
    // Clockwork birds flutter in circles about the pole until the wind takes the stall;
    // by night one still flutters on the ash of the square.
    for (const b of this.clockBirds) {
      const flap = Math.sin(time * 28 + b.i) * 0.9;
      b.wl.rotation.x = flap;
      b.wr.rotation.x = -flap;
      if (b.i === 0 && t > 3.45) {
        // The last bird, hopping on the ash.
        const hop = Math.abs(Math.sin(time * 2.2));
        b.g.position.set(this.fountain.x + 9 + Math.sin(time * 0.3) * 1.2, this.fountain.y + 0.12 + hop * 0.35, this.fountain.z + 12 + Math.cos(time * 0.27) * 1.2);
        b.g.rotation.y = time * 0.3;
        b.g.visible = true;
        continue;
      }
      const ang = time * 1.1 + (b.i / 6) * Math.PI * 2;
      const r = 0.9 + 0.2 * Math.sin(time * 2 + b.i);
      b.g.position.set(this.toyPole.x + Math.cos(ang) * r, this.toyPole.y + 3.4 + Math.sin(time * 3 + b.i) * 0.25, this.toyPole.z + Math.sin(ang) * r);
      b.g.rotation.y = -ang;
      b.g.visible = t < 1.85;
    }
    // Boats bob; the fountain stills as the fire comes.
    for (const [i, b] of this.boats.entries()) {
      m.compose(
        new THREE.Vector3(b.x, b.y + 0.05 + Math.sin(time * 1.2 + b.seed * 9) * 0.06, b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(time * 1.1 + b.seed * 5) * 0.03, b.rot, Math.sin(time * 0.9 + b.seed) * 0.04)),
        new THREE.Vector3(1.8, 0.8, 6.2),
      );
      this.boatMesh.setMatrixAt(i, m);
    }
    this.boatMesh.instanceMatrix.needsUpdate = true;
    this.water.material.color.setRGB(0.16, 0.29, 0.32).multiplyScalar(1 - 0.85 * ss(2.8, 3.4, t));
    // Hearths roar at noon and are banked as the smiths flee.
    this.coalMat.color.setRGB(1, 0.4, 0.1).multiplyScalar(4 * (1 - ss(1.8, 2.3, t)) * (0.85 + 0.15 * Math.sin(time * 5)) + 0.3);
  }
}
