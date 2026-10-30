import * as THREE from 'three';
import './ui/styles.css';
import { App, detectQuality, type LayerKey } from './app';
import { bindUI } from './ui/ui';
import type { CameraMode } from './camera/rig';
import type { LightPreset } from './scene/lighting';
import type { LandmarkKey } from './osm';

declare global {
  interface Window {
    /** Inspection hook used by the browser tests. */
    __alex?: {
      ready: boolean;
      frames: () => number;
      state: () => ReturnType<App['rig']['state']>;
      setMode: (mode: CameraMode) => void;
      flyTo: (key: LandmarkKey, duration?: number) => void;
      view: (focus: [number, number, number], distance: number, bearing: number, elevation: number) => void;
      setLighting: (preset: LightPreset) => void;
      setLayer: (layer: LayerKey, visible: boolean) => void;
      lighting: () => LightPreset;
      layerVisible: (layer: LayerKey) => boolean;
      simTime: () => number;
      exportPNG: () => Promise<string>;
      pixelStats: () => ReturnType<App['pixelStats']>;
      landmarks: () => { key: LandmarkKey; focus: number[]; distance: number }[];
      error?: string;
    };
  }
}

async function start() {
  const loaderText = document.getElementById('loader-text')!;
  const viewport = document.getElementById('viewport')!;
  let app: App;
  try {
    app = new App(viewport, detectQuality());
  } catch (err) {
    loaderText.textContent = 'WebGL is not available in this browser, so the 3D map cannot be shown.';
    window.__alex = { error: String(err) } as Window['__alex'];
    return;
  }
  await app.build((label) => (loaderText.textContent = label));
  bindUI(app);
  document.getElementById('loader')!.classList.add('done');
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
  window.__alex = {
    ready: true,
    frames: () => app.frames,
    state: () => app.rig.state(),
    setMode: (mode) => app.setMode(mode),
    flyTo: (key, duration) => app.flyTo(key, duration),
    view: (focus, distance, bearing, elevation) =>
      app.rig.flyTo({ focus: new THREE.Vector3(...focus), distance, bearing, elevation, street: { from: new THREE.Vector2(focus[0], focus[2]), lookAt: new THREE.Vector3(...focus) } }, 0.01),
    setLighting: (preset) => app.setLighting(preset),
    setLayer: (layer, visible) => app.setLayer(layer, visible),
    lighting: () => app.lighting.current,
    layerVisible: (layer) => app.isVisible(layer),
    simTime: () => app.simTime,
    pixelStats: () => app.pixelStats(),
    landmarks: () => app.landmarks.map((l) => ({ key: l.key, focus: l.view.focus.toArray(), distance: l.view.distance })),
    exportPNG: async () => {
      const blob = await app.exportPNG();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return btoa(String.fromCharCode(...bytes.subarray(0, 64)));
    },
  };
}

start();
