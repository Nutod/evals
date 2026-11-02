// The Front Gate: a dressed rock face with a tall arch flanked by two carved
// dwarf kings, great doors that stand open at noon, grind shut as the dragon
// circles and burst in at dusk, and lamplit halls that become a furnace by night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CULVERT, GATE } from '../core/layout.js';
import { patch, shaderMaterial } from '../core/shaderlib.js';
import { band, rng, ss } from '../core/util.js';
import { stoneMaterial } from './materials.js';

const Y0 = GATE.y - 8; // facade foot
const RECT_H = 30; // door height to the springing of the arch

function archPath(shape, hw, rectH, cx = 0, y0 = 0) {
  shape.moveTo(cx - hw, y0);
  shape.lineTo(cx + hw, y0);
  shape.lineTo(cx + hw, y0 + rectH);
  shape.absarc(cx, y0 + rectH, hw, 0, Math.PI, false);
  shape.lineTo(cx - hw, y0);
  return shape;
}

function facadeGeometry() {
  const rand = rng(7);
  const s = new THREE.Shape();
  const W = 118;
  const pts = [[-W, 0], [W, 0]];
  // Ragged sides and top where dressed stone gives way to the living rock.
  for (let y = 12; y <= 96; y += 12) pts.push([W - 4 - rand() * 10 - y * 0.15, y]);
  for (let x = W - 26; x >= -W + 26; x -= 13) pts.push([x, 104 + rand() * 10 + Math.max(0, 40 - Math.abs(x)) * 0.7]);
  for (let y = 96; y >= 12; y -= 12) pts.push([-W + 4 + rand() * 10 + y * 0.15, y]);
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  s.holes.push(archPath(new THREE.Path(), GATE.halfW, RECT_H, 0, GATE.y - Y0));
  s.holes.push(archPath(new THREE.Path(), 8, 6, CULVERT.x - GATE.x, 1));
  const g = new THREE.ExtrudeGeometry(s, { depth: 26, bevelEnabled: false, curveSegments: 24 });
  g.translate(GATE.x, Y0, GATE.z - 26);
  return g;
}

