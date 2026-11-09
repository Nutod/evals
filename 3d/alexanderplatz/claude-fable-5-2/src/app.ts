import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CameraRig, type CameraMode } from './camera/rig';
import { shared } from './core/materials';
import { setMaxAnisotropy } from './core/textures';
import { osm } from './data/osm';
import { Lighting, type LightingId } from './env/lighting';
import { BUILD_STEPS } from './world/build';
import type { Landmark } from './world/landmarks/types';
import { createCollision, createWorld, LAYERS, QUALITY, type LayerId, type Quality, type World } from './world/world';

/** Clock time each lighting preset starts from (a June day in Berlin). */
const PRESET_HOUR: Record<LightingId, number> = { day: 13.5, golden: 20.75, blue: 22.1 };

export interface AppEvents {
  onProgress?: (fraction: number, label: string) => void;
}

function pickQuality(): Quality {
  const param = new URLSearchParams(location.search).get('quality');
  if (param === 'low' || param === 'medium' || param === 'high') return QUALITY[param];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  return coarse || small ? QUALITY.medium : QUALITY.high;
}

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly lighting: Lighting;
  readonly world: World;
  readonly quality: Quality;
  readonly landmarks: Landmark[] = [];

  playing = true;
  speed = 1;
  /** Simulated seconds since midnight. */
  dayTime = PRESET_HOUR.day * 3600;
  ready = false;
  fps = 60;
  frames = 0;

  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly timer = new THREE.Timer();
  private simTime = 0;
  private readonly layerState = Object.fromEntries(LAYERS.map((l) => [l.id, true])) as Record<LayerId, boolean>;
  private readonly frameListeners: ((dt: number) => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.quality = pickQuality();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.quality.post, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // counted per frame across all passes, see frame()
    this.renderer.info.autoReset = false;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    const collision = createCollision();
    this.rig = new CameraRig(canvas, collision);
    this.world = createWorld(this.scene, this.rig.camera, this.quality, collision);
    this.lighting = new Lighting(this.renderer, this.scene, this.quality.shadowMap);

    if (this.quality.post) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.2, 0.55, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Builds the city in steps, yielding to the browser so the progress bar can paint. */
  async build(events: AppEvents = {}): Promise<void> {
    for (let i = 0; i < BUILD_STEPS.length; i++) {
      const step = BUILD_STEPS[i];
      events.onProgress?.(i / BUILD_STEPS.length, step.label);
      await new Promise((r) => setTimeout(r, 0));
      const result = step.run(this.world);
      if (result) this.landmarks.push(...result);
    }
    events.onProgress?.(1, 'Ready');
    this.renderer.compile(this.scene, this.rig.camera);
  }

  /** Starts rendering; call once the interface is wired up. */
  start(): void {
    this.ready = true;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  onFrame(listener: (dt: number) => void): void {
    this.frameListeners.push(listener);
  }

  setLayer(id: LayerId, visible: boolean): void {
    this.layerState[id] = visible;
    this.world.layers[id].visible = visible;
  }

  layerVisible(id: LayerId): boolean {
    return this.layerState[id];
  }

  setLighting(id: LightingId, immediate = false): void {
    this.lighting.set(id, immediate);
    this.dayTime = PRESET_HOUR[id] * 3600;
  }

  setMode(mode: CameraMode): void {
    this.rig.setMode(mode);
  }

  focusLandmark(id: string): void {
    const lm = this.landmarks.find((l) => l.id === id);
    if (!lm) return;
    if (this.rig.mode === 'street') this.rig.goToStreet(lm.street);
    else this.rig.flyTo(this.rig.mode === 'top' ? { ...lm.orbit, target: [lm.orbit.target[0], 0, lm.orbit.target[2]], distance: Math.max(260, lm.orbit.distance * 0.9) } : lm.orbit);
  }

  /** Renders one frame at `scale` × the current resolution and returns it as a PNG with the attribution drawn in. */
  async exportPng(scale = 1): Promise<Blob> {
    const base = this.renderer.getPixelRatio();
    const max = this.renderer.capabilities.maxTextureSize;
    const css = this.renderer.getSize(new THREE.Vector2());
    const ratio = Math.min(base * scale, max / Math.max(css.x, css.y));
    this.setPixelRatio(ratio);
    this.render();
    const w = this.canvas.width;
    const h = this.canvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const g = out.getContext('2d')!;
    g.drawImage(this.canvas, 0, 0);
    this.setPixelRatio(base);
    this.render();

    const unit = Math.max(11, Math.round(h * 0.016));
    const text = `Alexanderplatz, Berlin · procedural model, details approximate · ${osm.meta.attribution}`;
    g.font = `500 ${unit}px "Geist Sans", sans-serif`;
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(10, 31, 24, 0.82)';
    g.fillRect(w - tw - unit * 2, h - unit * 2.4, tw + unit * 2, unit * 2.4);
    g.fillStyle = '#eef2ea';
    g.textBaseline = 'middle';
    g.fillText(text, w - tw - unit, h - unit * 1.15);
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  }

  stats(): Record<string, number | string | boolean> {
    const info = this.renderer.info;
    return {
      quality: this.quality.name,
      build: import.meta.env.MODE,
      playing: this.playing,
      speed: this.speed,
      lighting: this.lighting.id,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      fps: Math.round(this.fps),
      frames: this.frames,
      simTime: this.simTime,
      dayTime: this.dayTime,
      night: shared.night.value,
    };
  }

  private setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.rig.resize(w / h);
  }

  private frame(): void {
    this.timer.update();
    const real = Math.min(this.timer.getDelta(), 0.1);
    if (real > 0) this.fps += (1 / real - this.fps) * 0.05;
    this.step(real);
  }

  /** Advances everything by `real` seconds and renders. Call directly, with the loop stopped, for frame-exact capture. */
  step(real: number): void {
    this.renderer.info.reset();
    const dt = this.playing ? real * this.speed : 0;
    this.simTime += dt;
    this.dayTime = (this.dayTime + dt) % 86400;
    shared.time.value = this.simTime;
    this.world.clock.dayTime = this.dayTime;

    this.rig.update(real);
    this.lighting.update(real);
    this.lighting.setShadowDistance(THREE.MathUtils.clamp(this.rig.viewDistance() * 2.4, 260, 2600));
    if (dt > 0) for (const u of this.world.updaters) u(dt, this.simTime);
    for (const u of this.world.everyFrame) u(real, this.simTime);
    for (const l of this.frameListeners) l(real);
    this.render();
    this.frames++;
  }

  private render(): void {
    if (this.composer && this.bloom) {
      this.bloom.strength = this.lighting.bloom;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.rig.camera);
    }
  }
}
