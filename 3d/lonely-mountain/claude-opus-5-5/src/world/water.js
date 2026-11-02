// The River Running from the Gate through Dale, over its falls and away to the
// Long Lake. One shader: sky reflection, sun glints, foam on the falls and, after
// dusk, gold firelight thrown back from every ripple.
import * as THREE from 'three';
import { FALLS_Z, LAKE, RIVER_RANGE, riverAt } from '../core/layout.js';
import { shaderMaterial } from '../core/shaderlib.js';

const VERT = /* glsl */ `
attribute float aSlope;
attribute float aFlow;
varying vec3 vWP;
varying float vSlope;
varying float vFlow;
#include <fog_pars_vertex>
void main() {
  vSlope = aSlope;
  vFlow = aFlow;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor;
uniform float uSunI;
varying vec3 vWP;
varying float vSlope;
varying float vFlow;
#include <fog_pars_fragment>
float h(vec2 p) { return lmNoise(p) * 0.6 + lmNoise(p * 2.3 + 7.1) * 0.3 + lmNoise(p * 5.1 - 3.3) * 0.1; }
void main() {
  float speed = (1.6 + vSlope * 14.0) * vFlow;
  vec2 p = vWP.xz * vec2(0.22, 0.09) - vec2(0.0, uTime * speed * 0.09);
  vec2 q = vWP.xz * vec2(0.11, 0.05) + vec2(0.3, -uTime * speed * 0.05);
  float e = 0.05;
  float dx = (h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) + 0.6 * (h(q + vec2(e, 0.0)) - h(q - vec2(e, 0.0)));
  float dz = (h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) + 0.6 * (h(q + vec2(0.0, e)) - h(q - vec2(0.0, e)));
  vec3 n = normalize(vec3(-dx * 3.5, 1.0, -dz * 3.5));
  vec3 v = normalize(cameraPosition - vWP);
  float fres = 0.03 + 0.62 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.5)) * 0.8;
  // Low reflections catch the banks and walls, not the sky.
  vec3 banks = mix(vec3(0.07, 0.075, 0.06), uHorizon * 0.25, 0.4) * (0.4 + 0.6 * uSunI);
  sky = mix(banks, sky, smoothstep(0.03, 0.3, r.y));
  vec3 body = vec3(0.03, 0.075, 0.07) * (0.6 + 0.6 * uSunI) + vec3(0.02, 0.03, 0.025);
  vec3 col = mix(body, sky, fres);
  col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 220.0) * 6.0 * uSunI;
  // Firelight glints: black water broken by gold.
  float glint = pow(h(p * 1.7 + 3.0), 6.0) * 3.2 + 0.12;
  col += uFireGlow * glint * (0.35 + 0.65 * fres) * 0.7;
  // Foam where the river falls.
  float foam = smoothstep(0.15, 0.6, vSlope) * (0.6 + 0.6 * lmNoise(vec2(vWP.x * 0.6, vWP.y * 0.25 + uTime * 6.0)));
  col = mix(col, vec3(0.8, 0.82, 0.8) * (0.08 + 0.72 * uSunI) + uFireGlow * 0.3, clamp(foam, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene) {
    this.material = shaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uSunI: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });

    // River ribbon, sampled densely through Dale and over the falls.
    const pos = [], slope = [], flow = [], index = [];
    let z = RIVER_RANGE[0] + 1;
    let row = 0;
    let prevY = riverAt(z).y;
    while (z < RIVER_RANGE[1]) {
      const r = riverAt(z);
      const w = r.w + 2.2;
      const s = Math.min(1, Math.abs(prevY - r.y) / 1.2);
      prevY = r.y;
      pos.push(r.x - w, r.y, z, r.x + w, r.y, z);
      slope.push(s, s);
      flow.push(1, 1);
      if (row > 0) {
        const a = (row - 1) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      row++;
      const step = z > FALLS_Z - 14 && z < FALLS_Z + 14 ? 0.8 : z < 300 ? 3 : z < 1500 ? 8 : 30;
      z += step;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    g.setIndex(index);
    this.river = new THREE.Mesh(g, this.material);
    this.river.name = 'river';
    this.river.receiveShadow = false;
    scene.add(this.river);

    // The Long Lake, far to the south.
    const lake = new THREE.CircleGeometry(1, 96);
    lake.rotateX(-Math.PI / 2);
    lake.scale(LAKE.rx * 1.25, 1, LAKE.rz * 1.25);
    lake.translate(LAKE.x, LAKE.y + 0.4, LAKE.z);
    const n = lake.attributes.position.count;
    lake.setAttribute('aSlope', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    lake.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.12), 1));
    this.lake = new THREE.Mesh(lake, this.material);
    this.lake.name = 'long-lake';
    scene.add(this.lake);
  }

  update(L) {
    const u = this.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uSunDir.value.copy(L.sunDir);
    u.uSunColor.value.copy(L.sunColor);
    u.uSunI.value = Math.min(1, L.sun / 3) * Math.max(0, Math.min(1, L.sunDir.y * 10));
  }
}
