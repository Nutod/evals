import * as THREE from 'three';
import './style.css';
import { createInterface, type Action, type ExplorerState } from './ui/interface';
import { createCity } from './world/city';
import { createLandmarks } from './world/landmarks';
import { createStreetLife } from './world/streetlife';
import { createLighting } from './scene/lighting';
import { createCamera } from './scene/camera';
import { createLabels } from './scene/labels';
import { LANDMARKS } from './world/landmark-data';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state: ExplorerState = {
  lighting: 'golden',
  view: 'perspective',
  landmark: null,
  paused: reducedMotion,
  orbit: false,
  labels: true,
  vegetation: true,
  traffic: true,
};
const ui = createInterface((action) => handleAction(action));
let renderer: THREE.WebGLRenderer;
let cameraRig: ReturnType<typeof createCamera>;
let lights: ReturnType<typeof createLighting>;
let city: ReturnType<typeof createCity>;
let life: ReturnType<typeof createStreetLife>;
let landmarks: ReturnType<typeof createLandmarks>;
let scene: THREE.Scene;
let ready = false;
let simulationTime = 0;
let frameCount = 0;
let disposed = false;

function showFallback(message: string) {
  const loader = document.querySelector<HTMLElement>('#loader')!;
  loader.classList.remove('loaded');
  loader.classList.add('error');
  loader.querySelector('h2')!.textContent = 'The city needs WebGL.';
  loader.querySelector('#loading-message')!.textContent = message;
  loader.querySelector('.loading-track')?.remove();
  loader.querySelector('.fallback-link')?.remove();
  const link = document.createElement('a');
  link.href = './';
  link.className = 'fallback-link';
  link.textContent = 'Try again';
  loader.querySelector('.loader-content')!.append(link);
}

function sync() {
  ui.update(state);
  if (!ready) return;
  life.vegetation.visible = state.vegetation;
  life.traffic.visible = state.traffic;
  cameraRig.controls.autoRotate = state.orbit && !state.paused;
}

