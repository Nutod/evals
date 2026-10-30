import * as THREE from 'three';
import { osm, type LandmarkKey } from '../../osm';
import { centroid, orient, orientedFrame, toRing, type Frame, type Ring } from '../../lib/geom';

export interface LandmarkView {
  /** Point the camera orbits around. */
  focus: THREE.Vector3;
  distance: number;
  /** Compass bearing the camera looks from (deg, 0 = from north). */
  bearing: number;
  /** Elevation angle above the horizon (deg). */
  elevation: number;
  /** Street-level camera: eye position (x, z) and the point to look at. */
  street: { from: THREE.Vector2; lookAt: THREE.Vector3 };
}

export interface Landmark {
  key: LandmarkKey;
  name: string;
  detail: string;
  object: THREE.Object3D;
  /** Anchor for the floating map label. */
  labelAt: THREE.Vector3;
  view: LandmarkView;
  update?: (time: number, dt: number) => void;
}

export const footprint = (key: LandmarkKey): { outer: Ring[]; inner: Ring[] } => ({
  outer: osm.landmarks[key].outer.map((f) => orient(toRing(f))),
  inner: (osm.landmarks[key].inner ?? []).map((f) => orient(toRing(f), true)),
});

export const anchorFrame = (key: keyof typeof osm.anchors): Frame => orientedFrame(orient(toRing(osm.anchors[key])));
export const anchorCenter = (key: keyof typeof osm.anchors) => centroid(toRing(osm.anchors[key]));

/** Positions a group built along local +x so it matches a ground frame. */
export function placeOnFrame(object: THREE.Object3D, frame: Pick<Frame, 'center' | 'angle'>) {
  object.position.set(frame.center.x, 0, frame.center.y);
  object.rotation.y = -frame.angle;
}

/** Converts a local (x, z) offset in a frame to world ground coordinates. */
export function frameToWorld(frame: Pick<Frame, 'center' | 'angle'>, x: number, z: number): THREE.Vector2 {
  const c = Math.cos(frame.angle), s = Math.sin(frame.angle);
  return new THREE.Vector2(frame.center.x + x * c - z * s, frame.center.y + x * s + z * c);
}

/** Street eye point `distance` metres from `target` along a compass bearing. */
export function streetFrom(target: THREE.Vector2, bearing: number, distance: number): THREE.Vector2 {
  const a = THREE.MathUtils.degToRad(bearing);
  return new THREE.Vector2(target.x + Math.sin(a) * distance, target.y - Math.cos(a) * distance);
}

export function shadowed<T extends THREE.Object3D>(object: T, cast = true): T {
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = true;
    }
  });
  return object;
}

/** Repeating texture helper that sets repeat in one call. */
export function repeat<T extends THREE.Texture>(t: T, u: number, v: number): T {
  t.repeat.set(u, v);
  return t;
}
