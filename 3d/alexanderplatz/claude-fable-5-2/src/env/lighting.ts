import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { shared } from '../core/materials';

export type LightingId = 'day' | 'golden' | 'blue';

interface Preset {
  /** Compass bearing of the key light, degrees clockwise from north. */
  azimuth: number;
  elevation: number;
  sun: number;
  sunIntensity: number;
  /** Where the sky draws the sun disc; below the horizon at blue hour. */
  discElevation: number;
  zenith: number;
  horizon: number;
  glow: number;
  glowStrength: number;
  ground: number;
  cloudLit: number;
  cloudShade: number;
  fog: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  envIntensity: number;
  exposure: number;
  night: number;
  stars: number;
  bloom: number;
}

export const LIGHTING: Record<LightingId, Preset> = {
  day: {
    azimuth: 152, elevation: 48, sun: 0xfff3dc, sunIntensity: 3.3, discElevation: 48,
    zenith: 0x2a69bd, horizon: 0xb4d2ec, glow: 0xfff6e0, glowStrength: 0.35, ground: 0x6f7775,
    cloudLit: 0xffffff, cloudShade: 0xaab8c8, fog: 0xbdd3e6, fogDensity: 0.00034,
    hemiSky: 0xc5dcf5, hemiGround: 0x6b665c, hemiIntensity: 0.55, envIntensity: 0.75,
    exposure: 0.92, night: 0, stars: 0, bloom: 0.12,
  },
  golden: {
    azimuth: 287, elevation: 8.5, sun: 0xffa552, sunIntensity: 3.4, discElevation: 6,
    zenith: 0x35579a, horizon: 0xf3b27c, glow: 0xff9a45, glowStrength: 1.0, ground: 0x6a5a55,
    cloudLit: 0xffc79a, cloudShade: 0x7d6f8f, fog: 0xe6b490, fogDensity: 0.00042,
    hemiSky: 0x9fb2e0, hemiGround: 0x6d5140, hemiIntensity: 0.5, envIntensity: 0.7,
    exposure: 1.0, night: 0.22, stars: 0, bloom: 0.2,
  },
  blue: {
    azimuth: 300, elevation: 32, sun: 0x7e9cff, sunIntensity: 0.42, discElevation: -7,
    zenith: 0x0a1640, horizon: 0x3d55a0, glow: 0xd8805a, glowStrength: 0.5, ground: 0x141b33,
    cloudLit: 0x1e2a58, cloudShade: 0x0c1230, fog: 0x2b3c72, fogDensity: 0.00045,
    hemiSky: 0x5068b8, hemiGround: 0x262433, hemiIntensity: 1.25, envIntensity: 0.9,
    exposure: 1.12, night: 1, stars: 1, bloom: 0.42,
  },
};

const COLOR_KEYS = ['sun', 'zenith', 'horizon', 'glow', 'ground', 'cloudLit', 'cloudShade', 'fog', 'hemiSky', 'hemiGround'] as const;
const NUMBER_KEYS = ['azimuth', 'elevation', 'sunIntensity', 'discElevation', 'glowStrength', 'fogDensity', 'hemiIntensity', 'envIntensity', 'exposure', 'night', 'stars', 'bloom'] as const;

type State = { [K in (typeof COLOR_KEYS)[number]]: THREE.Color } & { [K in (typeof NUMBER_KEYS)[number]]: number };

function toState(p: Preset): State {
  const s = {} as State;
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]);
  for (const k of NUMBER_KEYS) s[k] = p[k];
  return s;
}

