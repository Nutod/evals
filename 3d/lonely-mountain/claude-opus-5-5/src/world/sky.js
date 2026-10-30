// Sky dome, sun, hemisphere light and fog, all driven by the hour's light keyframe.
import * as THREE from 'three';
import { shaderMaterial, U } from '../core/shaderlib.js';
import { lightAt } from '../core/hours.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uNorth, uSunDir, uSunColor, uSmokeLit;
uniform float uNorthAmt, uClouds, uSmoke, uSunI, uHaze;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  float up = pow(clamp(el, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, up);
  // Bruised copper over the northern horizon in the hours of dread.
  float north = smoothstep(0.1, -0.85, d.z) * (1.0 - smoothstep(0.05, 0.55, el));
  col = mix(col, uNorth, north * uNorthAmt);
  // Sun disc and glow.
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 30.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12) * uSunI * 0.35;
  // Fair-weather cloud on a high plane.
  if (el > 0.0) {
    vec2 cp = d.xz / (el + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0025);
    float cl = lmFbm(cp * 1.3);
    float cover = smoothstep(1.0 - uClouds, 1.12 - uClouds * 0.5, cl + 0.2) * smoothstep(0.0, 0.12, el);
    vec3 cloudCol = mix(uHorizon * 1.08, vec3(1.0), 0.5) * (0.7 + 0.4 * max(dot(d, uSunDir), 0.0)) + uSunColor * 0.08 * uSunI;
    col = mix(col, cloudCol, cover * 0.85);
    // Low smoke ceiling, lit from below by the burning valley.
    vec2 sp = d.xz / (el + 0.05) * 0.9 + vec2(uTime * 0.006, uTime * 0.012);
    float sm = lmFbm(sp * 1.7 + lmFbm(sp * 0.6) * 1.4);
    float smoke = smoothstep(1.0 - uSmoke * 1.1, 1.05 - uSmoke * 0.6, sm + 0.25) * uSmoke;
    vec3 smokeCol = mix(vec3(0.04, 0.035, 0.032), uSmokeLit, (0.25 + 0.75 * exp(-el * 5.0)) * (0.4 + 0.6 * sm));
    col = mix(col, smokeCol, clamp(smoke, 0.0, 1.0));
  }
  // Dust haze near the horizon.
  col = mix(col, uHorizon, uHaze * exp(-abs(el) * 9.0) * 0.6);
  if (el < 0.0) col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.2, el));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.material = shaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uNorth: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uSmokeLit: { value: new THREE.Color() },
        uNorthAmt: { value: 0 },
        uClouds: { value: 0 },
        uSmoke: { value: 0 },
        uSunI: { value: 1 },
        uHaze: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.dome.scale.setScalar(30000);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0001);
    this.scene = scene;
    this.light = null;
  }

  setShadowSize(size) {
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  update(t, renderer, focus, span) {
    const L = (this.light = lightAt(t));
    const u = this.material.uniforms;
    u.uZenith.value.copy(L.zenith);
    u.uHorizon.value.copy(L.horizon);
    u.uNorth.value.copy(L.north);
    u.uNorthAmt.value = L.northAmt;
    u.uSunDir.value.copy(L.sunDir);
    u.uSunColor.value.copy(L.sunColor);
    u.uSunI.value = Math.min(1, L.sun);
    u.uClouds.value = L.clouds;
    u.uSmoke.value = L.smoke;
    u.uSmokeLit.value.copy(L.smokeLit);
    u.uHaze.value = L.haze;

    this.sun.color.copy(L.sunColor);
    this.sun.intensity = L.sun * Math.max(0, Math.min(1, (L.sunDir.y + 0.02) * 12));
    this.sun.visible = this.sun.intensity > 0.01;
    // Shadow box follows what the camera is looking at.
    const half = span;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(L.sunDir, 3000);
    const cam = this.sun.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 100; cam.far = 6000;
    cam.updateProjectionMatrix();
    this.sun.shadow.normalBias = 0.25 + half / 1500;

    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemi;
    this.scene.fog.color.copy(L.fog);
    this.scene.fog.density = L.fogDensity;
    renderer.toneMappingExposure = L.exposure;

    U.uWind.value.set(L.windDir[0], L.windDir[1], L.wind);
    U.uFireGlow.value.setRGB(1, 0.42, 0.12).multiplyScalar(L.fire);
    U.uAsh.value = L.ash;
    U.uDsSun.value.copy(L.sunDir);
    return L;
  }
}
