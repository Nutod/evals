import * as THREE from 'three';
import { pointInRing, toRing, type P2 } from '../core/geo';
import { osm } from '../data/osm';

export const LAYERS = [
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'streets', label: 'Streets & tracks' },
  { id: 'trees', label: 'Trees & parks' },
  { id: 'furniture', label: 'Street furniture' },
  { id: 'trams', label: 'Trams' },
  { id: 'trains', label: 'S-Bahn & trains' },
  { id: 'cars', label: 'Cars & buses' },
  { id: 'people', label: 'Pedestrians' },
  { id: 'labels', label: 'Labels' },
] as const;

export type LayerId = (typeof LAYERS)[number]['id'];

export interface Quality {
  name: 'low' | 'medium' | 'high';
  shadowMap: number;
  maxPixelRatio: number;
  people: number;
  cars: number;
  post: boolean;
}

export const QUALITY: Record<Quality['name'], Quality> = {
  low: { name: 'low', shadowMap: 1024, maxPixelRatio: 1, people: 90, cars: 40, post: false },
  medium: { name: 'medium', shadowMap: 2048, maxPixelRatio: 1.5, people: 180, cars: 70, post: true },
  high: { name: 'high', shadowMap: 2048, maxPixelRatio: 2, people: 320, cars: 110, post: true },
};

export type Updater = (dt: number, time: number) => void;

/** Everything scene builders share. */
export interface World {
  scene: THREE.Scene;
  camera: THREE.Camera;
  layers: Record<LayerId, THREE.Group>;
  /** Called with the speed-scaled simulation step; skipped while paused. */
  updaters: Updater[];
  /** Called every rendered frame, paused or not. */
  everyFrame: Updater[];
  quality: Quality;
  collision: Collision;
  /** Simulated seconds since midnight, kept current by the app. */
  clock: { dayTime: number };
  /** Places where people wait: platforms and stop shelters (x, y, z). */
  spots: [number, number, number][];
  /** Live counts and positions reported by the simulations. */
  sims: Record<string, { count: number; positions(): [number, number][] }>;
}

/** Point-in-footprint queries against a uniform grid, for walkers and the street camera. */
export class Collision {
  private readonly cell = 24;
  private readonly grid = new Map<number, P2[][]>();

  add(ring: P2[]): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    for (let i = Math.floor(minX / this.cell); i <= Math.floor(maxX / this.cell); i++) {
      for (let j = Math.floor(minZ / this.cell); j <= Math.floor(maxZ / this.cell); j++) {
        const k = this.key(i, j);
        const list = this.grid.get(k);
        if (list) list.push(ring);
        else this.grid.set(k, [ring]);
      }
    }
  }

  blocked(x: number, z: number): boolean {
    const list = this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!list) return false;
    for (const ring of list) if (pointInRing(x, z, ring)) return true;
    return false;
  }

  /** True when the straight walk from a to b stays clear of footprints. */
  clear(ax: number, az: number, bx: number, bz: number, step = 3): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i <= n; i++) {
      if (this.blocked(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    }
    return true;
  }

  private key(i: number, j: number): number {
    return (i + 512) * 2048 + (j + 512);
  }
}

/** Footprints people and the street camera cannot walk through. */
export function createCollision(): Collision {
  const collision = new Collision();
  for (const b of osm.buildings) if ((b.mh ?? 0) < 3) collision.add(toRing(b.p));
  for (const key of ['fernsehturm', 'parkInn', 'rathaus', 'marienkirche', 'station', 'weltzeituhr'] as const) collision.add(toRing(osm.landmarks[key].p));
  for (const a of osm.areas) if (a.k === 'fountain' || a.k === 'water') collision.add(toRing(a.p));
  return collision;
}

export function createWorld(scene: THREE.Scene, camera: THREE.Camera, quality: Quality, collision: Collision): World {
  const layers = {} as Record<LayerId, THREE.Group>;
  for (const { id } of LAYERS) {
    const g = new THREE.Group();
    g.name = id;
    layers[id] = g;
    scene.add(g);
  }
  return { scene, camera, layers, updaters: [], everyFrame: [], quality, collision, clock: { dayTime: 0 }, spots: [], sims: {} };
}

export const inBounds = (x: number, z: number, margin = 0): boolean =>
  Math.abs(x) <= osm.meta.halfExtent.x - margin && Math.abs(z) <= osm.meta.halfExtent.z - margin;
