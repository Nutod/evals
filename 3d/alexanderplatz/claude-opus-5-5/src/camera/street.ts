import * as THREE from 'three';

export const EYE_HEIGHT = 1.7;

/**
 * First-person camera locked to eye height. Drag to look; WASD/arrows or the
 * on-screen joystick to walk; wheel to step forward/back.
 */
export class StreetControls {
  enabled = false;
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector2();
  /** Joystick input in [-1, 1] (x = strafe, y = forward). */
  readonly stick = new THREE.Vector2();
  speed = 6;
  private keys = new Set<string>();
  private dragging: { id: number; x: number; y: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private element: HTMLElement, private bounds: THREE.Vector2) {
    element.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target as HTMLElement).closest?.('input, button, select')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled || this.dragging) return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled || !this.dragging || e.pointerId !== this.dragging.id) return;
    const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
    this.dragging.x = e.clientX;
    this.dragging.y = e.clientY;
    const k = (this.camera.fov / this.element.clientHeight) * (Math.PI / 180);
    this.yaw -= dx * k; // grab-the-world, like street-level map viewers
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.35);
  };

  private onUp = (e: PointerEvent) => {
    if (this.dragging?.id === e.pointerId) this.dragging = null;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.walk(-Math.sign(e.deltaY) * 4, 0);
  };

  /** Ground-plane forward vector for the current yaw (yaw 0 looks north). */
  forward(out = new THREE.Vector2()) {
    return out.set(Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  walk(forward: number, strafe: number) {
    const f = this.forward();
    this.position.x += f.x * forward - f.y * strafe;
    this.position.y += f.y * forward + f.x * strafe;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -this.bounds.x, this.bounds.x);
    this.position.y = THREE.MathUtils.clamp(this.position.y, -this.bounds.y, this.bounds.y);
  }

  /** Points the camera from `from` towards `target`. */
  set(from: THREE.Vector2, target: THREE.Vector3) {
    this.position.copy(from);
    const dx = target.x - from.x, dz = target.z - from.y;
    this.yaw = Math.atan2(dx, -dz);
    this.pitch = Math.atan2(target.y - EYE_HEIGHT, Math.hypot(dx, dz));
  }

  update(dt: number) {
    if (!this.enabled) return;
    let fwd = this.stick.y, strafe = this.stick.x;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    if (this.keys.has('KeyA')) strafe -= 1;
    if (this.keys.has('ArrowLeft')) this.yaw -= dt * 1.6;
    if (this.keys.has('ArrowRight')) this.yaw += dt * 1.6;
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3 : 1;
    if (fwd || strafe) this.walk(fwd * this.speed * run * dt, strafe * this.speed * run * dt);
    this.apply();
  }

  apply() {
    this.camera.position.set(this.position.x, EYE_HEIGHT, this.position.y);
    const f = this.forward();
    const cp = Math.cos(this.pitch);
    this.camera.lookAt(this.position.x + f.x * cp, EYE_HEIGHT + Math.sin(this.pitch), this.position.y + f.y * cp);
  }
}
