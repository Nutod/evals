// The dragon: one continuous creature, never a sprite. His spine follows his own
// flight path, so the long neck and tail curve through every bank and turn; bat
// wings are rebuilt each frame from finger bones, beating, gliding or mantling;
// red-gold scales over a pale belly; and fire that lights his wings from below.
//
// Where he is: a speck over the northern moors at the shadow hour, banking around
// the peak and low over Dale as he circles, settled on the rock above the Gate at
// dusk, and gone into the Mountain by night.
import * as THREE from 'three';
import { GATE } from '../core/layout.js';
import { U, patch } from '../core/shaderlib.js';
import { band, clamp, lerp, rng, ss } from '../core/util.js';
import { Billboards } from '../fx/particles.js';

const L = 128; // tail tip to snout, metres
const N = 64; // spine samples
const M = 22; // ring segments
const NECK_END = 0.9;
const PERIOD = 58;

// The circling loop: around the summit, down the south face, low over Dale, up the west shoulder.
const ORBIT = new THREE.CatmullRomCurve3(
  [
    [-560, 1060, -1300], [220, 1560, -2180], [740, 1020, -1120], [340, 540, -420], [-10, 290, 80],
    [-420, 370, -180], [-760, 700, -760],
  ].map((p) => new THREE.Vector3(...p)),
  true,
  'centripetal',
);
const FAR = { c: new THREE.Vector3(3400, 2100, -13800), r: 900 };
const HOVER = { c: new THREE.Vector3(GATE.x, 260, GATE.z + 260), r: 200 };
const PERCH = new THREE.CatmullRomCurve3(
  [
    [72, 262, -772], [58, 226, -752], [40, 194, -734], [25, 165, -719], [15, 141, -708], [9, 124, -699],
    [7, 116, -688], [6, 112, -676], [8, 103, -662], [11, 90, -650],
  ].map((p) => new THREE.Vector3(...p)),
);
const HALL = (s) => new THREE.Vector3(GATE.x, GATE.y + 8, GATE.z - 30 - (NECK_END - s) * L);

function radius(s) {
  // Tail → hips → chest → neck → head.
  if (s < 0.4) return lerp(0.35, 5.4, Math.pow(s / 0.4, 1.1));
  if (s < 0.56) return lerp(5.4, 10.5, ss(0.4, 0.56, s));
  if (s < 0.68) return lerp(10.5, 8.2, ss(0.56, 0.68, s));
  if (s < 0.79) return lerp(8.2, 3.6, ss(0.68, 0.79, s));
  return lerp(3.6, 4.0, ss(0.82, 0.9, s));
}

function scaleTextures() {
  const S = 512;
  const color = document.createElement('canvas');
  color.width = color.height = S;
  const height = document.createElement('canvas');
  height.width = height.height = S;
  const c = color.getContext('2d'), h = height.getContext('2d');
  c.fillStyle = '#7a1c0c';
  c.fillRect(0, 0, S, S);
  h.fillStyle = '#000';
  h.fillRect(0, 0, S, S);
  const rand = rng(3);
  const rows = 16, cols = 16, w = S / cols, rh = S / rows;
  // Overlapping scales, drawn back to front so each lies on the one behind.
  for (let r = -1; r <= rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = (k + (r % 2 ? 0.5 : 0)) * w, y = r * rh;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const cx = x + ox, cy = y + oy;
        const gc = c.createRadialGradient(cx, cy - rh * 0.2, 1, cx, cy, w * 0.75);
        const hue = 8 + rand() * 30;
        gc.addColorStop(0, `hsl(${hue + 18}, 85%, ${52 + rand() * 12}%)`);
        gc.addColorStop(0.55, `hsl(${hue}, 82%, ${34 + rand() * 8}%)`);
        gc.addColorStop(1, `hsl(${hue - 6}, 75%, 14%)`);
        c.fillStyle = gc;
        c.beginPath();
        c.ellipse(cx, cy, w * 0.62, rh * 0.95, 0, 0, Math.PI);
        c.fill();
        const gh = h.createRadialGradient(cx, cy - rh * 0.3, 1, cx, cy, w * 0.7);
        gh.addColorStop(0, '#fff');
        gh.addColorStop(0.7, '#888');
        gh.addColorStop(1, '#000');
        h.fillStyle = gh;
        h.beginPath();
        h.ellipse(cx, cy, w * 0.62, rh * 0.95, 0, 0, Math.PI);
        h.fill();
      }
    }
  }
  // Height → normal map.
  const hd = h.getImageData(0, 0, S, S).data;
  const n = c.createImageData(S, S);
  const at = (x, y) => hd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * 3, dy = (at(x, y - 1) - at(x, y + 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      n.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      n.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      n.data[i + 2] = (1 / len) * 255;
      n.data[i + 3] = 255;
    }
  }
  const normal = document.createElement('canvas');
  normal.width = normal.height = S;
  normal.getContext('2d').putImageData(n, 0, 0);
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const nmap = new THREE.CanvasTexture(normal);
  for (const t of [map, nmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, nmap };
}

function membraneTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#6a1a10');
  grd.addColorStop(1, '#3a0c08');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const rand = rng(8);
  g.strokeStyle = 'rgba(20,4,2,0.55)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    let x = rand() * S, y = 0;
    g.moveTo(x, y);
    while (y < S) {
      x += (rand() - 0.5) * 18;
      y += 10 + rand() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const DRAGON_U = { uDark: { value: 0 }, uBreath: { value: 0 }, uChest: { value: 0 } };

function scaleMaterial(tex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: tex.map,
    normalMap: tex.nmap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    metalness: 0.32,
    roughness: 0.4,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    iridescence: 0.35,
    iridescenceIOR: 1.4,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffb347'),
    envMapIntensity: 0.9,
  });
  return patch(m, {
    key: 'dragon-scales',
    uniforms: DRAGON_U,
    vertexHead: 'attribute float aBelly; varying float vBelly;',
    vertex: 'vBelly = aBelly;',
    fragmentHead: 'uniform float uDark; uniform float uBreath; uniform float uChest; varying float vBelly;',
    color: /* glsl */ `
      {
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
        vec3 belly = vec3(0.93, 0.82, 0.6) * (0.55 + 0.7 * lum);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.25, 0.8, 0.55), belly, vBelly);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.045, 0.045), uDark);
      }
    `,
    roughness: 'roughnessFactor = mix(roughnessFactor, 0.55, vBelly);',
    emissive: /* glsl */ `
      // Fire stirring in his chest shows between the belly scales before he breathes.
      totalEmissiveRadiance += vec3(1.0, 0.38, 0.08) * vBelly * uChest * (0.6 + 0.4 * sin(uTime * 7.0)) * 2.5;
      totalEmissiveRadiance += vec3(1.0, 0.45, 0.12) * uBreath * vBelly * 0.35;
    `,
  });
}

function membraneMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: membraneTexture(), side: THREE.DoubleSide, roughness: 0.6, metalness: 0.05 });
  return patch(m, {
    key: 'dragon-wing',
    uniforms: DRAGON_U,
    vertexHead: 'varying vec3 vWN3;',
    vertexEnd: 'vWN3 = normalize(mat3(modelMatrix) * objectNormal);',
    fragmentHead: 'uniform float uDark; uniform float uBreath; varying vec3 vWN3;',
    color: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), uDark);',
    emissive: /* glsl */ `
      // Firelight from below, and the sun glowing through the thin membrane.
      float under = clamp(-vWN3.y, 0.0, 1.0) * 0.6 + 0.4;
      totalEmissiveRadiance += vec3(1.0, 0.3, 0.08) * (uBreath * 0.45 + uFireGlow.r * 0.12) * under * (1.0 - uDark);
    `,
  });
}

