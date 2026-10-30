import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CameraRig } from './camera.js';
import { HourStream } from './core/stream.js';
import { U } from './core/shaderlib.js';
import { clamp } from './core/util.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { buildTerrain } from './world/terrain.js';
import { Gate } from './world/gate.js';
import { Houses, planHouses } from './world/houses.js';
import { Town } from './world/town.js';
import { Vegetation } from './world/vegetation.js';
import { Market } from './world/market.js';
import { bindUI } from './ui/ui.js';
import { Fire } from './fx/fire.js';
import { Population } from './life/population.js';
import { Dragon } from './life/dragon.js';
import { Birds } from './life/birds.js';

const QUALITY = {
  low: { dpr: 1, shadow: 1024, bloom: false, samples: 0, scale: 0.4 },
  medium: { dpr: 1.5, shadow: 2048, bloom: true, samples: 2, scale: 0.7 },
  high: { dpr: 2, shadow: 4096, bloom: true, samples: 4, scale: 1 },
};

function detectQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && QUALITY[q]) return q;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  return mobile ? 'low' : (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
}

class App {
  constructor(container) {
    this.quality = detectQuality();
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[this.quality].dpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 1, 70000);
    this.rig = new CameraRig(this.camera, renderer.domElement);
    this.stream = new HourStream(this.scene);

    this.S = { t: 0, time: 0, dt: 0, frame: 0, density: 1, scale: QUALITY[this.quality].scale, quality: this.quality, camera: this.camera, light: null };
    this.target = null;
    this.frames = 0;
    this.modules = [];
    this.focus = new THREE.Vector3();
  }

  async build(progress) {
    const step = async (label, fn) => {
      progress(label);
      await new Promise((r) => setTimeout(r, 0));
      return fn();
    };
    const { scene } = this;
    this.sky = await step('Raising the Mountain…', () => new Sky(scene));
    this.terrain = await step('Raising the Mountain…', () => buildTerrain(scene, this.quality));
    this.water = await step('Filling the River Running…', () => new Water(scene));
    this.gate = await step('Carving the Front Gate…', () => new Gate(scene));
    this.houses = await step('Building Dale…', () => new Houses(scene, planHouses()));
    this.town = await step('Hanging the bells of Dale…', () => new Town(scene));
    this.market = await step('Raising the market stalls…', () => new Market(scene));
    this.vegetation = await step('Planting the shoulders with pine…', () => new Vegetation(scene, this.quality));
    this.world = { houses: this.houses, town: this.town, market: this.market, vegetation: this.vegetation, gate: this.gate };
    this.fire = await step('Laying the fires…', () => new Fire(scene, this.stream, this.world));
    this.population = await step('Calling the people of Dale…', () => new Population(scene, this.stream, this.world));
    this.dragon = await step('Waking the worm…', () => new Dragon(scene));
    this.birds = await step('Loosing the birds…', () => new Birds(scene, this.world));
    this.modules.push(this.gate, this.town, this.market, this.vegetation, this.fire, this.population, this.dragon, this.birds);

    this.setupPost();
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(this.sky.dome.geometry, this.sky.material));
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envT = -1;
    this.sky.setShadowSize(QUALITY[this.quality].shadow);
    this.update(0);
    this.stream.update(this.S, this.ctx(), true);
  }

  ctx() {
    return { scene: this.scene, S: this.S, quality: this.quality };
  }

  setupPost() {
    const q = QUALITY[this.quality];
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.samples });
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.55, 0.92);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  hour() {
    return this.S.t;
  }
  setHour(t) {
    this.target = null;
    this.S.t = clamp(t, 0, 4);
  }
  goToHour(i, duration = 2.4) {
    this.target = { from: this.S.t, to: clamp(i, 0, 4), k: 0, duration: duration * Math.max(0.35, Math.abs(i - this.S.t)) };
  }
  setDensity(d) {
    this.S.density = d;
  }
  setQuality(q) {
    if (!QUALITY[q] || q === this.quality) return;
    this.quality = this.S.quality = q;
    this.S.scale = QUALITY[q].scale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[q].dpr));
    this.sky.setShadowSize(QUALITY[q].shadow);
    this.setupPost();
    this.resize();
    for (const m of this.modules) m.setQuality?.(q, this.S);
    this.stream.rebuild(this.S, this.ctx());
  }

  vignettes(i) {
    return this.modules.flatMap((m) => m.vignettes?.filter((v) => v.hour === i) ?? []);
  }
  flyToVignette(v) {
    this.rig.flyToView(typeof v.view === 'function' ? v.view() : v.view, 2.4);
  }
  project(p) {
    const v = new THREE.Vector3().copy(typeof p === 'function' ? p() : p).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.resolution.set(size.x / 2, size.y / 2);
  }

  update(dt) {
    const S = this.S;
    if (this.target) {
      const g = this.target;
      g.k = Math.min(1, g.k + dt / g.duration);
      const e = g.k < 0.5 ? 2 * g.k * g.k : 1 - Math.pow(-2 * g.k + 2, 2) / 2;
      S.t = g.from + (g.to - g.from) * e;
      if (g.k >= 1) this.target = null;
    }
    S.dt = dt;
    S.time += dt;
    S.frame++;
    this.rig.update(dt);
    U.uT.value = S.t;
    U.uTime.value = S.time;
    U.uCam.value.copy(this.camera.position);
    const span = this.rig.focus(this.focus);
    S.light = this.sky.update(S.t, this.renderer, this.focus, span);
    // Thin air: fog eases off as the camera climbs.
    this.scene.fog.density *= clamp(1 - (this.camera.position.y - 400) / 4500, 0.3, 1);
    this.water.update(S.light);
    for (const m of this.modules) m.update?.(S);
    this.stream.update(S, this.ctx());
    if (this.bloom) this.bloom.strength = S.light.bloom;
    // Re-light reflections from the sky as the hour turns.
    if (Math.abs(S.t - this.envT) > 0.04 && (!this.envAt || S.time - this.envAt > 0.25)) {
      this.envT = S.t;
      this.envAt = S.time;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 60000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.55;
      old?.dispose();
    }
  }

  render() {
    this.composer.render();
    this.frames++;
  }

  async exportPNG() {
    this.render();
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }

  pixelStats() {
    this.render();
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = Math.round((160 * src.height) / src.width);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const n = d.length / 4;
    const mean = [0, 0, 0];
    const colors = new Set();
    let lum = 0, lum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      mean[0] += d[i]; mean[1] += d[i + 1]; mean[2] += d[i + 2];
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      lum += l; lum2 += l * l;
      colors.add((d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3));
    }
    lum /= n;
    return { mean: mean.map((m) => m / n), luminance: lum, std: Math.sqrt(lum2 / n - lum * lum), colors: colors.size, width: src.width };
  }
}

