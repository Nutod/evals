// Instanced people and ponies. One merged mesh per LOD; every vertex knows which
// limb it belongs to, and the vertex shader swings legs and arms about their hips
// and shoulders for walking, running, hammering, pointing, haggling, hauling a
// chain, sitting at a harp or looking back down the road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch } from '../core/shaderlib.js';

export const ANIM = { idle: 0, walk: 1, run: 2, hammer: 3, point: 4, haggle: 5, overhead: 6, pull: 7, sit: 8, jump: 9, front: 10 };
export const CARRY = { none: 0, chest: 1, sack: 2, lantern: 3, cradle: 4 };

// part: 0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm, 5 head, 6 item, 7 beard, 8 hood
// tint: 0 clothes, 1 skin, 2 hair, 3 dark, 4 item, 5 lantern flame
function piece(g, part, tint, x, y, z) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(new Float32Array(n).fill(tint), 1));
  return g;
}

function personGeometry(detail) {
  const seg = detail ? 7 : 4;
  const parts = [];
  // Legs (pivot at hip y = 0.5), boots.
  for (const [p, x] of [[1, -0.075], [2, 0.075]]) {
    parts.push(piece(new THREE.CylinderGeometry(0.058, 0.05, 0.44, seg), p, 0, x, 0.29, 0));
    parts.push(piece(new THREE.BoxGeometry(0.1, 0.07, 0.17), p, 3, x, 0.035, 0.025));
  }
  // Torso and tunic skirt.
  parts.push(piece(new THREE.CylinderGeometry(0.15, 0.19, 0.36, seg), 0, 0, 0, 0.68, 0));
  parts.push(piece(new THREE.CylinderGeometry(0.19, 0.22, 0.14, seg), 0, 0, 0, 0.47, 0));
  parts.push(piece(new THREE.CylinderGeometry(0.195, 0.195, 0.04, seg), 0, 3, 0, 0.53, 0));
  // Arms (pivot at shoulder y = 0.82), hands.
  for (const [p, x] of [[3, -0.205], [4, 0.205]]) {
    parts.push(piece(new THREE.CylinderGeometry(0.045, 0.04, 0.36, seg), p, 0, x, 0.65, 0));
    parts.push(piece(new THREE.SphereGeometry(0.04, seg, 4), p, 1, x, 0.46, 0));
  }
  // Head, hair.
  parts.push(piece(new THREE.SphereGeometry(0.1, detail ? 10 : 5, detail ? 8 : 4), 5, 1, 0, 0.94, 0));
  parts.push(piece(new THREE.SphereGeometry(0.104, detail ? 10 : 5, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), 5, 2, 0, 0.955, -0.008));
  // Beard (dwarves) and pointed hood (dwarves) / crown (the king).
  parts.push(piece(new THREE.ConeGeometry(0.085, 0.3, seg).rotateX(Math.PI), 7, 2, 0, 0.78, 0.075));
  parts.push(piece(new THREE.ConeGeometry(0.115, 0.24, seg), 8, 0, 0, 1.1, -0.01));
  // Carried item (placed by the shader per carry type).
  parts.push(piece(new THREE.BoxGeometry(0.34, 0.22, 0.24), 6, 4, 0, 0, 0));
  return mergeGeometries(parts);
}

