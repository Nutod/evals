import raw from './osm.json';

/** Flat coordinate list: x0, z0, x1, z1, … in metres from the scene origin. */
export type Flat = number[];

export interface OsmBuilding {
  p: Flat;
  hs?: Flat[];
  h: number;
  mh?: number;
  rs?: string;
  rh?: number;
  c?: string;
  rc?: string;
  m?: string;
  k: string;
  n?: string;
}

export interface OsmLandmarkPart {
  p: Flat;
  h?: number;
  mh?: number;
  k?: string;
  rs?: string;
  n?: string;
}

export interface OsmLandmark {
  p: Flat;
  hs?: Flat[];
  parts: OsmLandmarkPart[];
}

export type RoadKind = 'primary' | 'secondary' | 'tertiary' | 'residential' | 'service';
export interface OsmRoad {
  p: Flat;
  a: number;
  b: number;
  k: RoadKind;
  w: number;
  l: number;
  o?: 1 | -1;
  n?: string;
  br?: 1;
  bp?: 1;
}

export type PathKind = 'foot' | 'pedestrian' | 'cycle' | 'steps';
export interface OsmPath {
  p: Flat;
  a: number;
  b: number;
  k: PathKind;
  w: number;
  n?: string;
  bp?: 1;
}

export interface OsmTram {
  p: Flat;
  a: number;
  b: number;
  s?: 1;
}

export type AreaKind = 'water' | 'park' | 'grass' | 'scrub' | 'sand' | 'construction' | 'plaza' | 'fountain' | 'platform';
export interface OsmArea {
  k: AreaKind;
  p: Flat;
  hs?: Flat[];
  n?: string;
}

export interface OsmStop {
  x: number;
  z: number;
  n: string;
}

export type LandmarkKey = 'fernsehturm' | 'parkInn' | 'weltzeituhr' | 'station' | 'rathaus' | 'marienkirche' | 'neptunbrunnen' | 'voelkerbrunnen';

export interface OsmData {
  meta: {
    origin: { lat: number; lon: number };
    metresPerDegree: { lat: number; lon: number };
    halfExtent: { x: number; z: number };
    osmBase: string;
    attribution: string;
  };
  landmarks: Record<LandmarkKey, OsmLandmark>;
  buildings: OsmBuilding[];
  roads: OsmRoad[];
  paths: OsmPath[];
  tram: OsmTram[];
  rail: { s: Flat[]; r: Flat[]; viaduct: number[] };
  areas: OsmArea[];
  /** x, z, tagged height (0 when unknown) */
  trees: number[];
  lamps: number[];
  /** x, z, compass direction in degrees (-1 when unknown) */
  benches: number[];
  signals: number[];
  tramStops: OsmStop[];
  busStops: OsmStop[];
  subwayEntrances: OsmStop[];
  shelters: number[];
}

export const osm = raw as unknown as OsmData;

/** Scene metres back to WGS84, for the coordinate readout. */
export function toLatLon(x: number, z: number): { lat: number; lon: number } {
  const { origin, metresPerDegree: m } = osm.meta;
  return { lat: origin.lat - z / m.lat, lon: origin.lon + x / m.lon };
}

export function fromLatLon(lat: number, lon: number): [number, number] {
  const { origin, metresPerDegree: m } = osm.meta;
  return [(lon - origin.lon) * m.lon, -(lat - origin.lat) * m.lat];
}
