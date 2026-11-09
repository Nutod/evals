import * as THREE from 'three';

/** Uniforms shared by every patched material, driven by lighting and the clock. */
export const shared = {
  night: { value: 0 },
  time: { value: 0 },
};

const HASH_GLSL = /* glsl */ `
float cellHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

export interface FacadeOptions {
  map: THREE.Texture;
  /** R = window mask, G = roughness, B = metalness. One UV unit is one window cell. */
  mask: THREE.Texture;
  /** Share of windows lit after dusk. */
  lit?: number;
  glow?: number;
  /** Window cells per UV unit, when a tile holds several windows. */
  cells?: [number, number];
  doubleSide?: boolean;
  envMapIntensity?: number;
  color?: number;
}

/**
 * Wall material whose windows light up individually at night: each window
 * cell hashes to on/off and a colour temperature.
 */
export function facadeMaterial(o: FacadeOptions): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: o.map,
    emissiveMap: o.mask,
    roughnessMap: o.mask,
    metalnessMap: o.mask,
    emissive: 0xffffff,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
    color: o.color ?? 0xffffff,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  const lit = { value: (o.lit ?? 0.35) * 0.8 };
  const glow = { value: (o.glow ?? 1.6) * 0.55 };
  const cells = { value: new THREE.Vector2(o.cells?.[0] ?? 1, o.cells?.[1] ?? 1) };
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = shared.night;
    s.uniforms.uLit = lit;
    s.uniforms.uGlow = glow;
    s.uniforms.uCells = cells;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uLit;\nuniform float uGlow;\nuniform vec2 uCells;\n${HASH_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        {
          float winMask = texture2D(emissiveMap, vEmissiveMapUv).r;
          vec2 cell = floor(vEmissiveMapUv * uCells);
          float h = cellHash(cell);
          float on = step(1.0 - uLit, h);
          float h2 = fract(h * 43.7);
          vec3 tone = mix(vec3(1.0, 0.74, 0.42), vec3(0.78, 0.88, 1.0), step(0.82, h2));
          totalEmissiveRadiance = winMask * on * tone * (0.45 + 0.55 * fract(h * 17.3)) * uGlow * uNight;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'facade';
  return m;
}

export interface TintOptions {
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture;
  /** Second per-instance colour (attribute aColor2) for vertices with aTint = 2. */
  secondColor?: boolean;
  /** Walking animation for instanced figures: needs aLimb and the aWalk instance attribute. */
  limbs?: boolean;
  /** Canopy sway. */
  sway?: boolean;
  glowScale?: number;
  envMapIntensity?: number;
}

/**
 * Standard material for vehicles, figures and furniture built with
 * MeshBuilder extras: `aTint` picks which vertices take the instance colour
 * and `aGlow` is an emissive colour that switches on at night.
 */
export function tintMaterial(o: TintOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: o.roughness ?? 0.6,
    metalness: o.metalness ?? 0.1,
    map: o.map ?? null,
    envMapIntensity: o.envMapIntensity ?? 1,
  });
  const glowScale = { value: o.glowScale ?? 1 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = shared.night;
    s.uniforms.uTime = shared.time;
    s.uniforms.uGlowScale = glowScale;
    let head = 'attribute float aTint;\nattribute vec3 aGlow;\nvarying vec3 vGlow;\nuniform float uTime;\n';
    if (o.secondColor) head += 'attribute vec3 aColor2;\n';
    if (o.limbs) head += 'attribute vec3 aLimb;\nattribute float aWalk;\n';
    let tintExpr = 'mix(vec3(1.0), instanceColor.rgb, step(0.5, aTint) * (1.0 - step(1.5, aTint)))';
    if (o.secondColor) tintExpr += ' * mix(vec3(1.0), aColor2, step(1.5, aTint))';
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${head}`)
      // includes are still unexpanded here, so splice the patched chunk in directly
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.rgb *= instanceColor.rgb;', `vColor.rgb *= ${tintExpr};`))
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGlow = aGlow;\n${o.limbs ? LIMB_GLSL : ''}${o.sway ? SWAY_GLSL : ''}`);
    if (o.limbs) {
      s.vertexShader = s.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${LIMB_NORMAL_GLSL}`);
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;\nuniform float uNight;\nuniform float uGlowScale;\n')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uGlowScale * (0.04 + 0.96 * uNight);');
  };
  m.customProgramCacheKey = () => `tint${o.secondColor ? 2 : 1}${o.limbs ? 'L' : ''}${o.sway ? 'S' : ''}`;
  return m;
}

// aLimb = (pivot height, swing amplitude with side sign, pivot z); swing rotates about the local X axis
const LIMB_GLSL = /* glsl */ `
{
  float ang = sin(aWalk) * aLimb.y;
  float cs = cos(ang), sn = sin(ang);
  vec2 rel = vec2(transformed.z - aLimb.z, transformed.y - aLimb.x);
  float isLimb = step(0.0001, abs(aLimb.y));
  vec2 rot = vec2(rel.x * cs + rel.y * sn, -rel.x * sn + rel.y * cs);
  transformed.z = mix(transformed.z, aLimb.z + rot.x, isLimb);
  transformed.y = mix(transformed.y, aLimb.x + rot.y, isLimb);
  transformed.y += abs(sin(aWalk)) * 0.025;
}
`;
const LIMB_NORMAL_GLSL = /* glsl */ `
{
  float ang = sin(aWalk) * aLimb.y;
  float cs = cos(ang), sn = sin(ang);
  objectNormal = vec3(objectNormal.x, -objectNormal.z * sn + objectNormal.y * cs, objectNormal.z * cs + objectNormal.y * sn);
}
`;
const SWAY_GLSL = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec3 origin = instanceMatrix[3].xyz;
  #else
    vec3 origin = vec3(0.0);
  #endif
  float phase = origin.x * 0.13 + origin.z * 0.17;
  float bend = max(transformed.y, 0.0);
  transformed.x += sin(uTime * 1.1 + phase + transformed.y * 0.6) * 0.035 * bend;
  transformed.z += cos(uTime * 0.9 + phase * 1.3 + transformed.x * 0.5) * 0.03 * bend;
}
`;
