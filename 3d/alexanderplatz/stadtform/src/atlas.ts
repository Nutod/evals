import * as T from 'three';
import { detailPlaza } from './plaza';
import {
  BUILD_STEPS,
  CameraRig,
  createCollision,
  createWorld,
  QUALITY,
  setMaxAnisotropy,
  shared,
  type Landmark,
  type CameraMode,
  type LayerId,
} from './district';
import { fitDistrict, installTable, site, type Light } from './table';

export class Atlas {
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  readonly rig: CameraRig;
  readonly world;
  readonly landmarks: Landmark[] = [];
  readonly motion = {
    playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    speed: 1,
    seconds: 0,
  };
  lighting: Light = 'day';
  selected: Landmark | undefined;
  frames = 0;
  onFrame?: () => void;
  private illuminate?: (light: Light) => void;
  private previous = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    fitDistrict();
    const collision = createCollision();
    this.rig = new CameraRig(canvas.parentElement!, collision);
    this.rig.controls.enableDamping = false;
    this.world = createWorld(
      this.scene,
      this.rig.camera,
      matchMedia('(pointer:coarse)').matches ? QUALITY.low : QUALITY.medium,
      collision,
    );
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      this.renderer.setSize(w, h, false);
      this.rig.resize(w / Math.max(1, h));
    };
    resize();
    new ResizeObserver(resize).observe(canvas);
  }

  async build(progress: (name: string, fraction: number) => void) {
    for (const [i, step] of BUILD_STEPS.entries()) {
      progress(step.label, (i + 1) / BUILD_STEPS.length);
      await new Promise(requestAnimationFrame);
      const places = step.run(this.world);
      if (places) this.landmarks.push(...places);
    }
    detailPlaza(this.world.layers.buildings, (x, z) => this.world.collision.blocked(x, z));
    this.illuminate = installTable(this.scene, this.renderer);
    this.setLight('day');
    this.overview(0);
    this.renderer.setAnimationLoop(this.frame);
  }

  overview(duration = 0.85) {
    this.selected = undefined;
    this.rig.setMode('orbit');
    const aspect = this.rig.camera.aspect;
    const distance = Math.max(1050, Math.min(1520, 1280 / aspect));
    this.rig.flyTo({ target: [-70, 6, 85], bearing: 346, tilt: 65, distance }, duration);
  }

  setMode(mode: CameraMode) {
    this.rig.setMode(mode);
    if (this.selected) this.focus(this.selected);
    else if (mode === 'street') {
      const clock = this.landmarks.find((l) => l.id === 'weltzeituhr')!;
      this.rig.goToStreet(clock.street);
    }
  }

  focus(place: Landmark) {
    this.selected = place;
    if (this.rig.mode === 'street') this.rig.goToStreet(place.street);
    else
      this.rig.flyTo(
        this.rig.mode === 'top'
          ? {
              ...place.orbit,
              target: [place.orbit.target[0], 0, place.orbit.target[2]],
              distance: Math.max(135, place.orbit.distance * 0.88),
            }
          : place.orbit,
        0.95,
      );
  }

  setLight(light: Light) {
    this.lighting = light;
    this.illuminate?.(light);
  }

  setLayer(layer: LayerId, visible: boolean) {
    this.world.layers[layer].visible = visible;
    this.renderer.shadowMap.needsUpdate = true;
  }

  async exportPng() {
    this.renderer.render(this.scene, this.rig.camera);
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(this.canvas, 0, 0);
    const size = Math.max(10, Math.round(Math.min(out.width / 39, out.height / 46)));
    ctx.font = `500 ${size}px "Geist Sans", sans-serif`;
    const lines = ['Stadtform  /  Alexanderplatz', '© OpenStreetMap contributors · ODbL 1.0'];
    const width = Math.ceil(ctx.measureText(lines[1]).width + size * 2.2);
    const left = out.width - width;
    ctx.fillStyle = '#182c26';
    ctx.fillRect(left, out.height - size * 4, width, size * 4);
    ctx.fillStyle = '#eae9d9';
    ctx.fillText(lines[0], left + size, out.height - size * 2.45);
    ctx.fillStyle = '#c0c9be';
    ctx.fillText(lines[1], left + size, out.height - size);
    return new Promise<Blob>((resolve, reject) =>
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/png'),
    );
  }

  private frame = (now: number) => {
    const dt = this.previous ? Math.min(0.12, (now - this.previous) / 1000) : 0;
    this.previous = now;
    const elapsed = this.motion.playing ? dt * this.motion.speed : 0;
    this.motion.seconds += elapsed;
    this.rig.update(dt);
    const c = this.rig.camera;
    // Keep the walkable district inside the cut edges of the architectural model.
    if (this.rig.mode === 'street' && !this.rig.flying) {
      c.position.x = T.MathUtils.clamp(
        c.position.x,
        site.x - site.width / 2 + 2,
        site.x + site.width / 2 - 2,
      );
      c.position.z = T.MathUtils.clamp(
        c.position.z,
        site.z - site.depth / 2 + 2,
        site.z + site.depth / 2 - 2,
      );
    }
    shared.time.value = this.motion.seconds;
    this.world.clock.dayTime =
      ({ day: 12, golden: 18.75, blue: 21.5 }[this.lighting] * 3600 + this.motion.seconds) % 86400;
    if (elapsed) for (const update of this.world.updaters) update(elapsed, this.motion.seconds);
    for (const update of this.world.everyFrame) update(dt, this.motion.seconds);
    if (elapsed && this.frames % 45 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, c);
    this.onFrame?.();
    this.frames++;
  };
}
