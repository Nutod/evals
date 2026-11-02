// Orbit camera held to a generous bubble around the valley, with flights to the presets.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BRIDGES, GATE, VANTAGE, plazaCenter, terrainHeight } from './core/layout.js';
import { clamp, lerp } from './core/util.js';

const pc = plazaCenter();
const falls = BRIDGES[3];

export const PRESETS = {
  vantage: { label: 'Southern slopes', pos: VANTAGE.pos, target: VANTAGE.target },
  market: { label: 'Market square', pos: [pc.x + 36, pc.y + 1.7, pc.z + 46], target: [pc.x - 34, pc.y + 9, pc.z - 46] },
  falls: { label: 'Bridge over the falls', pos: [falls.x + 5, falls.y + 3.2, falls.z + 1], target: [falls.x - 6, 28, falls.z - 160] },
  gate: { label: 'Before the Front Gate', pos: [GATE.x + 26, GATE.y + 1.7, GATE.z + 88], target: [GATE.x - 2, GATE.y + 46, GATE.z] },
  aerial: { label: 'High over the valley', pos: [1900, 2400, 11200], target: [-150, 0, 3500] },
};

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.085,
      screenSpacePanning: false,
      minDistance: 2,
      maxDistance: 16000,
      maxPolarAngle: Math.PI * 0.495,
      zoomSpeed: 1.1,
      rotateSpeed: 0.6,
      panSpeed: 0.9,
    });
    this.controls.zoomToCursor = true;
    this.flight = null;
    this.current = 'vantage';
    this.onPreset = null;
    this.jump('vantage');
    this.controls.addEventListener('start', () => {
      this.flight = null;
      this.setCurrent(null);
    });
  }

  setCurrent(name) {
    this.current = name;
    this.onPreset?.(name);
  }

  jump(name) {
    const p = PRESETS[name];
    this.camera.position.fromArray(p.pos);
    this.controls.target.fromArray(p.target);
    this.controls.update();
    this.setCurrent(name);
  }

  flyTo(name, duration = 2.6) {
    this.flyToView(PRESETS[name], duration, name);
  }

  flyToView(p, duration = 2.6, name = null) {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const toPos = p.pos.isVector3 ? p.pos.clone() : new THREE.Vector3().fromArray(p.pos);
    const toTarget = p.target.isVector3 ? p.target.clone() : new THREE.Vector3().fromArray(p.target);
    const lift = Math.min(900, fromPos.distanceTo(toPos) * 0.25);
    this.flight = { fromPos, fromTarget, toPos, toTarget, lift, k: 0, duration };
    this.setCurrent(name);
  }

  update(dt) {
    const f = this.flight;
    if (f) {
      f.k = Math.min(1, f.k + dt / f.duration);
      const e = ease(f.k);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      this.camera.position.y += Math.sin(Math.PI * e) * f.lift;
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      if (f.k >= 1) this.flight = null;
    }
    this.controls.update();
    // Keep the camera inside the bubble and above ground.
    const c = this.camera.position;
    const t = this.controls.target;
    t.x = clamp(t.x, -6000, 6000);
    t.z = clamp(t.z, -6000, 11000);
    t.y = clamp(t.y, -40, 2400);
    c.x = clamp(c.x, -12000, 12000);
    c.z = clamp(c.z, -10000, 14000);
    c.y = Math.min(c.y, 7000);
    const ground = terrainHeight(c.x, c.z) + 1.4;
    if (c.y < ground) c.y = ground;
    const dist = c.distanceTo(t);
    const above = c.y - ground;
    this.camera.near = clamp(Math.min(dist * 0.012, above * 0.5 + 0.3), 0.25, 12);
    this.camera.far = 70000;
    this.camera.updateProjectionMatrix();
  }

  /** Where the shadow box should centre and how big it should be. */
  focus(out) {
    const dist = this.camera.position.distanceTo(this.controls.target);
    out.copy(this.controls.target);
    out.y = terrainHeight(out.x, out.z);
    return clamp(lerp(120, 1800, clamp(dist / 1800)), 120, 1800);
  }
}
