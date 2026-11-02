// Birds: swallows wheeling over Dale at noon; at the shadow hour whole flocks
// lift from the valley and stream south, the geese from the quay among them,
// and with them one gilded clockwork bird a child has let go.
import * as THREE from 'three';
import { BRIDGES, terrainHeight, TOWN } from '../core/layout.js';
import { patch } from '../core/shaderlib.js';
import { band, fract, rng, ss } from '../core/util.js';

function birdGeometry() {
  // Body along +z; wings are separate triangles flapped in the shader (aWing = -1 left, 1 right, 0 body).
  const v = [
    0, 0, 0.45, -0.06, 0, -0.3, 0.06, 0, -0.3,
    0, 0, 0.45, 0, 0.07, -0.3, -0.06, 0, -0.3,
    0, 0, 0.45, 0.06, 0, -0.3, 0, 0.07, -0.3,
    0, 0, 0.12, 0, 0, -0.12, -0.7, 0, -0.08,
    0, 0, -0.12, 0, 0, 0.12, 0.7, 0, -0.08,
  ];
  const wing = [0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, 1, 1, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  constructor(scene, world) {
    this.world = world;
    const rand = rng(17);
    this.flock = [];
    // Swallows over the roofs at noon.
    for (let i = 0; i < 90; i++) this.flock.push({ kind: 'swallow', r: 40 + rand() * 160, h: 40 + rand() * 70, w: (0.25 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6.28, cz: TOWN.z0 + rand() * (TOWN.z1 - TOWN.z0), cx: (rand() - 0.5) * 200, s: 1.1 });
    // Flocks lifting from the valley at the shadow hour.
    for (let i = 0; i < 900; i++) {
      const g = i % 14;
      const sx = (rng(g * 7 + 1)() - 0.5) * 900, sz = TOWN.z0 + rng(g * 13 + 5)() * 1500;
      this.flock.push({ kind: 'stream', g, sx: sx + (rand() - 0.5) * 60, sz: sz + (rand() - 0.5) * 60, off: new THREE.Vector3((rand() - 0.5) * 40, (rand() - 0.5) * 18, (rand() - 0.5) * 40), u0: g / 14 + rand() * 0.03, s: 0.9 + rand() * 0.4, ph: rand() * 6.28 });
    }
    // Geese on the quay above the falls.
    const fb = BRIDGES[2];
    for (let i = 0; i < 14; i++) this.flock.push({ kind: 'goose', i, x: fb.x + 18 + (i % 2) * 1.4, z: fb.z + 12 + i * 1.6, y: fb.y, s: 2.6, ph: rand() * 6.28 });
    // The clockwork bird.
    this.flock.push({ kind: 'clockwork', s: 1.4, ph: 0 });

    const mat = patch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), {
      key: 'birds',
      vertexHead: 'attribute float aWing; attribute vec2 aFlap;',
      vertex: 'float f = sin(uTime * aFlap.x + aFlap.y) * 0.9; if (aWing != 0.0) { transformed.y += abs(transformed.x) * f; transformed.x *= cos(f) * 0.6 + 0.4; }',
    });
    this.mesh = new THREE.InstancedMesh(birdGeometry(), mat, this.flock.length);
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(this.flock.length * 2), 2);
    this.mesh.geometry.setAttribute('aFlap', this.flap);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'birds';
    this.flock.forEach((b, i) => {
      const c = b.kind === 'goose' ? '#e8e2d4' : b.kind === 'clockwork' ? '#e0a83a' : b.kind === 'swallow' ? '#2a2c3a' : '#3a3530';
      this.mesh.setColorAt(i, new THREE.Color(c));
      this.flap.array.set([b.kind === 'goose' ? 6 : b.kind === 'clockwork' ? 26 : 14 + rand() * 6, b.ph], i * 2);
    });
    this.mesh.material.metalness = 0;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.sv = new THREE.Vector3();
  }

  update(S) {
    const { t, time } = S;
    const m = this.m, q = this.q, p = this.p;
    let n = 0;
    const put = (x, y, z, yaw, pitch, s) => {
      q.setFromEuler(this.e.set(pitch, yaw, 0, 'YXZ'));
      this.mesh.setMatrixAt(n, m.compose(p.set(x, y, z), q, this.sv.set(s, s, s)));
      n++;
    };
    this.colors = this.colors || this.flock.map((_, i) => {
      const c = new THREE.Color();
      this.mesh.getColorAt(i, c);
      return c;
    });
    const flapArr = this.flap.array;
    const flapCopy = this.flapCopy || (this.flapCopy = flapArr.slice());
    const market = this.world.market;
    for (const [i, b] of this.flock.entries()) {
      flapArr[n * 2] = flapCopy[i * 2];
      flapArr[n * 2 + 1] = flapCopy[i * 2 + 1];
      const colorIndex = i;
      const before = n;
      if (b.kind === 'swallow') {
        const vis = 1 - ss(0.7, 1.1, t);
        if (vis < 0.05) continue;
        const a = time * b.w + b.ph;
        const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
        put(x, terrainHeight(x, z) + b.h + Math.sin(time * 0.8 + b.ph) * 8, z, a + (b.w > 0 ? 0 : Math.PI), 0, b.s * vis);
      } else if (b.kind === 'stream') {
        const amt = band(t, 0.5, 0.82, 2.05, 2.45);
        if (amt < 0.05) continue;
        // Each flock lifts from the fields and streams away south over the vantage.
        const u = fract(time / 46 + b.u0);
        const g0 = terrainHeight(b.sx, b.sz);
        const rise = ss(0, 0.18, u);
        const x = b.sx + b.off.x * rise + Math.sin(u * 9 + b.g) * 30 * u;
        const z = b.sz + b.off.z * rise + u * 2600;
        const y = g0 + 2 + rise * (90 + b.g * 12) + u * 220 + b.off.y + Math.sin(time * 1.3 + b.ph) * 3;
        put(x, y, z, 0.15 * Math.sin(u * 9 + b.g), -0.25 * (1 - rise), b.s * amt * ss(0.0, 0.02, u) * (1 - ss(0.9, 1, u)));
      } else if (b.kind === 'goose') {
        const fly = ss(0.9, 1.25, t);
        const back = 1 - ss(2.1, 2.4, t);
        if (back < 0.05) continue;
        const walk = Math.sin(time * 0.4 + b.i) * 3;
        if (fly <= 0) {
          put(b.x + Math.sin(time * 0.5 + b.i) * 1.5, b.y + 0.15 + Math.abs(Math.sin(time * 3 + b.ph)) * 0.05, b.z + walk, Math.PI + Math.sin(time * 0.5 + b.i), 0, b.s * 0.6);
          flapArr[n * 2 - 2] = 0.5;
        } else {
          // A V of geese heading south.
          const lead = (t - 0.9) * 900 + (time % 60) * 14 * fly;
          const row = Math.ceil(b.i / 2), sideV = b.i % 2 ? 1 : -1;
          put(b.x + sideV * row * 5, b.y + 6 + fly * 120 + lead * 0.08, b.z + lead - row * 4, 0, -0.1, b.s * 0.7 * back);
        }
      } else if (b.kind === 'clockwork') {
        const child = market.toyPole;
        const on = band(t, 0.82, 0.9, 2.1, 2.4);
        if (on < 0.05 || !child) continue;
        // Up from the child's hands, a spiral, then away south with the flocks.
        const u = fract(time / 22);
        const sp = ss(0, 0.25, u);
        const ang = u * 22;
        const x = child.x + Math.cos(ang) * 6 * sp + Math.sin(u * 5) * 20 * ss(0.25, 1, u);
        const z = child.z + 5 + Math.sin(ang) * 6 * sp + ss(0.25, 1, u) * 1300;
        const y = child.y + 1.5 + sp * 25 + ss(0.25, 1, u) * 180;
        put(x, y, z, ang * (1 - ss(0.2, 0.3, u)), 0, b.s * on);
      }
      if (n > before) this.mesh.setColorAt(n - 1, this.colors[colorIndex]);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.flap.needsUpdate = true;
  }
}
