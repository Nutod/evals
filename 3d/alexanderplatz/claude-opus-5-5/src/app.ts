import * as THREE from 'three';
import { osm, toLatLon, type LandmarkKey } from './osm';
import { CameraRig, type CameraMode } from './camera/rig';
import { setMaxAnisotropy } from './lib/textures';
import { buildBuildings } from './scene/buildings';
import { buildFurniture } from './scene/furniture';
import { buildGround } from './scene/ground';
import { Lighting, type LightPreset } from './scene/lighting';
import { buildStreets } from './scene/streets';
import { buildTrees } from './scene/trees';
import { findViewpoint } from './scene/sightlines';
import { toRing } from './lib/geom';
import type { Landmark } from './scene/landmarks/common';
import { buildFernsehturm } from './scene/landmarks/fernsehturm';
import { buildMarienkirche } from './scene/landmarks/marienkirche';
import { buildParkInn } from './scene/landmarks/parkinn';
import { buildRathaus } from './scene/landmarks/rathaus';
import { buildStation } from './scene/landmarks/station';
import { buildWeltzeituhr } from './scene/landmarks/weltzeituhr';
import { buildRailTraffic } from './sim/rail';
import { Pedestrians, RoadTraffic } from './sim/road';

export const LAYERS = {
  buildings: 'Buildings',
  landmarks: 'Landmarks',
  streets: 'Streets',
  trees: 'Trees',
  furniture: 'Furniture',
  trams: 'Trams',
  trains: 'S-Bahn',
  cars: 'Traffic',
  pedestrians: 'Pedestrians',
  labels: 'Labels',
  shadows: 'Shadows',
} as const;
export type LayerKey = keyof typeof LAYERS;

