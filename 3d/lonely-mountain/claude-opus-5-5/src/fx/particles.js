// GPU billboards. Each particle's position, size and colour are computed in the
// vertex shader from its origin, a few random seeds, the hour and the clock, so
// tens of thousands of flames, sparks, smoke puffs and ash flakes cost almost
// nothing on the CPU and land in the same place whenever the slider returns.
import * as THREE from 'three';
import { shaderMaterial } from '../core/shaderlib.js';

const VERT = (body) => /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aSeed;
attribute vec4 aParam;
uniform vec3 uLightCol;
uniform float uFade;
varying vec2 vUv;
varying vec4 vCol;
varying float vSoft;
#include <fog_pars_vertex>
float fireLife(float ign) {
  // Rises as the spot catches, roars, then settles to a low burn by night.
  return smoothstep(ign, ign + 0.07, uT) * (1.0 - 0.95 * smoothstep(ign + 0.3, ign + 0.72, uT));
}
float surge(vec3 o) {
  // Waves of flare-ups roll down through the town from the Gate.
  return 1.0 + 0.7 * pow(0.5 + 0.5 * sin(o.z * 0.018 - uTime * 0.9 + o.x * 0.004), 6.0);
}
void main() {
  vec3 P = aOrigin;
  vec2 size = vec2(1.0);
  vec4 col = vec4(1.0);
  float lift = 0.0; // anchor the quad's base at P instead of its centre
  vSoft = 0.0;
  ${body}
  vec4 mv = viewMatrix * vec4(P, 1.0);
  mv.xy += (position.xy + vec2(0.0, lift)) * size;
  gl_Position = projectionMatrix * mv;
  col.a *= uFade;
  if (col.a < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vUv = uv;
  vCol = col;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;

const FRAG = (body) => /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vSoft;
#include <fog_pars_fragment>
void main() {
  vec2 q = vUv - 0.5;
  float a = 1.0;
  vec3 c = vCol.rgb;
  ${body}
  gl_FragColor = vec4(c, a * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef ADDITIVE
    #ifdef USE_FOG
    gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.6);
    #endif
  #else
    #include <fog_fragment>
  #endif
}`;

const DISC = 'a = smoothstep(0.5, 0.15, length(q));';
const PUFF = 'a = smoothstep(0.5, 0.0, length(q)) * (0.55 + 0.45 * lmNoise(vUv * 5.0 + vSoft * 13.0)); a *= a * 1.6;';
const FLAME = /* glsl */ `
  float y = vUv.y;
  float w = (1.0 - y) * 0.42 + 0.06;
  float n = lmNoise(vec2(vUv.x * 5.0 + vSoft * 7.0, y * 3.0 - uTime * 3.5));
  float body = smoothstep(w, w * 0.25, abs(q.x + (n - 0.5) * 0.25 * y));
  a = body * smoothstep(1.0, 0.55, y + n * 0.25) * smoothstep(0.0, 0.12, y);
  c *= mix(1.6, 0.7, y);
`;

export const KINDS = {
  // Kitchen smoke from a hundred chimneys, drifting with the noon breeze.
  kitchen: {
    blending: THREE.NormalBlending,
    frag: PUFF,
    body: /* glsl */ `
      float age = fract(uTime / 16.0 + aSeed.x);
      vec3 wind = vec3(uWind.x, 0.0, uWind.y) * (2.0 + uWind.z * 30.0);
      P += vec3(0.0, age * 22.0, 0.0) + wind * age * age * 6.0 + vec3(sin(age * 6.0 + aSeed.y * 9.0), 0.0, cos(age * 5.0 + aSeed.z * 9.0)) * age * 2.5;
      float life = 1.0 - smoothstep(1.3, 1.9, uT);
      size = vec2(0.8 + age * 7.0);
      col = vec4(mix(vec3(0.82), uLightCol, 0.5), smoothstep(0.0, 0.08, age) * (1.0 - age) * 0.34 * life);
      vSoft = aSeed.w;
    `,
  },
  // Sparks from the smiths' anvils, in time with the hammer strokes.
  smithy: {
    blending: THREE.AdditiveBlending,
    frag: DISC,
    body: /* glsl */ `
      float beat = fract(uTime * 1.25 + aParam.x);
      float age = beat / 0.35;
      vec3 dir = normalize(vec3(aSeed.x - 0.5, 0.6 + aSeed.y, aSeed.z - 0.5));
      P += dir * age * 2.2 + vec3(0.0, -age * age * 1.5, 0.0);
      size = vec2(0.07);
      float life = 1.0 - smoothstep(1.5, 1.9, uT);
      col = vec4(vec3(1.0, 0.6, 0.2) * 6.0, step(age, 1.0) * (1.0 - age) * life);
    `,
  },
  // Pale dust and chaff on the hot north wind.
  dust: {
    blending: THREE.NormalBlending,
    frag: PUFF,
    body: /* glsl */ `
      vec3 range = vec3(520.0, 140.0, 520.0);
      vec3 drift = vec3(uWind.x, 0.0, uWind.y) * uTime * (6.0 + 24.0 * uWind.z);
      vec3 p = aSeed.xyz * range + drift + vec3(0.0, sin(uTime * 0.7 + aSeed.w * 30.0) * 3.0, 0.0);
      P = uCam + mod(p - uCam, range) - range * 0.5;
      P.y = max(P.y, uCam.y - 60.0);
      float d = length(P - uCam);
      size = vec2(1.2 + aSeed.w * 2.0, 0.3 + aSeed.w * 0.4);
      float amt = smoothstep(0.55, 0.95, uT) * (1.0 - smoothstep(1.9, 2.5, uT));
      col = vec4(vec3(0.82, 0.68, 0.5), 0.12 * amt * smoothstep(8.0, 30.0, d));
      vSoft = aSeed.w;
    `,
  },
  // Flames over roofs, pines, stalls and the stone channel.
  flame: {
    blending: THREE.AdditiveBlending,
    frag: FLAME,
    body: /* glsl */ `
      float I = fireLife(aParam.x);
      if (I > 0.001) {
        float age = fract(uTime * (0.7 + aSeed.y * 0.6) + aSeed.x);
        float s = aParam.y * (0.6 + 0.6 * aSeed.z) * surge(aOrigin);
        vec3 lean = vec3(uWind.x, 0.0, uWind.y) * (0.3 + uWind.z) * age * s * 0.6;
        P += vec3((aSeed.w - 0.5) * s * 0.8, age * s * 0.9, (aSeed.y - 0.5) * s * 0.8) + lean;
        size = vec2(0.55, 1.25) * s * (1.0 - age * 0.55) * (0.5 + 0.5 * I);
        lift = 0.45;
        col = vec4(mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.24, 0.04), age) * 3.2, I * (1.0 - age) * 0.9);
        vSoft = aSeed.w;
      } else col.a = 0.0;
    `,
  },
  // Columns of sparks rising slowly over the fires.
  sparks: {
    blending: THREE.AdditiveBlending,
    frag: DISC,
    body: /* glsl */ `
      float I = fireLife(aParam.x) * (1.0 - 0.7 * smoothstep(3.4, 4.0, uT));
      float age = fract(uTime / (7.0 + aSeed.y * 6.0) + aSeed.x);
      float ang = aSeed.z * 6.28 + age * 9.0;
      P += vec3(cos(ang) * age * 12.0, age * (90.0 + aSeed.w * 120.0), sin(ang) * age * 12.0) + vec3(uWind.x, 0.0, uWind.y) * age * age * 70.0;
      float d = length(P - uCam);
      size = vec2(max(0.3, d * 0.0016));
      float tw = 0.6 + 0.4 * sin(uTime * 13.0 + aSeed.w * 50.0);
      col = vec4(mix(vec3(1.0, 0.75, 0.3), vec3(1.0, 0.25, 0.05), age) * 5.0 * tw, I * (1.0 - age) * smoothstep(0.0, 0.05, age));
    `,
  },
  // Smoke columns: lit orange from beneath, black where they climb into the dark.
  smoke: {
    blending: THREE.NormalBlending,
    frag: PUFF,
    body: /* glsl */ `
      float I = smoothstep(aParam.x, aParam.x + 0.12, uT) * (1.0 - 0.55 * smoothstep(aParam.x + 0.6, aParam.x + 1.3, uT));
      float age = fract(uTime / (34.0 + aSeed.y * 14.0) + aSeed.x);
      vec3 wind = vec3(uWind.x, 0.0, uWind.y);
      P += vec3((aSeed.z - 0.5) * 10.0, age * (260.0 + aParam.y * 140.0), (aSeed.w - 0.5) * 10.0) + wind * age * age * 260.0;
      size = vec2(10.0 + age * 85.0) * (0.7 + aParam.y * 0.5);
      vec3 lit = vec3(1.0, 0.4, 0.12) * (0.25 + 0.75 * fireLife(aParam.x)) * 0.9 * (1.0 - smoothstep(0.0, 0.3, age));
      vec3 dark = mix(vec3(0.07, 0.06, 0.055), uLightCol * 0.45, 0.4);
      col = vec4(mix(lit, dark, smoothstep(0.02, 0.4, age)), I * smoothstep(0.0, 0.06, age) * (1.0 - age) * 0.62);
      vSoft = aSeed.w;
    `,
  },
  // Ash falling like snow.
  ash: {
    blending: THREE.NormalBlending,
    frag: DISC,
    body: /* glsl */ `
      vec3 range = vec3(320.0, 160.0, 320.0);
      vec3 drift = vec3(uWind.x * 3.0 + sin(uTime * 0.3 + aSeed.w * 20.0) * 1.5, -2.2 - aSeed.w * 1.4, uWind.y * 3.0) * uTime;
      vec3 p = aSeed.xyz * range + drift;
      P = uCam + mod(p - uCam + range * 0.5, range) - range * 0.5;
      P.x += sin(uTime * 1.3 + aSeed.y * 40.0) * 0.6;
      float d = length(P - uCam);
      size = vec2(max(0.18 + aSeed.w * 0.2, d * 0.0018));
      col = vec4(vec3(0.07, 0.065, 0.06) + uFireGlow * 0.12 + uLightCol * 0.25, smoothstep(3.1, 3.9, uT) * 0.85 * smoothstep(1.0, 6.0, d) * (1.0 - smoothstep(70.0, 160.0, d)));
    `,
  },
  // Ember beds: the ground of Dale glowing and fading by night.
  embers: {
    blending: THREE.AdditiveBlending,
    frag: DISC,
    body: /* glsl */ `
      float I = smoothstep(aParam.x + 0.15, aParam.x + 0.5, uT);
      float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed.y) + aSeed.x * 30.0), 3.0);
      P.y += 0.3;
      size = vec2(0.9 + aSeed.z * 2.0) * (0.6 + 0.4 * pulse);
      col = vec4(vec3(1.0, 0.28, 0.05) * 3.0 * pulse, I * 0.9);
    `,
  },
  // Spray rising from the falls.
  mist: {
    blending: THREE.NormalBlending,
    frag: PUFF,
    body: /* glsl */ `
      float age = fract(uTime / 6.0 + aSeed.x);
      P += vec3((aSeed.y - 0.5) * 6.0, age * 9.0, age * 10.0 + aSeed.z * 4.0);
      size = vec2(2.0 + age * 7.0);
      col = vec4(mix(vec3(0.85, 0.88, 0.9), uLightCol, 0.5), (1.0 - age) * smoothstep(0.0, 0.15, age) * 0.2);
      vSoft = aSeed.w;
    `,
  },
  // Billboards whose positions the CPU writes every frame (dragon fire, lanterns).
  live: {
    blending: THREE.AdditiveBlending,
    frag: 'a = smoothstep(0.5, 0.0, length(q)); a = a * a;',
    body: /* glsl */ `
      size = vec2(aParam.x);
      float heat = aParam.y;
      col = vec4(mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.85, 0.5), heat) * (1.5 + 4.0 * heat), aParam.z);
    `,
  },
};

/** A billboard system. `sources` is an array of { origin: [x,y,z], seed?: [4], param?: [4] }. */
export class Billboards {
  constructor(kind, count, fill) {
    const K = KINDS[kind];
    this.kind = kind;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const origin = new Float32Array(count * 3), seed = new Float32Array(count * 4), param = new Float32Array(count * 4);
    if (fill) for (let i = 0; i < count; i++) fill(i, origin, seed, param);
    this.origin = new THREE.InstancedBufferAttribute(origin, 3);
    this.seed = new THREE.InstancedBufferAttribute(seed, 4);
    this.param = new THREE.InstancedBufferAttribute(param, 4);
    g.setAttribute('aOrigin', this.origin);
    g.setAttribute('aSeed', this.seed);
    g.setAttribute('aParam', this.param);
    g.instanceCount = count;
    this.capacity = count;
    this.material = shaderMaterial({
      uniforms: { uLightCol: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 1 } },
      vertexShader: VERT(K.body),
      fragmentShader: FRAG(K.frag),
      transparent: true,
      depthWrite: false,
      blending: K.blending,
      defines: K.blending === THREE.AdditiveBlending ? { ADDITIVE: 1 } : {},
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = K.blending === THREE.AdditiveBlending ? 3 : 2;
    this.mesh.name = `fx-${kind}`;
  }

  /** Scales the number of live particles (density slider, quality). */
  setFraction(f) {
    this.mesh.geometry.instanceCount = Math.max(0, Math.floor(this.capacity * Math.min(1, f)));
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