function ponyGeometry(detail) {
  const seg = detail ? 7 : 4;
  const parts = [];
  // Unit: pony 1.3 m at the withers, facing +z. Legs pivot at the body.
  parts.push(piece(new THREE.CylinderGeometry(0.24, 0.24, 1.0, seg).rotateX(Math.PI / 2), 0, 0, 0, 0.92, 0));
  parts.push(piece(new THREE.CylinderGeometry(0.1, 0.15, 0.55, seg).rotateX(-0.7), 5, 0, 0, 1.18, 0.5));
  parts.push(piece(new THREE.BoxGeometry(0.15, 0.17, 0.38), 5, 0, 0, 1.36, 0.78));
  parts.push(piece(new THREE.BoxGeometry(0.05, 0.3, 0.42), 5, 2, 0, 1.3, 0.48));
  parts.push(piece(new THREE.CylinderGeometry(0.05, 0.02, 0.5, 4).rotateX(0.5), 0, 2, 0, 0.8, -0.6));
  for (const [p, x, z] of [[1, -0.13, 0.36], [2, 0.13, 0.36], [3, -0.13, -0.36], [4, 0.13, -0.36]]) {
    parts.push(piece(new THREE.CylinderGeometry(0.05, 0.04, 0.72, seg), p, 0, x, 0.38, z));
    parts.push(piece(new THREE.BoxGeometry(0.08, 0.06, 0.1), p, 3, x, 0.03, z));
  }
  // Pack saddle with bundles.
  parts.push(piece(new THREE.BoxGeometry(0.62, 0.32, 0.5), 6, 4, 0, 1.16, -0.05));
  return mergeGeometries(parts);
}

