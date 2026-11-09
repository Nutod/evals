import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { osm } from '../data/osm';
import type { Collision } from '../world/world';

export type CameraMode = 'orbit' | 'top' | 'street';

export const EYE_HEIGHT = 1.7;
const MAX_POLAR = THREE.MathUtils.degToRad(87);
const WALK_SPEED = 4.2;
const RUN_SPEED = 13;

/** A camera pose described the way a map user thinks about it. */
export interface OrbitView {
  target: [number, number, number];
  distance: number;
  /** Compass bearing the camera looks toward, in degrees. */
  bearing: number;
  /** Tilt from straight down, in degrees. */
  tilt: number;
}

export interface StreetView {
  x: number;
  z: number;
  lookAt: [number, number, number];
}

export interface CameraState {
  mode: CameraMode;
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
  bearing: number;
  tilt: number;
  fov: number;
  flying: boolean;
}

interface Flight {
  t: number;
  duration: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  from: THREE.Spherical;
  to: THREE.Spherical;
  done?: () => void;
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  mode: CameraMode = 'orbit';
  /** Walk input in street mode: x strafes right, y moves forward. Set by the on-screen stick. */
  readonly stick = new THREE.Vector2();
  onModeChange?: (mode: CameraMode) => void;

  private flight: Flight | null = null;
  private yaw = 0;
  private pitch = 0;
  private readonly keys = new Set<string>();
  private dragging: { id: number; x: number; y: number } | null = null;
  private readonly offset = new THREE.Vector3();
  private readonly spherical = new THREE.Spherical();

  constructor(
    private readonly dom: HTMLElement,
    private readonly collision: Collision,
  ) {
    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 40000);
    this.controls = new OrbitControls(this.camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.screenSpacePanning = false;
    c.zoomToCursor = true;
    c.minDistance = 18;
    c.maxDistance = 2400;
    c.maxPolarAngle = MAX_POLAR;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 1.1;
    c.autoRotateSpeed = 0.55;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.applyView({ target: [40, 20, -30], distance: 620, bearing: 318, tilt: 62 });

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', () => this.keys.clear());
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  set autoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    const previous = this.mode;
    const c = this.controls;
    const focus = previous === 'street' ? this.streetFocus().clone() : c.target.clone();
    const bearing = this.bearing();
    this.mode = mode;
    this.flight = null;
    this.streetFlight = null;
    this.camera.fov = 46;
    this.camera.updateProjectionMatrix();

    if (mode === 'street') {
      c.enabled = false;
      c.autoRotate = false;
      const spot = this.freeSpot(focus.x, focus.z);
      this.yaw = THREE.MathUtils.degToRad(bearing);
      this.pitch = 0.06;
      // glide down to eye height looking the way the orbit camera was facing
      const to = new THREE.Vector3(spot[0], EYE_HEIGHT, spot[1]);
      this.flyStreet(to, this.yaw, this.pitch, 1.4);
    } else {
      c.enabled = true;
      this.unlockAngles();
      if (previous === 'street') {
        // restart orbiting from where the walker stands
        const forward = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        c.target.copy(this.camera.position).addScaledVector(forward, 40).setY(8);
        c.update();
      }
      const current = this.readSpherical();
      const view: OrbitView =
        mode === 'top'
          ? { target: [focus.x, 0, focus.z], distance: THREE.MathUtils.clamp(current.radius * 1.15, 320, 1500), bearing: 0, tilt: 0 }
          : { target: [focus.x, 12, focus.z], distance: THREE.MathUtils.clamp(current.radius, 160, 900), bearing: previous === 'top' ? 320 : this.bearing(), tilt: 62 };
      this.flyTo(view, 1.4);
    }
    this.onModeChange?.(mode);
  }