export interface Quality {
  pixelRatio: number;
  shadowSize: number;
  antialias: boolean;
  cars: number;
  buses: number;
  pedestrians: number;
}

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search);
  if (params.get('quality') === 'low') return { pixelRatio: 1, shadowSize: 1024, antialias: false, cars: 80, buses: 4, pedestrians: 160 };
  const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  return coarse
    ? { pixelRatio: Math.min(devicePixelRatio, 1.75), shadowSize: 2048, antialias: true, cars: 110, buses: 6, pedestrians: 280 }
    : { pixelRatio: Math.min(devicePixelRatio, 2), shadowSize: 4096, antialias: true, cars: 170, buses: 8, pedestrians: 450 };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly lighting: Lighting;
  landmarks: Landmark[] = [];
  playing = true;
  speed = 1;
  /** Simulated seconds since load (drives every animation). */
  simTime = 0;
  frames = 0;
  ready = false;
  private layers = new Map<LayerKey, THREE.Object3D[]>();
  private updaters: ((dt: number) => void)[] = [];
  private timer = new THREE.Timer();
  private hidden = new Set<LayerKey>();
  private frameListeners: (() => void)[] = [];

  constructor(private container: HTMLElement, readonly quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    const bounds = new THREE.Vector2(osm.extent[0], osm.extent[1]);
    this.rig = new CameraRig(this.renderer.domElement, bounds);
    this.lighting = new Lighting(this.scene, this.renderer, quality.shadowSize);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  /** Builds the city in stages, yielding between them so the loader can repaint. */
  async build(progress: (label: string) => void) {
    const stage = async <T>(label: string, fn: () => T): Promise<T> => {
      progress(label);
      await nextFrame();
      return fn();
    };
    this.scene.add(await stage('Laying out streets and squares…', buildGround));
    const streets = await stage('Routing roads, tram tracks and the Stadtbahn viaduct…', buildStreets);
    this.scene.add(streets);
    const buildings = await stage(`Extruding ${osm.buildings.length} OSM buildings…`, buildBuildings);
    this.scene.add(buildings);
    this.landmarks = await stage('Modelling the landmarks…', () => [
      buildFernsehturm(), buildParkInn(), buildWeltzeituhr(), buildStation(), buildRathaus(), buildMarienkirche(),
    ]);
    const landmarkGroup = new THREE.Group();
    landmarkGroup.name = 'landmarks';
    for (const l of this.landmarks) landmarkGroup.add(l.object);
    this.scene.add(landmarkGroup);
    const trees = await stage(`Planting ${osm.trees.length / 2} trees…`, buildTrees);
    const furniture = await stage('Placing lamps, benches and shelters…', buildFurniture);
    this.scene.add(trees, furniture.group);

    const station = this.landmarks.find((l) => l.key === 'station')!;
    const clock = this.landmarks.find((l) => l.key === 'weltzeituhr')!;
    const rail = await stage('Scheduling trams and S-Bahn trains…', () => buildRailTraffic(new THREE.Vector2(station.view.focus.x, station.view.focus.z)));
    const road = await stage('Releasing traffic and pedestrians…', () => ({
      traffic: new RoadTraffic(this.quality.cars, this.quality.buses),
      people: new Pedestrians(this.quality.pedestrians, new THREE.Vector2(clock.view.focus.x, clock.view.focus.z)),
    }));
    this.scene.add(rail.trams.group, rail.sbahn.group, rail.regional.group, road.traffic.cars, road.people.group);

    this.layers.set('buildings', [buildings]);
    this.layers.set('landmarks', [landmarkGroup]);
    this.layers.set('streets', [streets]);
    this.layers.set('trees', [trees]);
    this.layers.set('furniture', [furniture.group]);
    this.layers.set('trams', [rail.trams.group]);
    this.layers.set('trains', [rail.sbahn.group, rail.regional.group]);
    this.layers.set('cars', [road.traffic.cars]);
    this.layers.set('pedestrians', [road.people.group]);

    this.updaters.push(
      (dt) => rail.trams.update(dt),
      (dt) => rail.sbahn.update(dt),
      (dt) => rail.regional.update(dt),
      (dt) => road.traffic.update(dt),
      (dt) => {
        road.people.avoid = this.rig.mode === 'street' ? this.rig.street.position : null;
        road.people.update(dt);
      },
      (dt) => this.landmarks.forEach((l) => l.update?.(this.simTime, dt)),
    );
    // Prime vehicle positions so the first frame is populated.
    for (const u of this.updaters) u(0.016);

    const ground = this.scene.getObjectByName('ground-plane')!;
    this.rig.pick = (ray) => {
      const targets = [buildings, landmarkGroup, ground].filter((o) => o.visible);
      return ray.intersectObjects(targets, true)[0]?.point ?? null;
    };

    this.flyTo('fernsehturm', 0);
    this.ready = true;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  onFrame(fn: () => void) {
    this.frameListeners.push(fn);
  }

  private tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.playing) {
      const simDt = dt * this.speed;
      this.simTime += simDt;
      for (const u of this.updaters) u(simDt);
    }
    this.rig.update(dt);
    this.lighting.update(dt, this.rig.focus(), this.rig.viewRadius(), this.rig.camera);
    this.renderer.render(this.scene, this.rig.camera);
    this.frames++;
    for (const fn of this.frameListeners) fn();
  }

  setMode(mode: CameraMode) {
    this.rig.setMode(mode);
    if (mode !== 'street') return;
    // Step out of any building the hand-off put us in and face open space.
    const street = this.rig.street;
    const ahead = street.forward().multiplyScalar(40).add(street.position);
    const eye = findViewpoint(ahead, new THREE.Vector3(ahead.x, 10, ahead.y), street.position.clone(), 5);
    street.set(eye, new THREE.Vector3(ahead.x, 6, ahead.y));
    street.apply();
  }

  setLighting(preset: LightPreset) {
    this.lighting.set(preset);
  }

  flyTo(key: LandmarkKey, duration = 1.8) {
    const landmark = this.landmarks.find((l) => l.key === key);
    if (!landmark) return;
    if (this.rig.mode === 'street') this.resolveStreetView(landmark);
    if (duration === 0) {
      this.rig.flyTo(landmark.view, 0.0001);
      this.rig.update(1);
    } else this.rig.flyTo(landmark.view, duration);
  }

  private resolvedViews = new Set<LandmarkKey>();

  /** Replaces the authored street eye point with one that has a clear line of sight. */
  private resolveStreetView(l: Landmark) {
    if (this.resolvedViews.has(l.key)) return;
    this.resolvedViews.add(l.key);
    const center = new THREE.Vector2(l.labelAt.x, l.labelAt.z);
    const radius = Math.min(60, Math.max(...osm.landmarks[l.key].outer.flatMap((f) => toRing(f).map((p) => p.distanceTo(center)))));
    const probe = l.view.street.lookAt.clone().setY(l.view.street.lookAt.y * 0.5);
    l.view.street.from = findViewpoint(center, probe, l.view.street.from, radius + 4);
  }

  isVisible(layer: LayerKey) {
    return !this.hidden.has(layer);
  }

  setLayer(layer: LayerKey, visible: boolean) {
    if (visible) this.hidden.delete(layer); else this.hidden.add(layer);
    if (layer === 'shadows') this.renderer.shadowMap.enabled = visible;
    if (layer === 'shadows') this.scene.traverse((o) => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).needsUpdate = true; });
    for (const object of this.layers.get(layer) ?? []) object.visible = visible;
  }

  coordinates(): [number, number] {
    const f = this.rig.focus();
    return toLatLon(f.x, f.z);
  }

  /** Renders a frame and summarises its pixels (used by the browser tests to verify real output). */
  pixelStats() {
    this.renderer.render(this.scene, this.rig.camera);
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r = 0, g = 0, b = 0, l2 = 0, n = 0;
    const buckets = new Set<number>();
    for (let i = 0; i < px.length; i += 4 * 7) {
      r += px[i]; g += px[i + 1]; b += px[i + 2];
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      l2 += l * l;
      n++;
      buckets.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    }
    const mean = [r / n, g / n, b / n];
    const luminance = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    return { width: w, height: h, mean, luminance, std: Math.sqrt(Math.max(0, l2 / n - luminance * luminance)), colors: buckets.size };
  }

  /** Renders the current view and returns it as a PNG with the attribution burned in. */
  async exportPNG(): Promise<Blob> {
    this.renderer.render(this.scene, this.rig.camera);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const scale = out.height / 900;
    const pad = 12 * scale;
    const text = '© OpenStreetMap contributors (ODbL) · Procedural model of Alexanderplatz, Berlin; details approximate';
    ctx.font = `500 ${Math.round(13 * scale)}px 'IBM Plex Sans', Arial, sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(11, 31, 25, 0.78)';
    ctx.fillRect(out.width - w - pad * 2, out.height - 30 * scale, w + pad * 2, 30 * scale);
    ctx.fillStyle = '#e6efe9';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, out.width - w - pad, out.height - 15 * scale);
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  }
}
