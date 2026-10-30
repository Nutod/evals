import raw from './data/osm.json';

/** Flat coordinate list [x0, z0, x1, z1, ...] in scene metres (+x east, -z north). */
export type Flat = number[];

export interface OsmBuilding {
  id: number;
  outer: Flat[];
  inner?: Flat[];
  h: number;
  mh?: number;
  k: string;
  name?: string;
  col?: string;
  mat?: string;
  roof?: string;
  roofCol?: string;
}

export interface OsmEdge {
  a: number;
  b: number;
  p: Flat;
  k: string;
  w?: number;
  o?: 1;
  br?: 1;
  n?: string;
  el?: 1;
}

export interface OsmArea {
  k: 'water' | 'park' | 'grass' | 'plaza' | 'fountain';
  outer: Flat[];
  inner?: Flat[];
}

export interface OsmStop {
  p: [number, number];
  k: 'tram' | 'bus' | 'shelter';
  n?: string;
  s?: 1;
}

export type LandmarkKey = 'fernsehturm' | 'parkinn' | 'weltzeituhr' | 'station' | 'rathaus' | 'marienkirche';

export interface OsmData {
  attribution: string;
  source: string;
  origin: [number, number];
  extent: [number, number];
  landmarks: Record<LandmarkKey, { outer: Flat[]; inner?: Flat[] }>;
  anchors: Record<'parkinnTower' | 'rathausTower' | 'marienTower' | 'marienNave', Flat>;
  buildings: OsmBuilding[];
  roads: OsmEdge[];
  rails: OsmEdge[];
  areas: OsmArea[];
  trees: Flat;
  lamps: Flat;
  benches: Flat;
  fountains: Flat;
  stops: OsmStop[];
}

export const osm = raw as unknown as OsmData;

const phi = (osm.origin[0] * Math.PI) / 180;
const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const M_PER_DEG_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);

/** Inverse of the bake projection, for the coordinate readout. */
export function toLatLon(x: number, z: number): [number, number] {
  return [osm.origin[0] - z / M_PER_DEG_LAT, osm.origin[1] + x / M_PER_DEG_LON];
}