async function capture() {
  const lighting = state.lighting;
  renderer.render(scene, cameraRig.camera);
  const canvas = document.createElement('canvas');
  canvas.width = renderer.domElement.width;
  canvas.height = renderer.domElement.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(renderer.domElement, 0, 0);
  const scale = renderer.getPixelRatio();
  const narrow = canvas.width / scale < 800;
  context.fillStyle = '#1d292ae8';
  context.fillRect(0, canvas.height - (narrow ? 52 : 36) * scale, canvas.width, (narrow ? 52 : 36) * scale);
  context.fillStyle = '#d6dfca';
  context.font = `${12 * scale}px sans-serif`;
  context.textBaseline = 'middle';
  context.fillText(
    'ALEXANDERPLATZ / BERLIN · Procedural reconstruction',
    16 * scale,
    canvas.height - (narrow ? 34 : 18) * scale,
  );
  context.textAlign = narrow ? 'left' : 'right';
  context.fillText(
    'Map data © OpenStreetMap contributors · ODbL',
    narrow ? 16 * scale : canvas.width - 16 * scale,
    canvas.height - (narrow ? 16 : 18) * scale,
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    ui.toast('Image capture is unavailable in this browser.');
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `alexanderplatz-${lighting}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  ui.toast('Scene image saved.');
}

function handleAction(action: Action) {
  if (!ready) return;
  if (action.type === 'landmark') {
    state.landmark = action.id;
    state.view = 'perspective';
    state.orbit = false;
    cameraRig.visit(action.id);
  } else if (action.type === 'lighting') {
    state.lighting = action.value;
    life.setNight(lights.set(action.value));
  } else if (action.type === 'view') {
    state.view = action.value;
    state.orbit = false;
    cameraRig.setView(action.value, state.landmark);
    if (action.value === 'street') ui.toast('Street-level preview. Facade details are approximate.');
  } else if (action.type === 'toggle') {
    state[action.key] = !state[action.key];
    if (action.key === 'paused' && state.paused) {
      cameraRig.controls.autoRotate = false;
      cameraRig.stopInertia();
    }
    if (action.key === 'vegetation') renderer.shadowMap.needsUpdate = true;
  } else if (action.type === 'reset') {
    state.landmark = null;
    state.view = 'perspective';
    state.orbit = false;
    cameraRig.overview();
  } else if (action.type === 'capture') {
    void capture().catch(() => ui.toast('Could not save the image. Please try again.'));
  } else if (action.type === 'fullscreen') {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.();
    if (request) void request.catch(() => ui.toast('Fullscreen is unavailable in this browser.'));
    else ui.toast('Fullscreen is unavailable in this browser.');
  }
  sync();
}

const keyboard = (event: KeyboardEvent) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.repeat ||
    document.querySelector<HTMLDialogElement>('#help-dialog')?.open
  )
    return;
  const target = event.target as HTMLElement;
  if (target.closest('input:not([type="checkbox"]), textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === ' ' && target.closest('button, a, summary, input[type="checkbox"]')) return;
  if (key >= '1' && key <= '6') handleAction({ type: 'landmark', id: LANDMARKS[Number(key) - 1].id });
  else if (key === ' ') {
    event.preventDefault();
    handleAction({ type: 'toggle', key: 'paused' });
  } else if (key === 'r') handleAction({ type: 'reset' });
  else if (key === 'l') handleAction({ type: 'toggle', key: 'labels' });
  else if (key === 't') {
    const values = ['day', 'golden', 'blue'] as const;
    handleAction({ type: 'lighting', value: values[(values.indexOf(state.lighting) + 1) % 3] });
  } else if (key === 'h' || key === '?') ui.openHelp();
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function boot() {
  await nextFrame();
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
  } catch {
    showFallback(
      'Enable hardware acceleration in your browser, then reload. A recent version of Chrome, Firefox or Safari works best.',
    );
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 761 ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute(
    'aria-label',
    '3D Alexanderplatz. Drag to orbit, scroll to zoom, right-drag to pan.',
  );
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (!disposed) {
      ready = false;
      renderer.setAnimationLoop(null);
      showFallback('The graphics context was interrupted. Close other graphics-heavy tabs and try again.');
    }
  });
  document.querySelector('#viewport')!.append(renderer.domElement);
  scene = new THREE.Scene();
  cameraRig = createCamera(renderer.domElement, () => {
    if (state.orbit) {
      state.orbit = false;
      sync();
    }
  });
  ui.loading(20, 'Tracing the streets of Mitte…');
  await nextFrame();
  city = createCity();
  scene.add(city.group);
  ui.loading(48, 'Raising Berlin’s landmarks…');
  await nextFrame();
  landmarks = createLandmarks();
  scene.add(landmarks.group);
  ui.loading(72, 'Bringing the square to life…');
  await nextFrame();
  life = createStreetLife();
  scene.add(life.group);
  lights = createLighting(scene, renderer);
  life.setNight(lights.set(state.lighting));
  const labels = createLabels(document.querySelector<HTMLElement>('#labels')!);
  document.querySelector('#building-count')!.textContent = `${city.count} BUILDINGS`;
  ui.loading(95, 'Finding the right perspective…');
  await nextFrame();
  ready = true;
  sync();
  renderer.shadowMap.needsUpdate = true;
  const compass = document.querySelector<SVGElement>('#compass')!;
  const scaleText = document.querySelector('#scale-text')!;
  let previousTime = performance.now();
  renderer.setAnimationLoop((time: number) => {
    const delta = document.hidden ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!state.paused) simulationTime += delta;
    landmarks.update(simulationTime);
    life.update(simulationTime);
    cameraRig.update(delta);
    renderer.render(scene, cameraRig.camera);
    frameCount++;
    labels.update(cameraRig.camera, state.labels, state.landmark);
    if (frameCount % 3 === 0) {
      compass.style.transform = `rotate(${cameraRig.controls.getAzimuthalAngle()}rad)`;
      const metres =
        ((cameraRig.controls.getDistance() *
          Math.tan(THREE.MathUtils.degToRad(cameraRig.camera.fov / 2)) *
          2) /
          window.innerHeight) *
        (window.innerWidth < 761 ? 48 : 64);
      scaleText.textContent = `${Math.max(1, Math.round(metres / (metres > 50 ? 10 : 1)) * (metres > 50 ? 10 : 1))} m`;
    }
  });
  ui.ready();
  document.addEventListener('keydown', keyboard);
  window.addEventListener('resize', resize);
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __ATLAS__: {
        scene,
        renderer,
        camera: cameraRig.camera,
        controls: cameraRig.controls,
        getState: () => ({ ...state }),
        isTravelling: cameraRig.isTravelling,
        getLandmarkDiagnostics: (id: string) => {
          const place = LANDMARKS.find((p) => p.id === id)!;
          const bounds = new THREE.Box3().setFromObject(landmarks.byId.get(id)!);
          const target = new THREE.Vector3(place.position[0], place.targetHeight, place.position[1]);
          const direction = target.clone().sub(cameraRig.camera.position);
          const ray = new THREE.Raycaster(
            cameraRig.camera.position,
            direction.clone().normalize(),
            0.1,
            direction.length() - 1,
          );
          return {
            height: bounds.max.y - bounds.min.y,
            blockedByBuilding: ray.intersectObject(city.buildings, true).length > 0,
          };
        },
        getMetrics: () => ({
          time: simulationTime,
          frames: frameCount,
          buildings: city.count,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        }),
      },
    });
  }
}

function resize() {
  if (!ready) return;
  const { camera } = cameraRig;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 761 ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

void boot().catch((error) => {
  console.error('The city could not be constructed.', error);
  showFallback('The scene could not finish loading. Reload the page to rebuild it.');
});

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    renderer?.setAnimationLoop(null);
    cameraRig?.controls.dispose();
    lights?.dispose();
    document.removeEventListener('keydown', keyboard);
    window.removeEventListener('resize', resize);
    scene?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of materials) mat.dispose();
      }
    });
    renderer?.dispose();
  });
