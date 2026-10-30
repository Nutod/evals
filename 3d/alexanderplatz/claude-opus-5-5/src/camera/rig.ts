import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LandmarkView } from '../scene/landmarks/common';
import { EYE_HEIGHT, StreetControls } from './street';

export type CameraMode = 'orbit' | 'top' | 'street';

const TOP_HEIGHT = 1800;
/** Ortho frustum height (m) at zoom 1. */
const TOP_SPAN = 900;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Flight {
  t: number;
  duration: number;
  update: (k: number) => void;
}

/** Owns the perspective + orthographic cameras and switches between orbit, top-down and street modes. */
export class CameraRig {
  readonly perspective: THREE.PerspectiveCamera;
  readonly ortho: THREE.OrthographicCamera;
  readonly orbit: OrbitControls;
  readonly top: OrbitControls;
  readonly street: StreetControls;
  mode: CameraMode = 'orbit';
  private flight: Flight | null = null;
  private listeners = new Set<() => void>();
  private circleListeners = new Set<(on: boolean) => void>();
  /** Finds the scene surface along a ray; set by the app so the orbit pivot can sit on real geometry. */
  pick: ((ray: THREE.Raycaster) => THREE.Vector3 | null) | null = null;
  private raycaster = new THREE.Raycaster();

  constructor(private element: HTMLElement, private bounds: THREE.Vector2) {
    this.perspective = new THREE.PerspectiveCamera(45, 1, 1, 9000);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    this.perspective.position.set(400, 500, 700);

    this.orbit = new OrbitControls(this.perspective, element);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 12;
    this.orbit.maxDistance = 2600;
    this.orbit.maxPolarAngle = THREE.MathUtils.degToRad(86);
    this.orbit.screenSpacePanning = false;
    this.orbit.zoomToCursor = true;
    this.orbit.autoRotateSpeed = 1.2; // one revolution in ~50 s
    this.orbit.addEventListener('change', () => this.emit());
    // Like Google Earth: every drag or zoom pivots around what is under the screen centre,
    // and any interaction stops an automatic circle.
    this.orbit.addEventListener('start', () => {
      this.reanchor();
      this.setCircling(false);
    });

    this.top = new OrbitControls(this.ortho, element);
    this.top.enableRotate = false;
    this.top.screenSpacePanning = true;
    this.top.minZoom = 0.35;
    this.top.maxZoom = 40;
    this.top.zoomToCursor = true;
    this.top.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.top.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.top.enabled = false;
    this.top.addEventListener('change', () => this.emit());

    this.street = new StreetControls(this.perspective, element, bounds);
  }