async function start() {
  const loaderText = document.getElementById('loader-text');
  let app;
  try {
    app = new App(document.getElementById('viewport'));
  } catch (err) {
    loaderText.textContent = 'WebGL is not available in this browser, so the valley cannot be shown.';
    window.__lm = { error: String(err) };
    return;
  }
  await app.build((label) => (loaderText.textContent = label));
  const updateUI = bindUI(app);
  window.addEventListener('resize', () => app.resize());
  const hour = Number(new URLSearchParams(location.search).get('t'));
  if (hour) app.setHour(hour);

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    app.update(dt);
    app.render();
    updateUI();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.getElementById('loader').classList.add('done'));

  window.__lm = {
    ready: true,
    app,
    frames: () => app.frames,
    hour: () => app.hour(),
    setHour: (t) => app.setHour(t),
    goToHour: (i, d) => app.goToHour(i, d),
    preset: (name) => app.rig.jump(name),
    view: (pos, target) => {
      app.rig.camera.position.fromArray(pos);
      app.rig.controls.target.fromArray(target);
      app.rig.controls.update();
    },
    camera: () => ({ pos: app.camera.position.toArray(), target: app.rig.controls.target.toArray(), preset: app.rig.current }),
    resident: () => app.stream.resident(),
    pixelStats: () => app.pixelStats(),
    setQuality: (q) => app.setQuality(q),
  };
}

start();