const FIGURE_GLSL = {
  vertexHead: /* glsl */ `
    attribute float aPart;
    attribute float aTint;
    attribute vec4 aAnim;  // type, phase, speed, carry
    attribute vec4 aLook;  // dwarf, head turn, hair shade, king
    varying float vTint;
    varying vec4 vAnimV;
    varying vec4 vLookV;
    mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
    mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
    mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  `,
  person: /* glsl */ `
    vTint = aTint; vAnimV = aAnim; vLookV = aLook;
    float type = aAnim.x;
    float ph = uTime * aAnim.z + aAnim.y;
    float legA = 0.0, legB = 0.0, armL = 0.0, armR = 0.0, lean = 0.0, armSpread = 0.0, headTurn = aLook.y;
    if (type == 1.0) { legA = sin(ph) * 0.5; legB = -legA; armL = -legA * 0.7; armR = legA * 0.7; }
    else if (type == 2.0) { legA = sin(ph) * 0.95; legB = -legA; armL = -legA * 1.1 - 0.4; armR = legA * 1.1 - 0.4; lean = 0.3; }
    else if (type == 3.0) { float beat = fract(uTime * 1.25 + aAnim.y); armR = -0.3 - 2.3 * smoothstep(0.08, 0.55, beat) * (1.0 - smoothstep(0.86, 1.0, beat)); armL = -0.6; lean = 0.08; }
    else if (type == 4.0) { armR = -2.55 + sin(ph * 0.5) * 0.06; armL = 0.05; headTurn += 0.0; lean = -0.06; }
    else if (type == 5.0) { armL = -0.7 - 0.5 * sin(ph * 1.3); armR = -0.9 - 0.6 * sin(ph * 1.7 + 1.0); armSpread = 0.25 + 0.2 * sin(ph); }
    else if (type == 6.0) { legA = sin(ph) * 0.45; legB = -legA; armL = -2.85; armR = -2.85; }
    else if (type == 7.0) { float p = sin(ph); armL = -2.3 + p * 0.55; armR = -2.3 + p * 0.55; lean = -0.15 - 0.12 * p; legA = 0.25; legB = -0.2; }
    else if (type == 8.0) { legA = -1.5; legB = -1.5; armL = -0.9 + sin(ph * 2.0) * 0.12; armR = -1.0 + sin(ph * 2.0 + 1.7) * 0.2; }
    else if (type == 9.0) { armL = -2.6 + sin(ph) * 0.3; armR = -2.6 - sin(ph) * 0.3; }
    else if (type == 10.0) { legA = sin(ph) * 0.6; legB = -legA; armL = -1.15; armR = -1.15; lean = 0.12; }
    else { armL = sin(ph * 0.3) * 0.05; armR = -armL; }
    float part = aPart;
    vec3 p = transformed;
    vec3 n = objectNormal;
    // Items, beard and hood only where they belong.
    if (part == 6.0) {
      float carry = aAnim.w;
      if (carry < 0.5) { p *= 0.0; }
      else if (carry < 1.5) { p = p * vec3(1.1, 1.1, 1.1) + (type == 10.0 ? vec3(0.0, 0.62, 0.26) : vec3(0.0, 1.17, 0.0)); }
      else if (carry < 2.5) { p = p * vec3(1.1, 1.6, 1.0) + vec3(0.0, 0.78, -0.2); }
      else if (carry < 3.5) { p = p * vec3(0.32, 0.55, 0.42) + vec3(0.205, 0.38, 0.08); }
      else { p = p * vec3(1.6, 0.9, 1.1) + vec3(0.0, 0.62, 0.3); }
    }
    if (part == 7.0 && aLook.x < 0.5) p *= 0.0;
    if (part == 8.0 && aLook.x < 0.5 && aLook.w < 0.5) p *= 0.0;
    if (part == 8.0 && aLook.w > 0.5) p = (p - vec3(0.0, 1.1, 0.0)) * vec3(1.05, 0.45, 1.05) + vec3(0.0, 1.06, 0.0);
    // Limbs.
    if (part == 1.0 || part == 2.0) {
      float a = part == 1.0 ? legA : legB;
      vec3 piv = vec3(0.0, 0.5, 0.0);
      p = rotX(a) * (p - piv) + piv; n = rotX(a) * n;
    } else if (part == 3.0 || part == 4.0 || (part == 6.0 && (aAnim.w > 2.5 && aAnim.w < 3.5))) {
      float a = (part == 3.0) ? armL : armR;
      vec3 piv = vec3(part == 3.0 ? -0.2 : 0.2, 0.82, 0.0);
      mat3 r = rotX(a) * rotZ((part == 3.0 ? -1.0 : 1.0) * armSpread);
      p = r * (p - piv) + piv; n = r * n;
    }
    if (part == 5.0 || part == 7.0 || part == 8.0) { vec3 piv = vec3(0.0, 0.84, 0.0); p = rotY(headTurn) * (p - piv) + piv; n = rotY(headTurn) * n; }
    // Lean from the hips.
    if (part != 1.0 && part != 2.0) { vec3 piv = vec3(0.0, 0.5, 0.0); p = rotX(lean) * (p - piv) + piv; n = rotX(lean) * n; }
    transformed = p;
  `,
  pony: /* glsl */ `
    vTint = aTint; vAnimV = aAnim; vLookV = aLook;
    float ph = uTime * aAnim.z + aAnim.y;
    float type = aAnim.x;
    vec3 p = transformed;
    vec3 n = objectNormal;
    float amp = type == 2.0 ? 0.7 : type == 1.0 ? 0.42 : 0.0;
    if (aPart >= 1.0 && aPart <= 4.0) {
      float s = (aPart == 1.0 || aPart == 4.0) ? 1.0 : -1.0;
      float a = sin(ph) * amp * s;
      vec3 piv = vec3(p.x, 0.74, aPart < 2.5 ? 0.36 : -0.36);
      p = rotX(a) * (p - piv) + piv; n = rotX(a) * n;
    }
    if (aPart == 5.0) {
      // Head bob when walking; tossing and pulling at the tether in the hot wind.
      float toss = aLook.y * (0.35 * sin(uTime * 4.0 + aAnim.y * 3.0) + 0.25);
      float a = sin(ph * 2.0) * 0.06 * amp - toss;
      vec3 piv = vec3(0.0, 1.0, 0.45);
      p = rotX(a) * (p - piv) + piv; n = rotX(a) * n;
    }
    if (aPart == 6.0 && aAnim.w < 0.5) p *= 0.0;
    transformed = p;
  `,
  fragmentHead: 'varying float vTint; varying vec4 vAnimV; varying vec4 vLookV;',
  color: /* glsl */ `
    {
      vec3 c = diffuseColor.rgb;
      float shade = vLookV.z;
      if (vTint == 1.0) c = mix(vec3(0.86, 0.66, 0.52), vec3(0.55, 0.38, 0.28), shade);
      else if (vTint == 2.0) c = vLookV.w > 0.5 ? vec3(0.95, 0.72, 0.3) : mix(mix(vec3(0.42, 0.26, 0.14), vec3(0.18, 0.12, 0.08), shade), vec3(0.75, 0.72, 0.68), step(0.82, shade));
      else if (vTint == 3.0) c = vec3(0.12, 0.09, 0.07);
      else if (vTint == 4.0) c = vAnimV.w > 3.5 ? vec3(0.55, 0.4, 0.26) : vAnimV.w > 2.5 ? vec3(0.2, 0.17, 0.12) : vAnimV.w > 1.5 ? vec3(0.62, 0.52, 0.36) : vec3(0.42, 0.26, 0.12);
      // Figures read as silhouettes against the fire.
      c *= 1.0 - 0.5 * clamp(uFireGlow.r, 0.0, 1.0);
      diffuseColor.rgb = c;
    }
  `,
  emissive: /* glsl */ `
    if (vTint == 4.0 && vAnimV.w > 2.5 && vAnimV.w < 3.5) totalEmissiveRadiance += vec3(1.0, 0.62, 0.25) * 6.0 * (0.85 + 0.15 * sin(uTime * 9.0 + vAnimV.y * 20.0));
  `,
};