/** Head in local space: +z forward, +y up. */
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 24, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = (z + 1) / 2; // 0 back .. 1 snout
    const narrow = 1 - 0.55 * ss(0.2, 1, f);
    x *= 4.2 * narrow;
    y *= (y > 0 ? 2.9 : 2.1) * (1 - 0.45 * ss(0.3, 1, f));
    y += (f - 0.5) * -1.2;
    // Brow ridges.
    if (y > 0 && f > 0.35 && f < 0.6) y += 0.6 * Math.exp(-(((Math.abs(x) - 1.6) / 0.7) ** 2));
    z = f * 18;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export class Dragon {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'dragon';
    scene.add(this.group);
    const tex = scaleTextures();
    this.mat = scaleMaterial(tex);
    this.wingMat = membraneMaterial();

    // Body tube.
    const verts = N * (M + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2), belly = new Float32Array(verts);
    const idx = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j <= M; j++) {
        const v = i * (M + 1) + j;
        const th = (j / M) * Math.PI * 2;
        uv[v * 2] = (i / (N - 1)) * 11;
        uv[v * 2 + 1] = (j / M) * 3;
        belly[v] = ss(-0.2, -0.65, Math.sin(th));
        if (i < N - 1 && j < M) {
          const a = v, b = v + 1, c = v + M + 1, d = v + M + 2;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aBelly', new THREE.BufferAttribute(belly, 1));
    g.setIndex(idx);
    this.body = new THREE.Mesh(g, this.mat);
    this.body.frustumCulled = false;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Head, jaw, horns, eyes.
    this.head = new THREE.Group();
    const hg = headGeometry();
    hg.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(hg.attributes.position.count).map((_, i) => ss(-0.2, -1.2, hg.attributes.position.getY(i))), 1));
    const headMesh = new THREE.Mesh(hg, this.mat);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.6, 1.5);
    const jg = headGeometry();
    jg.scale(0.82, 0.42, 0.88);
    jg.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(jg.attributes.position.count).fill(0.7), 1));
    const jaw = new THREE.Mesh(jg, this.mat);
    jaw.position.set(0, -0.9, -1.3);
    this.jaw.add(jaw);
    this.head.add(this.jaw);
    const horn = new THREE.ConeGeometry(0.9, 11, 8);
    horn.translate(0, 5.5, 0);
    horn.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(horn.attributes.position.count).fill(0.85), 1));
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(horn, this.mat);
      h.position.set(side * 2.4, 2.6, 3);
      h.rotation.set(-1.95, 0, side * 0.35);
      this.head.add(h);
      const h2 = new THREE.Mesh(horn, this.mat);
      h2.scale.setScalar(0.45);
      h2.position.set(side * 3.6, 0.4, 4.5);
      h2.rotation.set(-1.75, 0, side * 0.9);
      this.head.add(h2);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.2).multiplyScalar(6) }));
      eye.position.set(side * 2.6, 1.6, 10.2);
      this.head.add(eye);
    }
    this.group.add(this.head);

    // Dorsal spines and legs.
    this.spines = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#5a1a0a', roughness: 0.35, metalness: 0.6 }), 46);
    this.spines.frustumCulled = false;
    this.group.add(this.spines);
    const limbMat = this.mat;
    const limbGeo = new THREE.CylinderGeometry(1, 0.8, 1, 10).translate(0, 0.5, 0);
    limbGeo.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(limbGeo.attributes.position.count).fill(0.2), 1));
    this.limbs = new THREE.InstancedMesh(limbGeo, limbMat, 12 + 12);
    this.limbs.frustumCulled = false;
    this.limbs.castShadow = true;
    this.group.add(this.limbs);
    this.claws = new THREE.InstancedMesh(new THREE.ConeGeometry(0.35, 2.2, 5).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.3, metalness: 0.6 }), 12);
    this.claws.frustumCulled = false;
    this.group.add(this.claws);

    // Wings: membranes rebuilt each frame between finger bones.
    this.wings = [-1, 1].map((side) => this.makeWing(side));

    // Spine state.
    this.P = Array.from({ length: N }, () => new THREE.Vector3());
    this.T = Array.from({ length: N }, () => new THREE.Vector3());
    this.Uv = Array.from({ length: N }, () => new THREE.Vector3());
    this.R = Array.from({ length: N }, () => new THREE.Vector3());
    this.perchPts = Array.from({ length: N + 1 }, (_, i) => PERCH.getPointAt(i / N));
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

    // Fire.
    this.breath = new Billboards('live', 1600);
    this.breath.mesh.geometry.instanceCount = 0;
    this.particles = Array.from({ length: 1600 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 1, life: 1 }));
    this.next = 0;
    scene.add(this.breath.mesh);
    this.light = new THREE.PointLight(0xff7a2a, 0, 600, 1.5);
    scene.add(this.light);

    this.mouth = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.visible = false;
    this.vignettes = [
      { hour: 2, label: 'The dragon over the peak', focus: () => this.headPos(), view: () => ({ pos: this.headPos().clone().add(new THREE.Vector3(260, 120, 420)), target: this.headPos() }) },
      { hour: 3, label: 'Settled above the Gate', focus: new THREE.Vector3(GATE.x, 150, GATE.z), view: { pos: new THREE.Vector3(GATE.x + 160, 120, GATE.z + 260), target: new THREE.Vector3(GATE.x, 130, GATE.z) } },
    ];
  }

  headPos() {
    return this.head.position;
  }

  makeWing(side) {
    const panels = 5, Ugrid = 10, Vgrid = 6;
    const per = Ugrid * Vgrid;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(panels * per * 3);
    const uv = new Float32Array(panels * per * 2);
    const idx = [];
    for (let p = 0; p < panels; p++) {
      for (let u = 0; u < Ugrid; u++) {
        for (let v = 0; v < Vgrid; v++) {
          const k = p * per + u * Vgrid + v;
          uv[k * 2] = (p + v / (Vgrid - 1)) * 0.8;
          uv[k * 2 + 1] = u / (Ugrid - 1);
          if (u < Ugrid - 1 && v < Vgrid - 1) {
            const a = k, b = k + 1, c = k + Vgrid, d = k + Vgrid + 1;
            if (side > 0) idx.push(a, c, b, b, c, d);
            else idx.push(a, b, c, b, d, c);
          }
        }
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.wingMat);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    this.group.add(mesh);
    const bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.6, 1, 6).translate(0, 0.5, 0), this.mat, 6);
    bones.geometry.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(bones.geometry.attributes.position.count).fill(0.15), 1));
    bones.frustumCulled = false;
    bones.castShadow = true;
    this.group.add(bones);
    return { side, mesh, pos, bones, Ugrid, Vgrid, per, joints: {} };
  }

  /** Flight path position for hour t at clock time. */
  flightAt(t, time, out) {
    const u = ((time / PERIOD) % 1 + 1) % 1;
    ORBIT.getPointAt(u, out);
    const a = FAR.c, ang = time * 0.12;
    const far = this.tmp.d.set(a.x + Math.cos(ang) * FAR.r, a.y + Math.sin(time * 0.3) * 60, a.z + Math.sin(ang) * FAR.r);
    out.lerpVectors(far, out, ss(1.15, 1.9, t));
    const hang = time * 0.55;
    const hover = this.tmp.c.set(HOVER.c.x + Math.cos(hang) * HOVER.r, HOVER.c.y + Math.sin(time * 0.8) * 20, HOVER.c.z + Math.sin(hang) * HOVER.r * 0.6);
    out.lerp(hover, ss(2.32, 2.72, t));
    return out;
  }

  update(S) {
    const t = S.t, time = S.time;
    this.visible = t > 0.55 && t < 3.9;
    this.group.visible = this.visible;
    if (!this.visible) {
      this.light.intensity = 0;
      U.uDsOn.value = 0;
      DRAGON_U.uBreath.value = 0;
      this.updateBreath(S, false);
      return;
    }
    const perch = ss(2.66, 2.96, t);
    const crawl = (s) => ss(3.42 + (NECK_END - s) * 0.32, 3.55 + (NECK_END - s) * 0.32, t);
    const { P, T, Uv, R } = this;
    const a = this.tmp.a, b = this.tmp.b;
    // Speed along the path (for how far behind the head each spine sample is).
    const p0 = this.flightAt(t, time - 0.05, new THREE.Vector3());
    const p1 = this.flightAt(t, time + 0.05, new THREE.Vector3());
    const speed = Math.max(20, p0.distanceTo(p1) / 0.1);
    const up = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * NECK_END;
      const lag = ((NECK_END - s) * L) / speed;
      this.flightAt(t, time - lag, a);
      // Serpentine sway down the tail; the neck lifted.
      const wave = Math.sin(s * 14 - time * 2.2) * 2.2 * (1 - s) * (1 - perch);
      a.y += 3.5 * ss(0.68, 0.9, s) * (1 - perch);
      P[i].copy(a);
      P[i].x += wave;
      if (perch > 0) {
        const q = this.perchPts[Math.round((s / NECK_END) * N)];
        b.copy(q);
        // He breathes: the chest rises and falls on the rock.
        b.addScaledVector(new THREE.Vector3(0, 0.4, 1).normalize(), Math.sin(time * 1.1) * 0.8 * ss(0.4, 0.7, s));
        // The neck sweeps slowly over the valley.
        b.x += Math.sin(time * 0.35) * 14 * ss(0.72, 0.9, s);
        P[i].lerp(b, perch);
      }
      const c = crawl(s);
      if (c > 0) P[i].lerp(HALL(s), c);
    }
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
      T[i].subVectors(P[i1], P[i0]).normalize();
      // Bank into turns: up leans toward the path's acceleration.
      const s = (i / (N - 1)) * NECK_END;
      const lag = ((NECK_END - s) * L) / speed;
      const pa = this.flightAt(t, time - lag - 0.3, this.tmp.c.clone());
      const pb = this.flightAt(t, time - lag + 0.3, this.tmp.d.clone());
      const pm = this.flightAt(t, time - lag, b);
      const acc = pa.add(pb).sub(pm.multiplyScalar(2)).divideScalar(0.09);
      up.set(0, 25, 0).add(acc.multiplyScalar(0.6 * (1 - perch)));
      up.lerp(new THREE.Vector3(0, 0.5, 1), perch).normalize();
      R[i].crossVectors(T[i], up).normalize();
      Uv[i].crossVectors(R[i], T[i]).normalize();
    }

    // Body rings.
    const pos = this.pos, nrm = this.nrm;
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * NECK_END;
      const r = radius(s);
      for (let j = 0; j <= M; j++) {
        const th = (j / M) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const ridge = 1 + 0.16 * Math.exp(-(((th - Math.PI / 2) / 0.35) ** 2));
        const rw = r * 1.05, rh = r * (sn < 0 ? 0.82 : 1) * ridge;
        const v = (i * (M + 1) + j) * 3;
        pos[v] = P[i].x + R[i].x * cs * rw + Uv[i].x * sn * rh;
        pos[v + 1] = P[i].y + R[i].y * cs * rw + Uv[i].y * sn * rh;
        pos[v + 2] = P[i].z + R[i].z * cs * rw + Uv[i].z * sn * rh;
        const nx = R[i].x * cs / rw + Uv[i].x * sn / rh, ny = R[i].y * cs / rw + Uv[i].y * sn / rh, nz = R[i].z * cs / rw + Uv[i].z * sn / rh;
        const ln = Math.hypot(nx, ny, nz) || 1;
        nrm[v] = nx / ln; nrm[v + 1] = ny / ln; nrm[v + 2] = nz / ln;
      }
    }
    this.body.geometry.attributes.position.needsUpdate = true;
    this.body.geometry.attributes.normal.needsUpdate = true;

    // Head on the end of the neck.
    const hi = N - 1;
    const basis = new THREE.Matrix4().makeBasis(R[hi].clone().negate(), Uv[hi], T[hi]);
    this.head.position.copy(P[hi]).addScaledVector(T[hi], -1.5);
    this.head.quaternion.setFromRotationMatrix(basis);
    // Perched, the head dips to look down on Dale.
    if (perch > 0) this.head.rotateX(0.35 * perch);

    // Breath: circling passes over the slopes; perched, gouts down the channel every few seconds.
    const u = ((time / PERIOD) % 1 + 1) % 1;
    const passes = (u > 0.16 && u < 0.3) || (u > 0.56 && u < 0.68) ? 1 : 0;
    const circling = band(t, 1.72, 1.88, 2.4, 2.6) * passes;
    const cycle = (time % 9) / 9;
    const perched = band(t, 2.86, 2.95, 3.35, 3.45) * (cycle < 0.42 ? 1 : 0);
    const breathing = Math.max(circling, perched);
    this.jaw.rotation.x = 0.5 * breathing + 0.08 * Math.sin(time * 1.3);
    this.mouth.set(0, -0.8, 18.5).applyMatrix4(this.head.matrixWorld.compose(this.head.position, this.head.quaternion, this.head.scale));
    this.aim.set(0, perch > 0.5 ? -0.55 : -0.4, 1).normalize().applyQuaternion(this.head.quaternion);
    DRAGON_U.uChest.value = perch * band(cycle, 0.75, 0.95, 1.1, 1.2) + band(t, 1.7, 1.85, 2.5, 2.6) * 0.3;
    this.breathOn = breathing;
    this.updateBreath(S, breathing > 0.5, p1.sub(p0).multiplyScalar(10 * (1 - perch)));
    this.light.position.copy(this.mouth).addScaledVector(this.aim, 40);
    this.light.intensity = breathing * 3200 * (0.8 + 0.2 * Math.sin(time * 23));
    DRAGON_U.uBreath.value = lerp(DRAGON_U.uBreath.value, breathing, 0.15);

    this.updateLimbs(perch);
    this.updateWings(S, perch);

    // A speck over the northern moors reads as a dark shape, not a lit one.
    const dist = S.camera.position.distanceTo(P[Math.floor(N * 0.55)]);
    DRAGON_U.uDark.value = ss(3500, 9000, dist);
    // Wing shadow over the Mountain and Dale.
    this.updateShadow(t);
  }

  updateLimbs(perch) {
    const { P, T, Uv, R } = this;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    let li = 0, ci = 0;
    const seg = (a, b, r) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      q.setFromUnitVectors(Y, d.normalize());
      this.limbs.setMatrixAt(li++, m.compose(a, q, new THREE.Vector3(r, len, r)));
    };
    for (const [s, fore] of [[0.47, 0], [0.66, 1]]) {
      const i = Math.round((s / NECK_END) * (N - 1));
      const r = radius(s);
      for (const side of [-1, 1]) {
        const hip = P[i].clone().addScaledVector(R[i], side * r * 0.75).addScaledVector(Uv[i], -r * 0.35);
        const flyFoot = hip.clone().addScaledVector(T[i], -9).addScaledVector(Uv[i], -2.5).addScaledVector(R[i], side * 1.5);
        const perchFoot = hip.clone().addScaledVector(T[i], fore ? 6 : 2).addScaledVector(Uv[i], -9).addScaledVector(R[i], side * 3);
        const foot = flyFoot.lerp(perchFoot, perch);
        const knee = hip.clone().lerp(foot, 0.5).addScaledVector(fore ? T[i] : Uv[i], fore ? -3 : 3).addScaledVector(R[i], side * 1.5);
        seg(hip, knee, r * 0.32);
        seg(knee, foot, r * 0.22);
        for (let k = -1; k <= 1; k++) {
          const dir = T[i].clone().multiplyScalar(lerp(-1, 1, perch)).addScaledVector(R[i], k * 0.4).addScaledVector(Uv[i], -0.6).normalize();
          q.setFromUnitVectors(Y, dir);
          this.claws.setMatrixAt(ci++, m.compose(foot, q, new THREE.Vector3(1, 1, 1)));
        }
      }
    }
    this.limbs.count = li;
    this.limbs.instanceMatrix.needsUpdate = true;
    this.claws.instanceMatrix.needsUpdate = true;
    // Spines along the ridge.
    for (let k = 0; k < 46; k++) {
      const s = 0.1 + (k / 45) * 0.78;
      const i = Math.round((s / NECK_END) * (N - 1));
      const r = radius(s);
      const h = r * 0.6 + 1.2;
      const base = P[i].clone().addScaledVector(Uv[i], r * 1.05);
      const dir = Uv[i].clone().addScaledVector(T[i], -0.7).normalize();
      q.setFromUnitVectors(Y, dir);
      this.spines.setMatrixAt(k, m.compose(base, q, new THREE.Vector3(r * 0.3 + 0.4, h, r * 0.3 + 0.4)));
    }
    this.spines.instanceMatrix.needsUpdate = true;
  }

  updateWings(S, perch) {
    const { P, T, Uv, R } = this;
    const time = S.time;
    const si = Math.round((0.655 / NECK_END) * (N - 1));
    const hipI = Math.round((0.42 / NECK_END) * (N - 1));
    // Mighty slow beats, gliding between; mantled and half-raised when perched.
    const beatAmp = lerp(0.18 + 0.32 * ss(0.3, 0.8, Math.sin(time * 0.21) * 0.5 + 0.5), 0.12, perch);
    const flap = Math.sin(time * 1.9) * beatAmp + lerp(0.05, 0.75, perch);
    const fold = lerp(0.05, 0.55, perch);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    for (const w of this.wings) {
      const side = w.side;
      const r = radius(0.655);
      const sh = P[si].clone().addScaledVector(R[si], side * r * 0.7).addScaledVector(Uv[si], r * 0.55);
      const out = R[si].clone().multiplyScalar(side);
      const fwd = T[si], upv = Uv[si];
      // Direction in the wing frame: lateral, forward, up.
      const dirOf = (lat, fw, upc) => out.clone().multiplyScalar(lat).addScaledVector(fwd, fw).addScaledVector(upv, upc).normalize();
      const lift = (k) => Math.sin(flap * k);
      const elbow = sh.clone().addScaledVector(dirOf(Math.cos(flap) * (1 - fold * 0.6), lerp(0.25, -0.5, fold), lift(1.0) + fold * 0.6), 24);
      const wrist = elbow.clone().addScaledVector(dirOf(Math.cos(flap * 1.3) * (1 - fold * 0.8), lerp(-0.35, 0.9, fold), lift(1.25) * 0.9), 32);
      const spread = [0.55, 0.05, -0.55, -1.1].map((x) => lerp(x, -2.2 + x * 0.25, fold));
      const lens = [58, 52, 44, 36].map((l) => l * (1 - fold * 0.35));
      const fingers = spread.map((ang, k) => {
        const tip = wrist.clone().addScaledVector(dirOf(Math.cos(ang) * Math.cos(flap * 1.45), Math.sin(ang), lift(1.45) * 0.85 - 0.08 * k), lens[k]);
        return [wrist.clone(), wrist.clone().lerp(tip, 0.5).addScaledVector(upv, -1.5 - k * 0.4), tip];
      });
      // The body edge from the shoulder back to the hip.
      const hip = P[hipI].clone().addScaledVector(R[hipI], side * radius(0.42) * 0.9);
      const sample = (pts, u) => {
        // Even sampling along a short polyline.
        const lens2 = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += pts[i].distanceTo(pts[i - 1]);
          lens2.push(total);
        }
        let d = u * total, i = 0;
        while (i < lens2.length - 1 && lens2[i] < d) i++;
        const prev = i === 0 ? 0 : lens2[i - 1];
        const k = (d - prev) / (lens2[i] - prev || 1);
        return pts[i].clone().lerp(pts[i + 1], k);
      };
      const arm = [sh, elbow, wrist, fingers[3][1], fingers[3][2]];
      const edge = [sh, P[Math.round((si + hipI) / 2)].clone().addScaledVector(R[Math.round((si + hipI) / 2)], side * r * 0.85), hip];
      const panelLines = [
        [fingers[0], fingers[1]],
        [fingers[1], fingers[2]],
        [fingers[2], fingers[3]],
        [[sh, elbow, wrist], [sh, sh.clone().lerp(wrist, 0.5).addScaledVector(fwd, -6), fingers[0][0]]],
        [arm, edge],
      ];
      const pos = w.pos;
      const normalSign = upv.clone();
      for (let p = 0; p < panelLines.length; p++) {
        const [A, B] = panelLines[p];
        for (let ui = 0; ui < w.Ugrid; ui++) {
          const u = ui / (w.Ugrid - 1);
          for (let vi = 0; vi < w.Vgrid; vi++) {
            const v = vi / (w.Vgrid - 1);
            // Scalloped trailing edge between finger tips.
            const scallop = p < 3 ? 1 - 0.2 * Math.sin(Math.PI * v) * Math.pow(u, 3) : 1;
            const pa = sample(A, u * scallop), pb = sample(B, u * scallop);
            const pt = pa.lerp(pb, v);
            const sag = Math.sin(Math.PI * v) * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (p === 4 ? 3.5 : 2.2);
            pt.addScaledVector(normalSign, -sag * (0.6 + 0.4 * Math.cos(flap)) + Math.sin(time * 6 + u * 4 + p) * 0.25 * v);
            const k = (p * w.per + ui * w.Vgrid + vi) * 3;
            pos[k] = pt.x; pos[k + 1] = pt.y; pos[k + 2] = pt.z;
          }
        }
      }
      w.mesh.geometry.attributes.position.needsUpdate = true;
      w.mesh.geometry.computeVertexNormals();
      // Bones.
      const bones = [[sh, elbow, 1.6], [elbow, wrist, 1.2], ...fingers.map((f) => [f[0], f[2], 0.55])];
      bones.forEach(([a, b, r2], i) => {
        const d = new THREE.Vector3().subVectors(b, a);
        q.setFromUnitVectors(Y, d.clone().normalize());
        w.bones.setMatrixAt(i, m.compose(a, q, new THREE.Vector3(r2, d.length(), r2)));
      });
      w.bones.instanceMatrix.needsUpdate = true;
      w.joints = { sh, wrist, tip0: fingers[0][2], tip2: fingers[2][2], hip };
    }
  }

  updateShadow(t) {
    // Wing and body silhouettes for the analytic shadow cast across the valley.
    const on = band(t, 1.45, 1.7, 2.9, 3.1);
    U.uDsOn.value = on;
    if (on <= 0) return;
    const tri = U.uDsTri.value;
    let k = 0;
    for (const w of this.wings) {
      const j = w.joints;
      tri[k++].copy(j.sh); tri[k++].copy(j.tip0); tri[k++].copy(j.tip2);
      tri[k++].copy(j.sh); tri[k++].copy(j.tip2); tri[k++].copy(j.hip);
    }
    const seg = U.uDsSeg.value, P = this.P;
    const at = (s) => P[Math.round((s / NECK_END) * (N - 1))];
    seg[0].copy(at(0.05)); seg[1].copy(at(0.4));
    seg[2].copy(at(0.4)); seg[3].copy(at(0.7));
    seg[4].copy(at(0.7)); seg[5].copy(this.head.position).addScaledVector(this.T[N - 1], 14);
    U.uDsRad.value.set(2.5, 6.5, 3);
  }

  updateBreath(S, emitting, vel = new THREE.Vector3()) {
    const dt = Math.min(0.05, S.dt);
    const parts = this.particles;
    if (emitting) {
      const count = Math.floor(dt * 900);
      for (let n = 0; n < count; n++) {
        const p = parts[this.next];
        this.next = (this.next + 1) % parts.length;
        p.p.copy(this.mouth);
        p.v.copy(this.aim).multiplyScalar(210 + Math.random() * 70).add(vel);
        p.v.x += (Math.random() - 0.5) * 50;
        p.v.y += (Math.random() - 0.5) * 50;
        p.v.z += (Math.random() - 0.5) * 50;
        p.age = 0;
        p.life = 0.9 + Math.random() * 0.8;
        p.p.addScaledVector(p.v, Math.random() * dt);
      }
    }
    const o = this.breath.origin.array, prm = this.breath.param.array;
    let n = 0;
    for (const p of parts) {
      if (p.age >= 1) continue;
      p.age += dt / p.life;
      p.v.multiplyScalar(1 - 1.7 * dt);
      p.v.y += 26 * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.age >= 1) continue;
      o[n * 3] = p.p.x; o[n * 3 + 1] = p.p.y; o[n * 3 + 2] = p.p.z;
      prm[n * 4] = 1.6 + p.age * 15;
      prm[n * 4 + 1] = clamp(0.8 - p.age * 1.6);
      prm[n * 4 + 2] = (1 - p.age) * Math.min(1, p.age * 6) * 0.45;
      n++;
    }
    this.breath.mesh.geometry.instanceCount = n;
    this.breath.origin.needsUpdate = true;
    this.breath.param.needsUpdate = true;
  }
}