function archRings() {
  const geos = [];
  for (let k = 1; k <= 3; k++) {
    const hw = GATE.halfW + k * 2.4;
    const s = archPath(new THREE.Shape(), hw, RECT_H, 0, -k * 0.01);
    s.holes.push(archPath(new THREE.Path(), hw - 2.4, RECT_H, 0, 0));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.9 * (4 - k) + 0.6, bevelEnabled: false, curveSegments: 24 });
    g.translate(GATE.x, GATE.y, GATE.z);
    geos.push(g);
  }
  // Lintel band carrying the runes, and the threshold steps.
  const lintel = new THREE.BoxGeometry(56, 7, 2.2);
  lintel.translate(GATE.x, GATE.y + RECT_H + GATE.halfW + 12, GATE.z + 1.1);
  geos.push(lintel);
  // Pilasters, cornice and a stepped pediment carved out of the face.
  for (const x of [-96, -78, -60, 60, 78, 96]) {
    const p = new THREE.BoxGeometry(6, 84, 2.6);
    p.translate(GATE.x + x, Y0 + 42, GATE.z + 1.3);
    geos.push(p);
    const cap = new THREE.BoxGeometry(8, 2.4, 3.6);
    cap.translate(GATE.x + x, Y0 + 85, GATE.z + 1.8);
    geos.push(cap);
  }
  for (let k = 0; k < 3; k++) {
    const c = new THREE.BoxGeometry(206 - k * 40, 2.2, 3.2 - k * 0.6);
    c.translate(GATE.x, Y0 + 88 + k * 4.4, GATE.z + 1.6);
    geos.push(c);
  }
  const sill = new THREE.BoxGeometry(2 * GATE.halfW + 16, 0.5, 8);
  sill.translate(GATE.x, GATE.y + 0.1, GATE.z + 3);
  geos.push(sill);
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** One carved dwarf king: robe, folded arms on a great axe, braided beard, hooded helm. */
function statueGeometry(mirror) {
  const parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  add(new THREE.BoxGeometry(18, 7, 14), 0, 3.5, 0);
  add(new THREE.BoxGeometry(20, 1.2, 15.5), 0, 7.4, 0);
  const robe = new THREE.LatheGeometry([
    new THREE.Vector2(8.2, 0), new THREE.Vector2(7.6, 6), new THREE.Vector2(6.6, 16), new THREE.Vector2(6.0, 23), new THREE.Vector2(6.4, 28),
    new THREE.Vector2(7.4, 34), new THREE.Vector2(7.6, 37), new THREE.Vector2(5.0, 39), new THREE.Vector2(0.01, 39.5),
  ], 10);
  robe.scale(1, 1, 0.72);
  add(robe, 0, 8, 0);
  add(new THREE.BoxGeometry(17.5, 4.2, 8.4), 0, 45, -0.5, 0, 0, 0);
  // Belt.
  add(new THREE.CylinderGeometry(6.5, 6.5, 1.6, 10).scale(1, 1, 0.74), 0, 31, 0);
  // Arms folded forward onto the axe haft.
  add(new THREE.BoxGeometry(3.4, 13, 3.6), -6.6, 39, 2.2, 0.55, 0, 0.2);
  add(new THREE.BoxGeometry(3.4, 13, 3.6), 6.6, 39, 2.2, 0.55, 0, -0.2);
  add(new THREE.BoxGeometry(3.2, 3, 9), -3.2, 33.2, 6.2, 0, 0.35, 0);
  add(new THREE.BoxGeometry(3.2, 3, 9), 3.2, 33.2, 6.2, 0, -0.35, 0);
  // Head, helm and nose guard.
  add(new THREE.SphereGeometry(3.6, 10, 8).scale(1, 1.1, 1), 0, 50.5, 1);
  add(new THREE.CylinderGeometry(3.9, 4.1, 3.2, 10), 0, 52.8, 0.8);
  add(new THREE.ConeGeometry(4.0, 4.4, 10), 0, 56.6, 0.8);
  add(new THREE.BoxGeometry(0.7, 3.4, 1.2), 0, 50.4, 4.6);
  // The beard: long, broad, braided in two.
  add(new THREE.ConeGeometry(3.6, 16, 6).scale(1.1, 1, 0.55), 0, 40, 4.6, Math.PI, 0, 0);
  add(new THREE.ConeGeometry(1.1, 9, 5), -1.6, 29.5, 5.6, Math.PI, 0, 0);
  add(new THREE.ConeGeometry(1.1, 9, 5), 1.6, 29.5, 5.6, Math.PI, 0, 0);
  // The great axe, head resting at the feet, hands folded on the pommel.
  add(new THREE.CylinderGeometry(0.75, 0.9, 28, 8), 0, 22, 8.6);
  add(new THREE.SphereGeometry(1.3, 8, 6), 0, 36.4, 8.6);
  const blade = new THREE.Shape();
  blade.moveTo(0, -4); blade.quadraticCurveTo(7, -6, 8.5, 0); blade.quadraticCurveTo(7, 6, 0, 4); blade.lineTo(0, -4);
  const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.8, bevelEnabled: false, curveSegments: 6 });
  bg.translate(0, 0, -0.4);
  add(bg.clone(), 0.6, 13, 8.6);
  add(bg, -0.6, 13, 8.6, 0, Math.PI, 0);
  // Hood falling behind into the rock.
  add(new THREE.BoxGeometry(14, 20, 6), 0, 46, -5);
  const g = mergeGeometries(parts.map((p) => {
    p.deleteAttribute('uv');
    return p;
  }));
  if (mirror) g.scale(-1, 1, 1);
  g.computeVertexNormals();
  return g;
}

function runeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9184';
  g.fillRect(0, 0, c.width, c.height);
  const rand = rng(31);
  g.strokeStyle = '#2a2621';
  g.lineWidth = 7;
  g.lineCap = 'square';
  // Invented angular runes: a stave with branches, read along the lintel.
  for (let x = 40; x < c.width - 30; x += 46) {
    g.beginPath();
    g.moveTo(x, 24);
    g.lineTo(x, 104);
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const y = 30 + rand() * 60;
      const dir = rand() < 0.5 ? -1 : 1;
      g.moveTo(x, y);
      g.lineTo(x + dir * 18, y + (rand() < 0.5 ? -18 : 18));
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const HALL_VERT = /* glsl */ `
varying vec3 vWP;
varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 wp = modelMatrix * p;
  vWP = wp.xyz;
  vN = normal;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const HALL_FRAG = /* glsl */ `
uniform float uLamps, uFurnace;
uniform vec3 uTint;
varying vec3 vWP;
varying vec3 vN;
#include <fog_pars_fragment>
void main() {
  vec3 p = vWP;
  float depth = ${GATE.z.toFixed(1)} - p.z;
  float n = lmFbm(p.xy * 0.2 + p.z * 0.05);
  vec3 stone = uTint * (0.75 + 0.5 * n);
  // Pools of lamplight every 18 m along the walls and pillars.
  float lz = abs(fract((depth - 14.0) / 18.0) - 0.5) * 18.0;
  float lamp = exp(-lz * lz / 26.0) * (exp(-pow(p.y - ${(GATE.y + 9).toFixed(1)}, 2.0) / 60.0) + 0.5 * exp(-pow(p.y - ${(GATE.y + 24).toFixed(1)}, 2.0) / 90.0));
  float forge = exp(-max(0.0, 200.0 - depth) / 26.0) * 1.6;
  vec3 light = vec3(1.0, 0.62, 0.3) * lamp * 1.4 * uLamps + vec3(1.0, 0.36, 0.08) * forge * uLamps + vec3(0.05, 0.045, 0.04);
  light *= exp(-depth / 160.0) * 0.7 + 0.3;
  vec3 col = stone * light;
  // By night the halls are a furnace.
  float flick = 0.75 + 0.25 * lmNoise(vec2(uTime * 2.3, depth * 0.05));
  col += vec3(1.0, 0.32, 0.06) * uFurnace * flick * (0.6 + 1.4 * smoothstep(20.0, 160.0, depth)) * (0.5 + 0.5 * n);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Gate {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'front-gate';
    scene.add(this.group);
    const rock = stoneMaterial({ color: '#8c877e', blocks: 0, key: 'gate-rock', soot: 0.6, ignite: '2.95 + max(0.0, vWorldPos.y - 60.0) * 0.004' });
    const dressed = stoneMaterial({ color: '#a39d92', blocks: 1.6, key: 'gate-dressed', soot: 0.7, ignite: '2.9' });

    const facade = new THREE.Mesh(facadeGeometry(), rock);
    facade.castShadow = facade.receiveShadow = true;
    const rings = new THREE.Mesh(archRings(), dressed);
    rings.castShadow = rings.receiveShadow = true;
    this.group.add(facade, rings);

    const runes = new THREE.Mesh(new THREE.PlaneGeometry(52, 6.5), new THREE.MeshStandardMaterial({ map: runeTexture(), roughness: 0.9 }));
    runes.position.set(GATE.x, GATE.y + RECT_H + GATE.halfW + 12, GATE.z + 2.25);
    this.group.add(runes);

    const kingMat = stoneMaterial({ color: '#958f85', blocks: 0, key: 'gate-kings', soot: 0.55, ignite: '3.0' });
    for (const side of [-1, 1]) {
      const king = new THREE.Mesh(statueGeometry(side > 0), kingMat);
      king.position.set(GATE.x + side * 37, GATE.y - 7.5, GATE.z + 6);
      king.castShadow = king.receiveShadow = true;
      this.group.add(king);
    }

    // The great doors: two leaves, iron-banded, hinged at the jambs.
    const doorMat = patch(new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 0.6, metalness: 0.35 }), {
      key: 'gate-door',
      shade: true,
      color: /* glsl */ `
        {
          vec3 p = vObj;
          float band = smoothstep(0.35, 0.25, abs(fract(p.y / 4.2) - 0.5) * 4.2 - 1.6);
          float plank = 0.85 + 0.15 * lmNoise(vec2(p.x * 1.7, p.y * 0.08));
          float stud = smoothstep(0.35, 0.2, length(vec2(fract(p.x / 1.6) - 0.5, (fract(p.y / 4.2) - 0.5) * 4.2 / 1.6))) * band;
          vec3 wood = vec3(0.30, 0.20, 0.12) * plank;
          vec3 iron = vec3(0.16, 0.15, 0.15) + stud * 0.25;
          diffuseColor.rgb = mix(wood, iron, max(band * 0.9, stud));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.035, 0.03), lmBurn(2.86) * 0.8);
        }`,
      emissive: 'totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * lmEmber(2.86) * pow(lmNoise(vObj.xy * 0.9), 3.0) * 4.0;',
    });
    this.doors = [];
    for (const side of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(GATE.halfW, 0);
      s.lineTo(GATE.halfW, RECT_H);
      s.absarc(0, RECT_H, GATE.halfW, 0, Math.PI / 2, false);
      s.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false, curveSegments: 12 });
      // Hinge at the jamb: leaf extends from the hinge toward the centre.
      g.translate(-GATE.halfW, 0, -1.2);
      if (side < 0) g.scale(-1, 1, 1);
      const pivot = new THREE.Group();
      pivot.position.set(GATE.x + side * GATE.halfW, GATE.y, GATE.z - 3);
      const leaf = new THREE.Mesh(g, doorMat);
      leaf.castShadow = true;
      pivot.add(leaf);
      this.group.add(pivot);
      this.doors.push({ pivot, side });
    }

    // The hauling chain beside the east jamb, with its winch.
    const link = new THREE.TorusGeometry(0.55, 0.16, 6, 12);
    link.scale(1, 1.6, 1);
    this.chainLinks = 34;
    this.chain = new THREE.InstancedMesh(link, new THREE.MeshStandardMaterial({ color: '#3b3632', metalness: 0.8, roughness: 0.45 }), this.chainLinks);
    this.chain.castShadow = true;
    this.group.add(this.chain);
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.7, metalness: 0.3 }));
    winch.position.set(GATE.x + GATE.halfW + 7, GATE.y + 1.6, GATE.z + 4);
    winch.castShadow = true;
    this.winch = winch;
    this.group.add(winch);
    this.chainTop = new THREE.Vector3(GATE.x + GATE.halfW + 3.5, GATE.y + RECT_H + 8, GATE.z + 1.5);
    this.chainBottom = winch.position.clone().add(new THREE.Vector3(-1.5, 1.4, 0));

    this.buildHall();

    this.light = new THREE.PointLight(0xff6a20, 0, 900, 1.6);
    this.light.position.set(GATE.x, GATE.y + 16, GATE.z + 30);
    this.group.add(this.light);
    this.vignettes = [
      {
        hour: 2,
        label: 'The sentry at the Gate chain',
        focus: this.chainBottom.clone().add(new THREE.Vector3(0, 4, 0)),
        view: { pos: new THREE.Vector3(GATE.x + 46, GATE.y + 6, GATE.z + 40), target: this.chainBottom.clone().add(new THREE.Vector3(-4, 6, 0)) },
      },
    ];
  }

  buildHall() {
    const mat = (this.hallMat = shaderMaterial({
      uniforms: { uLamps: { value: 1 }, uFurnace: { value: 0 }, uTint: { value: new THREE.Color('#6e6458') } },
      vertexShader: HALL_VERT,
      fragmentShader: HALL_FRAG,
      side: THREE.BackSide,
    }));
    const depth = 230;
    const box = new THREE.Mesh(new THREE.BoxGeometry(34, 50, depth), mat);
    box.position.set(GATE.x, GATE.y + 24, GATE.z - depth / 2 - 0.5);
    this.group.add(box);
    const front = mat.clone();
    front.side = THREE.FrontSide;
    front.uniforms = mat.uniforms;
    // Pillars, a stair climbing into the dark, a gallery.
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.8, 48, 8), front, 22);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let z = GATE.z - 16; z > GATE.z - 216 && i < 22; z -= 19) {
      for (const x of [-10.5, 10.5]) pillars.setMatrixAt(i++, m.makeTranslation(GATE.x + x, GATE.y + 23, z));
    }
    pillars.count = i;
    this.group.add(pillars);
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1, 2.2), front, 30);
    for (let k = 0; k < 30; k++) steps.setMatrixAt(k, m.makeTranslation(GATE.x - 12, GATE.y + 0.5 + k * 1, GATE.z - 120 - k * 2.2));
    this.group.add(steps);
    const gallery = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 6), front);
    gallery.position.set(GATE.x, GATE.y + 31, GATE.z - 190);
    this.group.add(gallery);
    // Lamps: warm points that bloom.
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.28).multiplyScalar(5) });
    this.lampMat = lampMat;
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat, 60);
    let n = 0;
    for (let z = GATE.z - 14; z > GATE.z - 220 && n < 60; z -= 18) {
      for (const [x, y] of [[-16.4, 9], [16.4, 9], [-9, 24], [9, 24]]) lamps.setMatrixAt(n++, m.makeTranslation(GATE.x + x, GATE.y + y, z));
    }
    lamps.count = n;
    this.group.add(lamps);
    // The culvert tunnel: dark, with the river in it.
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 60), mat);
    tunnel.position.set(CULVERT.x, Y0 + 11, GATE.z - 30);
    this.group.add(tunnel);
  }

  update(S) {
    const t = S.t;
    // Doors: open at noon, grinding shut as the dragon circles, burst in at dusk.
    const close = ss(1.7, 2.55, t);
    const closing = band(t, 1.7, 1.8, 2.45, 2.55);
    const burst = ss(2.8, 2.98, t);
    for (const d of this.doors) {
      const open = 1.62 * (1 - close) + Math.sin(S.time * 11 + d.side) * 0.006 * closing;
      d.pivot.rotation.y = -d.side * (open * (1 - burst) + 1.25 * burst);
      d.pivot.rotation.z = d.side * 0.32 * burst;
      d.pivot.position.z = GATE.z - 3 - 7 * burst;
      d.pivot.position.y = GATE.y - 2.5 * burst;
    }
    // Chain links travel through the winch as the doors close.
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const dir = new THREE.Vector3().subVectors(this.chainTop, this.chainBottom);
    const len = dir.length();
    dir.normalize();
    const travel = close * 34 + Math.sin(S.time * 1.4) * 0.5 * closing;
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const spin = new THREE.Quaternion();
    for (let i = 0; i < this.chainLinks; i++) {
      const s = ((i * 1.25 + travel) % (this.chainLinks * 1.25)) / (this.chainLinks * 1.25);
      v.copy(this.chainBottom).addScaledVector(dir, s * len);
      spin.setFromAxisAngle(dir, i % 2 ? Math.PI / 2 : 0);
      m.compose(v, spin.clone().multiply(q), new THREE.Vector3(1, 1, 1));
      this.chain.setMatrixAt(i, m);
    }
    this.chain.instanceMatrix.needsUpdate = true;
    this.winch.rotation.x = -travel * 0.6;

    // Halls: lamplit by day, a furnace by night.
    const furnace = ss(2.9, 3.6, t);
    this.hallMat.uniforms.uLamps.value = 1 - ss(2.5, 2.9, t);
    this.hallMat.uniforms.uFurnace.value = furnace * (0.9 + 0.6 * ss(3.4, 4, t));
    this.lampMat.color.setRGB(1, 0.6, 0.28).multiplyScalar(5 * (1 - ss(2.5, 2.9, t)) + 0.01);
    const flick = 0.8 + 0.2 * Math.sin(S.time * 7.1) * Math.sin(S.time * 3.3 + 1);
    this.light.intensity = (furnace * 2600 + band(t, 2.6, 2.9, 3.2, 3.6) * 1400) * flick;
  }
}