export function figureMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  return patch(m, {
    key: `figure-${kind}`,
    shade: true,
    vertexHead: FIGURE_GLSL.vertexHead,
    vertex: FIGURE_GLSL[kind],
    fragmentHead: FIGURE_GLSL.fragmentHead,
    color: FIGURE_GLSL.color,
    emissive: FIGURE_GLSL.emissive,
  });
}

/** A crowd drawn with two LODs. Call begin(), push() each visible figure, then end(). */
export class Crowd {
  constructor(scene, kind, capacity, name) {
    this.kind = kind;
    this.capacity = capacity;
    const mat = figureMaterial(kind);
    const make = (detail) => {
      const g = kind === 'pony' ? ponyGeometry(detail) : personGeometry(detail);
      const mesh = new THREE.InstancedMesh(g, mat, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const look = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aAnim', anim);
      g.setAttribute('aLook', look);
      mesh.setColorAt(0, new THREE.Color());
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = detail;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.name = `${name}-${detail ? 'near' : 'far'}`;
      scene.add(mesh);
      return { mesh, anim, look, n: 0 };
    };
    this.near = make(true);
    this.far = make(false);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.Y = new THREE.Vector3(0, 1, 0);
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.cam = new THREE.Vector3();
  }

  begin(camera) {
    this.near.n = this.far.n = 0;
    this.cam.copy(camera.position);
  }

  /** f: { x, y, z, rot, scale:[sx, sy, sz], color, anim:[4], look:[4] } */
  push(x, y, z, rot, sx, sy, color, anim, look) {
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = z - this.cam.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 2600 * 2600) return;
    const L = d2 < 180 * 180 ? this.near : this.far;
    if (L.n >= this.capacity) return;
    // Far figures are drawn a little larger so the crowd still reads as a crowd.
    const boost = L === this.far ? 1 + Math.min(1.2, Math.sqrt(d2) / 900) : 1;
    this.q.setFromAxisAngle(this.Y, rot);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx * boost, sy * boost, sx * boost));
    L.mesh.setMatrixAt(L.n, this.m);
    L.mesh.setColorAt(L.n, color);
    L.anim.array.set(anim, L.n * 4);
    L.look.array.set(look, L.n * 4);
    L.n++;
  }

  end() {
    for (const L of [this.near, this.far]) {
      L.mesh.count = L.n;
      L.mesh.instanceMatrix.needsUpdate = true;
      L.mesh.instanceColor.needsUpdate = true;
      L.anim.needsUpdate = true;
      L.look.needsUpdate = true;
    }
  }

  dispose(scene) {
    for (const L of [this.near, this.far]) {
      scene.remove(L.mesh);
      L.mesh.geometry.dispose();
      L.mesh.dispose();
    }
    this.near.mesh.material.dispose();
  }
}