/** Unit vector pointing at a compass bearing and elevation. */
export function bearingVector(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGlow, uGround, uSunDir, uSunColor, uCloudLit, uCloudShade, uFog;
uniform float uGlowStrength, uStars, uTime, uSunVisible;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = max(dir.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.48));

  // warm band around the sun's bearing, strongest at the horizon
  vec2 flatDir = normalize(dir.xz + 1e-5);
  vec2 flatSun = normalize(uSunDir.xz + 1e-5);
  float toward = max(dot(flatDir, flatSun), 0.0);
  col = mix(col, uGlow, uGlowStrength * pow(toward, 3.0) * pow(1.0 - h, 5.0));

  float cosSun = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(cosSun, 900.0) * 6.0 + pow(cosSun, 40.0) * 0.22 + pow(cosSun, 6.0) * 0.08) * uSunVisible;

  // stars
  vec2 sp = dir.xz / (dir.y + 0.35) * 420.0;
  float star = step(0.9975, hash(floor(sp))) * smoothstep(0.05, 0.4, dir.y);
  col += vec3(0.7, 0.76, 0.85) * star * uStars * (0.55 + 0.45 * sin(uTime * 2.0 + hash(floor(sp)) * 40.0));

  // two cloud decks projected on a plane overhead
  vec2 cp = dir.xz / (dir.y + 0.12);
  float cover = fbm(cp * 1.1 + vec2(uTime * 0.006, 0.0));
  float wisps = fbm(cp * 3.2 - vec2(uTime * 0.01, 3.0));
  float cloud = smoothstep(0.52, 0.86, cover * 0.75 + wisps * 0.3) * smoothstep(0.0, 0.16, dir.y);
  float lit = clamp(0.35 + 0.65 * pow(cosSun, 2.0) + (cover - 0.55) * -1.2, 0.0, 1.0);
  col = mix(col, mix(uCloudShade, uCloudLit, lit), cloud * 0.82);

  // haze near the horizon and the ground half of the dome
  col = mix(col, uFog, pow(1.0 - h, 6.0));
  col = mix(col, uFog, smoothstep(0.02, -0.01, dir.y));
  col = mix(col, uGround, smoothstep(-0.02, -0.5, dir.y) * 0.85);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Lighting {
  /** Cascaded-shadow sun; its position is only a direction. */
  readonly sun = new SunLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly fog = new THREE.FogExp2(0xffffff, 0.0004);
  id: LightingId = 'day';
  bloom = 0;

  private state: State;
  private from: State;
  private to: State;
  private blend = 1;
  private envDirty = true;
  private envTimer = 0;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly skyScene = new THREE.Scene();
  private readonly sunDir = new THREE.Vector3();
  private readonly discDir = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    shadowMapSize: number,
  ) {
    this.state = toState(LIGHTING.day);
    this.from = toState(LIGHTING.day);
    this.to = toState(LIGHTING.day);

    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
        uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
        uGlowStrength: { value: 0 }, uStars: { value: 0 }, uTime: shared.time, uSunVisible: { value: 1 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.name = 'sky';
    scene.add(this.sky);
    this.skyScene.add(new THREE.Mesh(this.sky.geometry, material));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.3;
    this.sun.shadow.radius = 1.5;
    scene.add(this.sun, this.hemi);
    scene.fog = this.fog;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.apply();
  }

  set(id: LightingId, immediate = false): void {
    this.id = id;
    this.from = cloneState(this.state);
    this.to = toState(LIGHTING[id]);
    // turn the short way round the compass
    const delta = ((this.to.azimuth - this.from.azimuth + 540) % 360) - 180;
    this.to.azimuth = this.from.azimuth + delta;
    this.blend = immediate ? 1 : 0;
    if (immediate) {
      this.state = cloneState(this.to);
      this.apply();
      this.envDirty = true;
    }
  }

  get transitioning(): boolean {
    return this.blend < 1;
  }

  update(dt: number): void {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 1.6);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of COLOR_KEYS) this.state[k].lerpColors(this.from[k], this.to[k], t);
      for (const k of NUMBER_KEYS) this.state[k] = THREE.MathUtils.lerp(this.from[k], this.to[k], t);
      this.apply();
      this.envTimer += dt;
      if (this.envTimer > 0.25 || this.blend === 1) {
        this.envTimer = 0;
        this.envDirty = true;
      }
    }
    if (this.envDirty) this.refreshEnvironment();
  }

  /** Shadows are fitted to the view frustum out to this distance from the camera. */
  setShadowDistance(distance: number): void {
    this.sun.shadow.camera.far = distance;
  }

  private apply(): void {
    const s = this.state;
    bearingVector(s.azimuth, s.elevation, this.sunDir);
    bearingVector(s.azimuth, s.discElevation, this.discDir);
    this.sun.position.copy(this.sunDir);
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunIntensity;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.fog.color.copy(s.fog);
    this.fog.density = s.fogDensity;
    this.scene.environmentIntensity = s.envIntensity;
    this.renderer.toneMappingExposure = s.exposure;
    shared.night.value = s.night;
    this.bloom = s.bloom;
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(s.zenith);
    u.uHorizon.value.copy(s.horizon);
    u.uGlow.value.copy(s.glow);
    u.uGround.value.copy(s.ground);
    u.uFog.value.copy(s.fog);
    u.uCloudLit.value.copy(s.cloudLit);
    u.uCloudShade.value.copy(s.cloudShade);
    u.uSunDir.value.copy(this.discDir);
    u.uSunColor.value.copy(s.sun);
    u.uGlowStrength.value = s.glowStrength;
    u.uStars.value = s.stars;
    u.uSunVisible.value = THREE.MathUtils.smoothstep(s.discElevation, -4, 2);
  }

  private refreshEnvironment(): void {
    this.envDirty = false;
    const previous = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.skyScene, 0, 0.1, 10);
    this.scene.environment = this.envTarget.texture;
    previous?.dispose();
  }
}

function cloneState(s: State): State {
  const c = {} as State;
  for (const k of COLOR_KEYS) c[k] = s[k].clone();
  for (const k of NUMBER_KEYS) c[k] = s[k];
  return c;
}
