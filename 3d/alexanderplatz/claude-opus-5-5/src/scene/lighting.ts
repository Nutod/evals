import * as THREE from 'three';
import { setNightLevel } from './night';

export type LightPreset = 'day' | 'golden' | 'blue';

interface PresetValues {
  elevation: number; // sun elevation, degrees
  azimuth: number; // compass bearing of the sun, degrees
  sun: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  fogDensity: number;
  exposure: number;
  night: number;
}

const c = (hex: string) => new THREE.Color(hex);

export const PRESETS: Record<LightPreset, PresetValues> = {
  day: {
    elevation: 50, azimuth: 165, sun: c('#fff4e2'), sunIntensity: 3.2, sky: c('#cfe2f6'), ground: c('#8a8170'), hemi: 1.15,
    zenith: c('#2f6db5'), horizon: c('#cfe0ee'), glow: c('#fff6e0'), fogDensity: 0.00032, exposure: 0.95, night: 0,
  },
  golden: {
    elevation: 7, azimuth: 290, sun: c('#ffb46b'), sunIntensity: 3.4, sky: c('#9fb4d6'), ground: c('#7a5a40'), hemi: 0.75,
    zenith: c('#3b5f97'), horizon: c('#ffc58a'), glow: c('#ff9a4a'), fogDensity: 0.00042, exposure: 1.0, night: 0.12,
  },
  blue: {
    elevation: -5, azimuth: 300, sun: c('#7f9ad8'), sunIntensity: 0.32, sky: c('#2c4a86'), ground: c('#1c2230'), hemi: 0.7,
    zenith: c('#0b1838'), horizon: c('#3d64a8'), glow: c('#f08a5a'), fogDensity: 0.0005, exposure: 1.25, night: 1,
  },
};

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFragment = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 sunDir;
uniform float sunVisible;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, 1.0 - pow(1.0 - h, 2.5));
  float toward = max(dot(d, normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
  col += glow * pow(toward, 6.0) * (1.0 - h) * 0.55;
  float disc = smoothstep(0.9993, 0.9997, dot(d, sunDir)) * sunVisible;
  col = mix(col, vec3(1.0, 0.97, 0.9) * 3.0, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // three.js blends fog after tone mapping, so fade into the un-tone-mapped fog colour to meet the ground seamlessly.
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(horizon, 1.0)).rgb, 1.0 - smoothstep(0.0, 0.14, d.y));
}`;

/** Sun, sky dome, ambient fill and fog, interpolated between time-of-day presets. */
export class Lighting {
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly fog = new THREE.FogExp2(0xffffff, 0.0004);
  current: LightPreset = 'day';
  private from: PresetValues = PRESETS.day;
  private to: PresetValues = PRESETS.day;
  private t = 1;
  private state: PresetValues = { ...PRESETS.day };
  private envDirty = true;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 3000;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, glow: { value: new THREE.Color() },
          sunDir: { value: new THREE.Vector3() }, sunVisible: { value: 1 },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.name = 'sky';
    scene.add(this.sky);
    scene.fog = this.fog;
    this.apply(PRESETS.day);
  }

  set(preset: LightPreset, animate = true) {
    this.current = preset;
    this.from = { ...this.state, sun: this.state.sun.clone(), sky: this.state.sky.clone(), ground: this.state.ground.clone(), zenith: this.state.zenith.clone(), horizon: this.state.horizon.clone(), glow: this.state.glow.clone(), };
    this.to = PRESETS[preset];
    this.t = animate ? 0 : 1;
    if (!animate) this.apply(this.to);
  }

  /** Whether a transition is still running (so callers can keep rendering). */
  get animating() {
    return this.t < 1;
  }

  update(dt: number, focus: THREE.Vector3, viewRadius: number, camera: THREE.Camera) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 1.6);
      const k = this.t * this.t * (3 - 2 * this.t);
      const a = this.from, b = this.to;
      const lerp = (x: number, y: number) => x + (y - x) * k;
      let az = b.azimuth - a.azimuth;
      if (az > 180) az -= 360;
      if (az < -180) az += 360;
      this.apply({
        elevation: lerp(a.elevation, b.elevation), azimuth: a.azimuth + az * k,
        sun: a.sun.clone().lerp(b.sun, k), sunIntensity: lerp(a.sunIntensity, b.sunIntensity),
        sky: a.sky.clone().lerp(b.sky, k), ground: a.ground.clone().lerp(b.ground, k), hemi: lerp(a.hemi, b.hemi),
        zenith: a.zenith.clone().lerp(b.zenith, k), horizon: a.horizon.clone().lerp(b.horizon, k), glow: a.glow.clone().lerp(b.glow, k),
        fogDensity: lerp(a.fogDensity, b.fogDensity), exposure: lerp(a.exposure, b.exposure), night: lerp(a.night, b.night),
      });
      if (this.t === 1) this.envDirty = true;
    }
    // Keep the shadow frustum tight around what the camera is looking at.
    const dirToSun = this.sunDirection();
    const radius = THREE.MathUtils.clamp(viewRadius, 60, 1100);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.updateProjectionMatrix();
    // Snap to shadow texels so shadows don't shimmer while panning.
    const texel = (radius * 2) / this.sun.shadow.mapSize.x;
    const snapped = focus.clone();
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.z = Math.round(snapped.z / texel) * texel;
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(dirToSun, 1500);
    this.sky.position.copy(camera.position);
    this.sky.scale.setScalar(5000);
    if (this.envDirty) this.updateEnvironment();
  }

  sunDirection(state = this.state) {
    const el = THREE.MathUtils.degToRad(Math.max(state.elevation, 4));
    const az = THREE.MathUtils.degToRad(state.azimuth);
    // Bearing: 0 = north (-z), 90 = east (+x).
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  }

  private apply(s: PresetValues) {
    this.state = s;
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunIntensity;
    this.sun.castShadow = s.elevation > 0;
    this.hemi.color.copy(s.sky);
    this.hemi.groundColor.copy(s.ground);
    this.hemi.intensity = s.hemi;
    const u = this.sky.material.uniforms;
    u.zenith.value.copy(s.zenith);
    u.horizon.value.copy(s.horizon);
    u.glow.value.copy(s.glow);
    const el = THREE.MathUtils.degToRad(s.elevation);
    const az = THREE.MathUtils.degToRad(s.azimuth);
    u.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    u.sunVisible.value = s.elevation > -1 ? 1 : 0;
    // Fog matches the sky at the horizon so the ground fades out seamlessly.
    this.fog.color.copy(s.horizon);
    this.fog.density = s.fogDensity;
    this.renderer.toneMappingExposure = s.exposure;
    setNightLevel(s.night);
  }

  /** Re-renders the sky into a PMREM environment so glass and steel reflect the current light. */
  private updateEnvironment() {
    this.envDirty = false;
    const envScene = new THREE.Scene();
    const sky = this.sky.clone();
    sky.position.set(0, 0, 0);
    sky.scale.setScalar(100);
    envScene.add(sky);
    // A darker ground hemisphere so reflections aren't all sky.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: this.state.ground.clone().multiplyScalar(0.6) }));
    ground.position.y = -2;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(envScene, 0.02);
    const old = this.scene.environment;
    this.scene.environment = target.texture;
    old?.dispose();
    pmrem.dispose();
  }
}