  get camera(): THREE.Camera {
    return this.mode === 'top' ? this.ortho : this.perspective;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  onCircling(fn: (on: boolean) => void) {
    this.circleListeners.add(fn);
  }

  get circling() {
    return this.orbit.autoRotate;
  }

  /** Slowly orbits the camera around the point at the centre of the view. */
  setCircling(on: boolean) {
    if (on === this.orbit.autoRotate) return;
    if (on) {
      if (this.mode !== 'orbit') this.setMode('orbit');
      if (!this.flight) this.reanchor();
    }
    this.orbit.autoRotate = on;
    for (const fn of this.circleListeners) fn(on);
  }

  /**
   * Moves the orbit pivot along the current view ray onto the surface at the
   * screen centre. The camera does not move, so the view doesn't jump.
   */
  private reanchor() {
    if (this.mode !== 'orbit' || !this.pick) return;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.perspective);
    const hit = this.pick(this.raycaster);
    if (!hit) return;
    const d = hit.distanceTo(this.perspective.position);
    if (d < this.orbit.minDistance || d > this.orbit.maxDistance) return;
    this.orbit.target.copy(hit);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  resize(width: number, height: number) {
    const aspect = width / Math.max(1, height);
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    this.ortho.left = (-TOP_SPAN * aspect) / 2;
    this.ortho.right = (TOP_SPAN * aspect) / 2;
    this.ortho.top = TOP_SPAN / 2;
    this.ortho.bottom = -TOP_SPAN / 2;
    this.ortho.updateProjectionMatrix();
  }

  /** The ground point the view is centred on. */
  focus(): THREE.Vector3 {
    if (this.mode === 'top') return this.top.target.clone();
    if (this.mode === 'street') {
      const f = this.street.forward();
      return new THREE.Vector3(this.street.position.x + f.x * 60, 0, this.street.position.y + f.y * 60);
    }
    return this.orbit.target.clone();
  }

  /** Rough radius of the visible area, for fitting the shadow camera. */
  viewRadius(): number {
    if (this.mode === 'top') return (TOP_SPAN * this.perspective.aspect) / this.ortho.zoom / 1.6;
    if (this.mode === 'street') return 140;
    return this.perspective.position.distanceTo(this.orbit.target) * 0.75;
  }

  /** Metres represented by one CSS pixel at the focus point. */
  metresPerPixel(): number {
    const h = this.element.clientHeight || 1;
    if (this.mode === 'top') return TOP_SPAN / this.ortho.zoom / h;
    const d = this.mode === 'street' ? 60 : this.perspective.position.distanceTo(this.orbit.target);
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2))) / h;
  }

  /** Compass heading the camera faces, degrees (0 = north). */
  heading(): number {
    if (this.mode === 'top') return 0;
    const dir = new THREE.Vector3();
    this.perspective.getWorldDirection(dir);
    return (THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)) + 360) % 360;
  }

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    if (mode !== 'orbit') this.setCircling(false);
    const focus = this.focus();
    const heading = this.heading();
    const prevDistance = this.mode === 'orbit' ? this.perspective.position.distanceTo(this.orbit.target) : this.mode === 'top' ? TOP_SPAN / this.ortho.zoom : 120;
    this.flight = null;
    const previous = this.mode;
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    this.top.enabled = mode === 'top';
    this.street.enabled = mode === 'street';
    if (mode === 'top') {
      this.top.target.set(focus.x, 0, focus.z);
      this.ortho.position.set(focus.x, TOP_HEIGHT, focus.z + 0.01);
      this.ortho.zoom = THREE.MathUtils.clamp(TOP_SPAN / (prevDistance * 1.2), this.top.minZoom, this.top.maxZoom);
      this.ortho.updateProjectionMatrix();
      this.top.update();
    } else if (mode === 'orbit') {
      this.orbit.target.set(focus.x, 0, focus.z);
      const distance = THREE.MathUtils.clamp(prevDistance, 80, 1500);
      const bearing = THREE.MathUtils.degToRad(heading + 180);
      const el = THREE.MathUtils.degToRad(previous === 'street' ? 25 : 55);
      this.perspective.position.set(
        focus.x + Math.sin(bearing) * Math.cos(el) * distance,
        Math.sin(el) * distance,
        focus.z - Math.cos(bearing) * Math.cos(el) * distance,
      );
      this.perspective.near = 1;
      this.perspective.updateProjectionMatrix();
      this.orbit.update();
    } else {
      // Step down to the street, facing the same way.
      const yaw = THREE.MathUtils.degToRad(heading);
      const back = Math.min(prevDistance * 0.4, 40);
      this.street.position.set(focus.x - Math.sin(yaw) * back, focus.z + Math.cos(yaw) * back);
      this.street.yaw = yaw;
      this.street.pitch = 0.08;
      this.perspective.near = 0.2;
      this.perspective.updateProjectionMatrix();
      this.street.apply();
    }
    this.emit();
  }

  /** Animated move to a landmark view in the current mode. */
  flyTo(view: LandmarkView, duration = 1.8) {
    if (this.mode === 'street') {
      const from = this.street.position.clone();
      const fromYaw = this.street.yaw, fromPitch = this.street.pitch;
      const goal = new StreetControls(this.perspective, document.createElement('div'), this.bounds);
      goal.set(view.street.from, view.street.lookAt);
      let dyaw = goal.yaw - fromYaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      this.flight = {
        t: 0, duration,
        update: (k) => {
          this.street.position.lerpVectors(from, view.street.from, k);
          this.street.yaw = fromYaw + dyaw * k;
          this.street.pitch = fromPitch + (goal.pitch - fromPitch) * k;
          this.street.apply();
        },
      };
      return;
    }
    if (this.mode === 'top') {
      const from = this.top.target.clone();
      const fromZoom = this.ortho.zoom;
      const toZoom = THREE.MathUtils.clamp(TOP_SPAN / (view.distance * 0.9), this.top.minZoom, this.top.maxZoom);
      this.flight = {
        t: 0, duration,
        update: (k) => {
          this.top.target.lerpVectors(from, new THREE.Vector3(view.focus.x, 0, view.focus.z), k);
          this.ortho.position.set(this.top.target.x, TOP_HEIGHT, this.top.target.z + 0.01);
          this.ortho.zoom = Math.exp(Math.log(fromZoom) + (Math.log(toZoom) - Math.log(fromZoom)) * k);
          this.ortho.updateProjectionMatrix();
        },
      };
      return;
    }
    const fromTarget = this.orbit.target.clone();
    const offset = this.perspective.position.clone().sub(fromTarget);
    const from = new THREE.Spherical().setFromVector3(offset);
    from.radius = Math.max(from.radius, 1);
    const toTheta = Math.PI - THREE.MathUtils.degToRad(view.bearing);
    const to = new THREE.Spherical(view.distance, THREE.MathUtils.degToRad(90 - view.elevation), toTheta);
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    // Rise a little mid-flight so long hops arc over the city.
    const hop = Math.min(0.6, fromTarget.distanceTo(view.focus) / 1200);
    this.flight = {
      t: 0, duration,
      update: (k) => {
        this.orbit.target.lerpVectors(fromTarget, view.focus, k);
        const s = new THREE.Spherical(
          Math.exp(Math.log(from.radius) + (Math.log(to.radius) - Math.log(from.radius)) * k) * (1 + hop * Math.sin(Math.PI * k)),
          from.phi + (to.phi - from.phi) * k,
          from.theta + dTheta * k,
        );
        this.perspective.position.copy(this.orbit.target).add(new THREE.Vector3().setFromSpherical(s));
        this.perspective.lookAt(this.orbit.target);
      },
    };
  }

  get flying() {
    return !!this.flight;
  }

  update(dt: number) {
    if (this.flight) {
      this.flight.t = Math.min(1, this.flight.t + dt / this.flight.duration);
      this.flight.update(ease(this.flight.t));
      if (this.flight.t >= 1) this.flight = null;
      if (this.mode === 'orbit') {
        // Hold the circle while flying; it resumes around the new view on arrival.
        const circling = this.orbit.autoRotate;
        this.orbit.autoRotate = false;
        this.orbit.update();
        this.orbit.autoRotate = circling;
      }
      if (this.mode === 'top') this.top.update();
      this.emit();
      return;
    }
    if (this.mode === 'orbit') {
      this.orbit.update(dt);
      // Keep the orbit pivot inside the modelled area.
      const t = this.orbit.target;
      const cx = THREE.MathUtils.clamp(t.x, -this.bounds.x, this.bounds.x), cz = THREE.MathUtils.clamp(t.z, -this.bounds.y, this.bounds.y);
      if (cx !== t.x || cz !== t.z) {
        this.perspective.position.x += cx - t.x;
        this.perspective.position.z += cz - t.z;
        t.set(cx, t.y, cz);
      }
      if (this.perspective.position.y < 3) this.perspective.position.y = 3;
    } else if (this.mode === 'top') this.top.update();
    else {
      const before = this.street.position.clone();
      this.street.update(dt);
      if (!before.equals(this.street.position)) this.emit();
    }
  }

  /** North-up reset for the compass button. */
  faceNorth() {
    if (this.mode === 'street') {
      this.street.yaw = 0;
      this.street.apply();
    } else if (this.mode === 'orbit') {
      const offset = this.perspective.position.clone().sub(this.orbit.target);
      const s = new THREE.Spherical().setFromVector3(offset);
      this.flyTo({
        focus: this.orbit.target.clone(), distance: s.radius, bearing: 180, elevation: 90 - THREE.MathUtils.radToDeg(s.phi),
        street: { from: this.street.position.clone(), lookAt: new THREE.Vector3() },
      }, 0.8);
    }
  }

  state() {
    const cam = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    return {
      mode: this.mode,
      position: cam.position.toArray(),
      direction: dir.toArray(),
      target: this.focus().toArray(),
      heading: this.heading(),
      zoom: this.mode === 'top' ? this.ortho.zoom : 1,
      distance: this.mode === 'orbit' ? this.perspective.position.distanceTo(this.orbit.target) : null,
      eyeHeight: this.mode === 'street' ? EYE_HEIGHT : null,
      flying: this.flying,
      circling: this.circling,
    };
  }
}
