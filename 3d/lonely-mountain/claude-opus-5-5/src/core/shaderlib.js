// Shared uniforms and a small helper to extend three's standard materials with
// hour-driven behaviour: burning, embers, ash, wind and the dragon's wing shadow.
import * as THREE from 'three';
import { GLSL_NOISE } from './noise.js';

/** Uniforms shared by reference across every custom material: update once per frame. */
export const U = {
  uT: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(0, 1, 0.2) }, // x, z direction and strength
  uFireGlow: { value: new THREE.Color(0, 0, 0) },
  uAsh: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uDsOn: { value: 0 },
  uDsSun: { value: new THREE.Vector3(0, 1, 0) },
  uDsTri: { value: Array.from({ length: 12 }, () => new THREE.Vector3()) },
  uDsSeg: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
  uDsRad: { value: new THREE.Vector3(1, 1, 1) },
};

const COMMON = /* glsl */ `
uniform float uT;
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uFireGlow;
uniform float uAsh;
uniform vec3 uCam;
${GLSL_NOISE}
float lmBurn(float ign) { return smoothstep(ign, ign + 0.16, uT); }
// Glow of a burning surface: flares as it catches, settles to embers by night.
float lmEmber(float ign) { return smoothstep(ign + 0.01, ign + 0.12, uT) * (1.0 - 0.72 * smoothstep(ign + 0.35, ign + 1.1, uT)); }
vec3 lmFireColor(float k) { return mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.18), k); }
`;

const FRAG_ONLY = /* glsl */ `
// Bump from a scalar height field, after three's perturbNormalArb.
vec3 lmBump(vec3 surfPos, vec3 surfNorm, float h, float strength) {
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * strength;
  vec3 vSigmaX = normalize(dFdx(surfPos));
  vec3 vSigmaY = normalize(dFdy(surfPos));
  vec3 vN = surfNorm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}
`;

const DRAGON_SHADE = /* glsl */ `
uniform float uDsOn;
uniform vec3 uDsSun;
uniform vec3 uDsTri[12];
uniform vec3 uDsSeg[6];
uniform vec3 uDsRad;
float lmTri(vec3 p, vec3 d, vec3 a, vec3 b, vec3 c) {
  vec3 e1 = b - a, e2 = c - a;
  vec3 h = cross(d, e2);
  float det = dot(e1, h);
  if (abs(det) < 1e-4) return 0.0;
  float f = 1.0 / det;
  vec3 s = p - a;
  float u = f * dot(s, h);
  vec3 q = cross(s, e1);
  float v = f * dot(d, q);
  float t = f * dot(e2, q);
  if (t < 0.0) return 0.0;
  float edge = min(min(u, v), 1.0 - u - v);
  return smoothstep(-0.015, 0.05, edge);
}
float lmSeg(vec3 p, vec3 d, vec3 a, vec3 b, float r) {
  // Closest approach between the sun ray from p and the segment a-b.
  vec3 ba = b - a, pa = p - a;
  float bd = dot(ba, d), bb = dot(ba, ba), pd = dot(pa, d), pb = dot(pa, ba);
  float den = bb - bd * bd;
  float s = clamp((pb - pd * bd) / max(den, 1e-3), 0.0, 1.0);
  float t = dot(a + ba * s - p, d);
  if (t < 0.0) return 0.0;
  float dist = length(p + d * t - a - ba * s);
  return 1.0 - smoothstep(r * 0.6, r * 1.4, dist);
}
float lmDragonShade(vec3 p) {
  if (uDsOn < 0.01) return 1.0;
  float occ = 0.0;
  for (int i = 0; i < 4; i++) occ = max(occ, lmTri(p, uDsSun, uDsTri[i * 3], uDsTri[i * 3 + 1], uDsTri[i * 3 + 2]));
  occ = max(occ, lmSeg(p, uDsSun, uDsSeg[0], uDsSeg[1], uDsRad.x));
  occ = max(occ, lmSeg(p, uDsSun, uDsSeg[2], uDsSeg[3], uDsRad.y));
  occ = max(occ, lmSeg(p, uDsSun, uDsSeg[4], uDsSeg[5], uDsRad.z));
  return 1.0 - 0.88 * occ * uDsOn;
}
`;

const LIGHTS_WITH_SHADE = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= lmShade;',
);

/**
 * Extends a built-in material. Options are GLSL snippets:
 *  vertexHead / fragmentHead: declarations;
 *  vertex: runs after begin_vertex (edit `transformed`, `objectNormal` is already set);
 *  normal: runs after beginnormal_vertex;
 *  color: runs after color_fragment (edit `diffuseColor`);
 *  emissive: runs after emissivemap_fragment (edit `totalEmissiveRadiance`);
 *  roughness: runs after roughnessmap_fragment;
 *  shade: true to receive the dragon's wing shadow.
 * `vWorldPos` and `vInst` (instance-local position, or object position) are available to fragments.
 */
export function patch(material, opts) {
  // Programs are cached by this key, so it must change whenever the injected code does.
  const src = JSON.stringify(opts, (k, v) => (k === 'uniforms' ? undefined : v));
  let hash = 0;
  for (let i = 0; i < src.length; i++) hash = (Math.imul(hash, 31) + src.charCodeAt(i)) | 0;
  const key = `${opts.key || 'lm'}-${hash}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, opts.uniforms || {});
    shader.vertexShader =
      `${COMMON}\nvarying vec3 vWorldPos;\nvarying vec3 vObj;\n${opts.vertexHead || ''}\n` +
      shader.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${opts.normal || ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvObj = transformed;\n${opts.vertex || ''}`)
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            vec4 lmWp = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            lmWp = instanceMatrix * lmWp;
            #endif
            vWorldPos = (modelMatrix * lmWp).xyz;
          }
          ${opts.vertexEnd || ''}`,
        );
    shader.fragmentShader =
      `${COMMON}\n${FRAG_ONLY}\n${opts.shade ? DRAGON_SHADE : ''}\nvarying vec3 vWorldPos;\nvarying vec3 vObj;\n${opts.fragmentHead || ''}\n` +
      shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\n${opts.color || ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${opts.roughness || ''}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${opts.normal2 || ''}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opts.emissive || ''}`)
        .replace(
          '#include <lights_fragment_begin>',
          opts.shade ? `float lmShade = lmDragonShade(vWorldPos);\n${LIGHTS_WITH_SHADE}` : '#include <lights_fragment_begin>',
        );
  };
  return material;
}

/** Raw shader material that shares the common uniforms and noise. */
export function shaderMaterial({ uniforms = {}, vertexShader, fragmentShader, ...rest }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U, ...uniforms },
    vertexShader: `${COMMON}\n${vertexShader}`,
    fragmentShader: `${COMMON}\n${fragmentShader}`,
    fog: true,
    ...rest,
  });
}