  /** Animated move to an orbit or top-down pose. */
  flyTo(view: OrbitView, duration = 1.7, done?: () => void): void {
    if (this.mode === 'street') return;
    this.unlockAngles();
    const from = this.readSpherical();
    const tilt = this.mode === 'top' ? 0 : view.tilt;
    const bearing = this.mode === 'top' ? 0 : view.bearing;
    const to = new THREE.Spherical(view.distance, Math.max(0.0001, THREE.MathUtils.degToRad(tilt)), bearingToTheta(bearing));
    // spin the short way round
    to.theta = from.theta + ((((to.theta - from.theta) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.controls.enabled = false;
    this.flight = {
      t: 0,
      duration,
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...view.target),
      from,
      to,
      done: () => {
        this.controls.enabled = true;
        this.lockAngles();
        done?.();
      },
    };
    if (duration <= 0) this.stepFlight(1);
  }

  /** Walks the street camera to a spot and turns it toward a point of interest. */
  goToStreet(view: StreetView, duration = 1.5): void {
    if (this.mode !== 'street') return;
    const dx = view.lookAt[0] - view.x;
    const dz = view.lookAt[2] - view.z;
    const yaw = Math.atan2(dx, -dz);
    const pitch = Math.atan2(view.lookAt[1] - EYE_HEIGHT, Math.hypot(dx, dz));
    this.flyStreet(new THREE.Vector3(view.x, EYE_HEIGHT, view.z), yaw, THREE.MathUtils.clamp(pitch, -0.5, 1.25), duration);
  }

  resetNorth(): void {
    if (this.mode === 'street') {
      this.flyStreet(this.camera.position.clone(), 0, this.pitch, 0.7);
      return;
    }
    const s = this.readSpherical();
    const t = this.controls.target;
    this.flyTo({ target: [t.x, t.y, t.z], distance: s.radius, bearing: 0, tilt: THREE.MathUtils.radToDeg(s.phi) }, 0.8);
  }

  /** Zoom buttons: factor < 1 moves closer. */
  zoomBy(factor: number): void {
    if (this.mode === 'street') {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov * factor, 24, 78);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.flight) return;
    const s = this.readSpherical();
    const t = this.controls.target;
    this.flyTo(
      {
        target: [t.x, t.y, t.z],
        distance: THREE.MathUtils.clamp(s.radius * factor, this.controls.minDistance, this.controls.maxDistance),
        bearing: this.bearing(),
        tilt: THREE.MathUtils.radToDeg(s.phi),
      },
      0.35,
    );
  }

  update(dt: number): void {
    if (this.flight) {
      this.flight.t += dt / Math.max(this.flight.duration, 1e-3);
      const t = Math.min(1, this.flight.t);
      if (this.streetFlight) this.stepStreetFlight(t);
      else this.stepFlight(t);
    } else if (this.mode === 'street') {
      this.walk(dt);
    } else {
      this.controls.update(dt);
      this.constrain();
    }
    const distance = this.mode === 'street' ? 30 : this.camera.position.distanceTo(this.controls.target);
    const near = this.mode === 'street' ? 0.15 : THREE.MathUtils.clamp(distance * 0.02, 0.5, 20);
    if (Math.abs(near - this.camera.near) > near * 0.1) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The ground point the view is centred on, for shadows and the coordinate readout. */
  focusPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return this.mode === 'street' ? out.copy(this.streetFocus()) : out.copy(this.controls.target);
  }

  viewDistance(): number {
    return this.mode === 'street' ? 60 : this.camera.position.distanceTo(this.controls.target);
  }

  bearing(): number {
    if (this.mode === 'street' && !this.flight) return (THREE.MathUtils.radToDeg(this.yaw) + 360) % 360;
    const d = this.camera.getWorldDirection(_dir);
    if (Math.hypot(d.x, d.z) < 1e-3) {
      // looking straight down: the top of the screen gives the bearing
      _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      return (THREE.MathUtils.radToDeg(Math.atan2(_up.x, -_up.z)) + 360) % 360;
    }
    return (THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)) + 360) % 360;
  }

  getState(): CameraState {
    const p = this.camera.position;
    const t = this.focusPoint(_focus);
    const d = this.camera.getWorldDirection(_dir);
    return {
      mode: this.mode,
      position: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      distance: p.distanceTo(t),
      bearing: this.bearing(),
      tilt: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(-d.y, -1, 1))),
      fov: this.camera.fov,
      flying: this.flying,
    };
  }

  // ---------- internals ----------

  private applyView(view: OrbitView): void {
    this.controls.target.set(...view.target);
    this.spherical.set(view.distance, Math.max(0.0001, THREE.MathUtils.degToRad(view.tilt)), bearingToTheta(view.bearing));
    this.camera.position.setFromSpherical(this.spherical).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  private readSpherical(): THREE.Spherical {
    this.offset.copy(this.camera.position).sub(this.controls.target);
    return new THREE.Spherical().setFromVector3(this.offset);
  }

  private stepFlight(t: number): void {
    const f = this.flight!;
    const k = ease(t);
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    this.spherical.set(
      // ease distance in log space so long zooms feel even
      Math.exp(THREE.MathUtils.lerp(Math.log(f.from.radius), Math.log(f.to.radius), k)),
      THREE.MathUtils.lerp(f.from.phi, f.to.phi, k),
      THREE.MathUtils.lerp(f.from.theta, f.to.theta, k),
    );
    this.spherical.phi = Math.max(0.0001, this.spherical.phi);
    this.camera.position.setFromSpherical(this.spherical).add(this.controls.target);
    this.orient();
    if (t >= 1) {
      this.flight = null;
      f.done?.();
    }
  }

  /** lookAt, but stable when looking straight down: north stays up. */
  private orient(): void {
    const s = this.spherical;
    if (s.phi < 0.02) {
      this.camera.up.set(-Math.sin(s.theta), 0, -Math.cos(s.theta));
      this.camera.lookAt(this.controls.target);
      this.camera.up.set(0, 1, 0);
    } else {
      this.camera.lookAt(this.controls.target);
    }
  }

  private unlockAngles(): void {
    const c = this.controls;
    c.minPolarAngle = 0;
    c.maxPolarAngle = MAX_POLAR;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
  }

  private lockAngles(): void {
    const c = this.controls;
    const top = this.mode === 'top';
    c.enableRotate = !top;
    c.minPolarAngle = 0;
    c.maxPolarAngle = top ? 0 : MAX_POLAR;
    c.minAzimuthAngle = top ? 0 : -Infinity;
    c.maxAzimuthAngle = top ? 0 : Infinity;
    c.mouseButtons = top
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = top ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.update();
  }

  private constrain(): void {
    const { x, z } = osm.meta.halfExtent;
    const t = this.controls.target;
    const cx = THREE.MathUtils.clamp(t.x, -x, x);
    const cz = THREE.MathUtils.clamp(t.z, -z, z);
    const cy = THREE.MathUtils.clamp(t.y, 0, 380);
    if (cx !== t.x || cy !== t.y || cz !== t.z) {
      this.camera.position.x += cx - t.x;
      this.camera.position.y += cy - t.y;
      this.camera.position.z += cz - t.z;
      t.set(cx, cy, cz);
    }
    if (this.camera.position.y < 2) this.camera.position.y = 2;
  }

  // ----- street mode -----

  private streetFocus(): THREE.Vector3 {
    return _street.set(this.camera.position.x, 0, this.camera.position.z);
  }

  private freeSpot(x: number, z: number): [number, number] {
    const { x: hx, z: hz } = osm.meta.halfExtent;
    for (let r = 0; r < 160; r += 4) {
      for (let a = 0; a < 12; a++) {
        const px = THREE.MathUtils.clamp(x + Math.cos((a / 12) * Math.PI * 2) * r, -hx + 5, hx - 5);
        const pz = THREE.MathUtils.clamp(z + Math.sin((a / 12) * Math.PI * 2) * r, -hz + 5, hz - 5);
        if (!this.collision.blocked(px, pz)) return [px, pz];
        if (r === 0) break;
      }
    }
    return [x, z];
  }

  private flyStreet(to: THREE.Vector3, yaw: number, pitch: number, duration: number): void {
    const from = this.camera.position.clone();
    const q0 = this.camera.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -yaw, 0, 'YXZ'));
    this.yaw = yaw;
    this.pitch = pitch;
    // reuse the flight slot with a custom stepper
    const flight: Flight = {
      t: 0,
      duration,
      fromTarget: from,
      toTarget: to,
      from: new THREE.Spherical(),
      to: new THREE.Spherical(),
    };
    this.flight = flight;
    this.streetFlight = { q0, q1 };
  }

  private streetFlight: { q0: THREE.Quaternion; q1: THREE.Quaternion } | null = null;

  private walk(dt: number): void {
    const k = this.keys;
    let forward = this.stick.y;
    let strafe = this.stick.x;
    if (k.has('KeyW') || k.has('ArrowUp')) forward += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) forward -= 1;
    if (k.has('KeyD')) strafe += 1;
    if (k.has('KeyA')) strafe -= 1;
    if (k.has('ArrowLeft')) this.yaw -= dt * 1.6;
    if (k.has('ArrowRight')) this.yaw += dt * 1.6;
    const len = Math.hypot(forward, strafe);
    if (len > 0.01) {
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * Math.min(1, len) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((forward * sin + strafe * cos) / len) * speed;
      const dz = ((-forward * cos + strafe * sin) / len) * speed;
      const p = this.camera.position;
      const { x: hx, z: hz } = osm.meta.halfExtent;
      // slide along walls: try the full step, then each axis on its own
      const tryMove = (mx: number, mz: number): boolean => {
        const nx = THREE.MathUtils.clamp(p.x + mx, -hx + 2, hx - 2);
        const nz = THREE.MathUtils.clamp(p.z + mz, -hz + 2, hz - 2);
        if (this.collision.blocked(nx + Math.sign(mx) * 0.4, nz + Math.sign(mz) * 0.4)) return false;
        p.x = nx;
        p.z = nz;
        return true;
      };
      if (!tryMove(dx, dz) && !tryMove(dx, 0)) tryMove(0, dz);
    }
    this.camera.position.y = EYE_HEIGHT;
    this.camera.quaternion.setFromEuler(_euler.set(this.pitch, -this.yaw, 0, 'YXZ'));
  }

  private stepStreetFlight(t: number): void {
    const f = this.flight!;
    const s = this.streetFlight!;
    const k = ease(t);
    this.camera.position.lerpVectors(f.fromTarget, f.toTarget, k);
    this.camera.quaternion.slerpQuaternions(s.q0, s.q1, k);
    if (t >= 1) {
      this.flight = null;
      this.streetFlight = null;
    }
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'street' || this.dragging) return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.dom.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.mode !== 'street' || !this.dragging || e.pointerId !== this.dragging.id || this.flight) return;
    const scale = (this.camera.fov / 46) * 0.0042;
    // dragging pulls the scene, like street-level map viewers
    this.yaw -= (e.clientX - this.dragging.x) * scale;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.dragging.y) * scale, -1.2, 1.45);
    this.dragging.x = e.clientX;
    this.dragging.y = e.clientY;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.dragging?.id === e.pointerId) this.dragging = null;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.mode !== 'street') return;
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? 1.08 : 0.92);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
    if (e.type === 'keydown') this.keys.add(e.code);
    else this.keys.delete(e.code);
    if (this.mode === 'street' && e.code.startsWith('Arrow')) e.preventDefault();
  };
}

/** OrbitControls measures theta from +Z; a camera looking toward `bearing` sits on the opposite side of the target. */
function bearingToTheta(bearing: number): number {
  return -THREE.MathUtils.degToRad(bearing);
}

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _street = new THREE.Vector3();
const _euler = new THREE.Euler();
