// Bakes an OpenStreetMap extract of Alexanderplatz into src/data/osm.json.
// Build-time only: the app never talks to Overpass. Raw responses are cached
// in .osm-cache/; pass --fresh to download again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheFile = path.join(root, '.osm-cache/raw.json');
const outFile = path.join(root, 'src/data/osm.json');

const ORIGIN = { lat: 52.5211, lon: 13.41175 };
const BBOX = [52.515, 13.4005, 52.5272, 13.423];
const HALF_X = 690;
const HALF_Z = 640;

const QUERY = `[out:json][timeout:120][bbox:${BBOX.join(',')}];
(
  way[building]; relation[building];
  way["building:part"]; relation["building:part"];
  way[highway];
  way[railway~"^(tram|rail|light_rail|platform)$"];
  node[railway~"^(tram_stop|subway_entrance)$"];
  node[natural=tree];
  node[amenity~"^(bench|shelter)$"];
  way[amenity~"^(fountain|shelter)$"]; relation[amenity=fountain];
  node[highway~"^(street_lamp|bus_stop|traffic_signals)$"];
  way[public_transport=platform];
  way[leisure~"^(park|garden|playground)$"]; relation[leisure~"^(park|garden)$"];
  way[landuse~"^(grass|flowerbed|village_green|construction)$"];
  way[natural~"^(water|scrub|wood)$"]; relation[natural=water];
  relation[highway=pedestrian];
);
out body geom qt;`;

async function loadRaw() {
  if (!process.argv.includes('--fresh') && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'osm-bake-script/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, text);
  return JSON.parse(text);
}

// ---------- projection (local tangent plane, x east, z south) ----------
const phi = (ORIGIN.lat * Math.PI) / 180;
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const M_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const project = (lat, lon) => [(lon - ORIGIN.lon) * M_LON, -(lat - ORIGIN.lat) * M_LAT];
const r1 = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap((p) => [r1(p[0]), r1(p[1])]);
const inScene = (p, m = 0) => Math.abs(p[0]) <= HALF_X + m && Math.abs(p[1]) <= HALF_Z + m;

// ---------- polygon helpers ----------
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
function centroid(r) {
  let x = 0, z = 0;
  for (const p of r) { x += p[0]; z += p[1]; }
  return [x / r.length, z / r.length];
}
function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function openRing(pts) {
  const r = pts.slice();
  const a = r[0], b = r[r.length - 1];
  if (r.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) r.pop();
  // drop consecutive duplicates after rounding
  return r.filter((p, i) => {
    const q = r[(i + r.length - 1) % r.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05;
  });
}
const geomPts = (g) => g.map((n) => project(n.lat, n.lon));

/** Stitches relation member ways into closed rings. */
function stitch(members) {
  const segs = members.filter((m) => m.geometry?.length > 1).map((m) => geomPts(m.geometry));
  const rings = [];
  const key = (p) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`;
  while (segs.length) {
    let cur = segs.pop();
    for (let guard = 0; guard < 1000 && key(cur[0]) !== key(cur[cur.length - 1]); guard++) {
      const end = key(cur[cur.length - 1]);
      const i = segs.findIndex((s) => key(s[0]) === end || key(s[s.length - 1]) === end);
      if (i < 0) break;
      let next = segs.splice(i, 1)[0];
      if (key(next[0]) !== end) next = next.reverse();
      cur = cur.concat(next.slice(1));
    }
    if (cur.length >= 4) rings.push(openRing(cur));
  }
  return rings;
}

/** Returns [{outer, holes}] for a way or multipolygon relation. */
function polygonsOf(e) {
  if (e.type === 'way') {
    if (!e.geometry || e.geometry.length < 4) return [];
    const first = e.geometry[0], last = e.geometry[e.geometry.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) return [];
    return [{ outer: openRing(geomPts(e.geometry)), holes: [] }];
  }
  if (e.type !== 'relation') return [];
  const outers = stitch(e.members.filter((m) => m.type === 'way' && m.role !== 'inner'));
  const inners = stitch(e.members.filter((m) => m.type === 'way' && m.role === 'inner'));
  return outers.map((outer) => ({ outer, holes: inners.filter((h) => pointInRing(h[0], outer)) }));
}

const num = (v) => {
  if (v == null) return undefined;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

// ---------- landmarks: matched by OSM id, their buildings are hand-modelled ----------
const LANDMARKS = {
  fernsehturm: { type: 'way', id: 556435241 },
  parkInn: { type: 'way', id: 23723125 },
  weltzeituhr: { type: 'way', id: 417529567 },
  station: { type: 'way', id: 20144781 },
  rathaus: { type: 'relation', id: 4211905 },
  marienkirche: { type: 'way', id: 474111581 },
  neptunbrunnen: { type: 'way', id: 23813204 },
  voelkerbrunnen: { type: 'way', id: 52564405 },
};

const raw = await loadRaw();
const E = raw.elements;

const landmarks = {};
for (const [name, ref] of Object.entries(LANDMARKS)) {
  const e = E.find((x) => x.type === ref.type && x.id === ref.id);
  if (!e) throw new Error(`landmark ${name} missing from extract`);
  const poly = polygonsOf(e)[0];
  if (ringArea(poly.outer) < 0) poly.outer.reverse();
  landmarks[name] = { outer: poly.outer, holes: poly.holes, parts: [] };
}
const landmarkAt = (p) => Object.keys(landmarks).find((k) => pointInRing(p, landmarks[k].outer));

// ---------- buildings ----------
const LEVEL_H = 3.3;
const DEFAULT_H = { garage: 3, garages: 3, shed: 3, kiosk: 3.5, roof: 4, service: 4, retail: 12, church: 22, hotel: 24 };
const buildings = [];
const outlines = [];
const parts = [];
for (const e of E) {
  const t = e.tags || {};
  const isPart = !!t['building:part'] && t['building:part'] !== 'no';
  const isBuilding = !!t.building && t.building !== 'no';
  if (!isPart && !isBuilding) continue;
  if (t.location === 'underground' || num(t.layer) < 0) continue;
  for (const poly of polygonsOf(e)) {
    if (poly.outer.length < 3) continue;
    if (ringArea(poly.outer) < 0) poly.outer.reverse();
    const c = centroid(poly.outer);
    if (!inScene(c, 40)) continue;
    const levels = num(t['building:levels']);
    const roofH = num(t['roof:height']) ?? 0;
    let height = num(t.height);
    const kind = isPart ? t['building:part'] : t.building;
    if (height == null && levels != null) height = levels * LEVEL_H + roofH + 0.6;
    const rec = {
      id: e.id,
      outer: poly.outer,
      holes: poly.holes.map((h) => (ringArea(h) > 0 ? h.slice().reverse() : h)),
      height,
      minHeight: num(t.min_height) ?? (num(t['building:min_level']) ?? 0) * LEVEL_H,
      roofShape: t['roof:shape'],
      roofHeight: roofH,
      colour: t['building:colour'],
      roofColour: t['roof:colour'],
      material: t['building:material'],
      kind,
      name: t.name,
      area: Math.abs(ringArea(poly.outer)),
      c,
    };
    (isPart && !isBuilding ? parts : outlines).push(rec);
  }
}

// Simple 3D Buildings rule: an outline that contains parts is replaced by them.
for (const o of outlines) {
  const lm = landmarkAt(o.c) ?? landmarkAt(o.outer[0]);
  if (lm && !['neptunbrunnen', 'voelkerbrunnen'].includes(lm)) {
    landmarks[lm].parts.push(o);
    continue;
  }
  const inside = parts.filter((p) => !p.used && pointInRing(p.c, o.outer));
  const covered = inside.reduce((s, p) => s + (p.minHeight < 1 ? p.area : 0), 0);
  if (inside.length && covered > o.area * 0.5) {
    for (const p of inside) {
      p.used = true;
      p.height ??= o.height;
      p.kind = p.kind === 'yes' ? o.kind : p.kind;
      p.colour ??= o.colour;
      p.material ??= o.material;
      p.name ??= undefined;
    }
    // carry the name on the largest part so labels still work
    inside.sort((a, b) => b.area - a.area)[0].name ??= o.name;
    continue;
  }
  buildings.push(o);
}
for (const p of parts) {
  const lm = landmarkAt(p.c);
  if (lm) landmarks[lm].parts.push(p);
  else buildings.push(p);
}
for (const b of buildings) b.height ??= DEFAULT_H[b.kind] ?? 15;

const bakedBuildings = buildings
  .filter((b) => b.height - b.minHeight > 0.5 && b.area > 6)
  .map((b) => ({
    p: flat(b.outer),
    ...(b.holes.length ? { hs: b.holes.map(flat) } : {}),
    h: r1(b.height),
    ...(b.minHeight ? { mh: r1(b.minHeight) } : {}),
    ...(b.roofShape && b.roofShape !== 'flat' ? { rs: b.roofShape, rh: r1(b.roofHeight || 0) } : {}),
    ...(b.colour ? { c: b.colour } : {}),
    ...(b.roofColour ? { rc: b.roofColour } : {}),
    ...(b.material ? { m: b.material } : {}),
    k: b.kind,
    ...(b.name ? { n: b.name } : {}),
  }));

// ---------- linear networks, split at shared nodes ----------
function splitNetwork(ways) {
  const uses = new Map();
  for (const w of ways) {
    w.nodes.forEach((id, i) => {
      const end = i === 0 || i === w.nodes.length - 1;
      uses.set(id, (uses.get(id) ?? 0) + (end ? 1 : 2));
    });
  }
  // nodes used by several ways (or a way end meeting a way middle) become graph nodes
  const count = new Map();
  for (const w of ways) for (const id of new Set(w.nodes)) count.set(id, (count.get(id) ?? 0) + 1);
  const nodeIndex = new Map();
  const idx = (id) => {
    if (!nodeIndex.has(id)) nodeIndex.set(id, nodeIndex.size);
    return nodeIndex.get(id);
  };
  const out = [];
  for (const w of ways) {
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      const last = i === w.nodes.length - 1;
      if (!last && count.get(w.nodes[i]) < 2) continue;
      const pts = geomPts(w.geometry.slice(start, i + 1));
      if (pts.some((p) => inScene(p, 60))) {
        out.push({ way: w, pts, a: idx(w.nodes[start]), b: idx(w.nodes[i]) });
      }
      start = i;
    }
  }
  return out;
}

const ROAD_KINDS = {
  motorway: 'primary', trunk: 'primary', primary: 'primary', primary_link: 'primary',
  secondary: 'secondary', secondary_link: 'secondary', tertiary: 'tertiary', tertiary_link: 'tertiary',
  residential: 'residential', living_street: 'residential', unclassified: 'residential', service: 'service',
};
const PATH_KINDS = { footway: 'foot', path: 'foot', pedestrian: 'pedestrian', cycleway: 'cycle', steps: 'steps' };
const WIDTH = { primary: 3.4, secondary: 3.3, tertiary: 3.2, residential: 3.0, service: 3.2 };

const roadWays = [], pathWays = [], tramWays = [], railWays = [];
for (const e of E) {
  if (e.type !== 'way' || !e.geometry) continue;
  const t = e.tags || {};
  const underground = t.tunnel === 'yes' || num(t.layer) < 0 || t.indoor === 'yes' || t.level?.startsWith?.('-');
  if (t.highway && t.area !== 'yes') {
    if (underground) continue;
    if (ROAD_KINDS[t.highway]) {
      if (t.highway === 'service' && ['parking_aisle', 'driveway'].includes(t.service)) continue;
      if (t.access === 'private') continue;
      roadWays.push(e);
    } else if (PATH_KINDS[t.highway]) pathWays.push(e);
  }
  if (t.railway === 'tram') tramWays.push(e);
  if (t.railway === 'rail' || t.railway === 'light_rail') railWays.push(e);
}

const roads = splitNetwork(roadWays).map(({ way, pts, a, b }) => {
  const t = way.tags;
  const k = ROAD_KINDS[t.highway];
  const oneway = t.oneway === 'yes' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0;
  const lanes = num(t.lanes) ?? (oneway ? (k === 'primary' ? 2 : 1) : 2);
  const width = Math.min(num(t.width) ?? lanes * WIDTH[k] + (k === 'service' ? 0 : 1), 24);
  return {
    p: flat(pts), a, b, k, w: r1(width), l: lanes,
    ...(oneway ? { o: oneway } : {}),
    ...(t.name ? { n: t.name } : {}),
    ...(t.bridge ? { br: 1 } : {}),
    ...(t.tunnel === 'building_passage' ? { bp: 1 } : {}),
  };
});
const paths = splitNetwork(pathWays).map(({ way, pts, a, b }) => {
  const t = way.tags;
  const k = PATH_KINDS[t.highway];
  return {
    p: flat(pts), a, b, k,
    w: r1(Math.min(num(t.width) ?? (k === 'pedestrian' ? 6 : k === 'steps' ? 2.4 : 2.2), 14)),
    ...(t.name && k === 'pedestrian' ? { n: t.name } : {}),
    ...(t.tunnel === 'building_passage' || t.covered === 'yes' ? { bp: 1 } : {}),
  };
});
const tram = splitNetwork(tramWays).map(({ way, pts, a, b }) => ({
  p: flat(pts), a, b, ...(way.tags.service ? { s: 1 } : {}),
}));

// ---------- Stadtbahn: chain each track into one polyline ----------
function chainTracks(ways) {
  const main = ways.filter((w) => !w.tags.service);
  const ends = new Map();
  for (const w of main) for (const id of [w.nodes[0], w.nodes.at(-1)]) ends.set(id, [...(ends.get(id) ?? []), w]);
  const used = new Set();
  const chains = [];
  const starts = main.filter((w) => ends.get(w.nodes[0]).length === 1 || ends.get(w.nodes.at(-1)).length === 1);
  for (const s of starts) {
    if (used.has(s)) continue;
    let pts = geomPts(s.geometry);
    let tail = s.nodes.at(-1);
    if (ends.get(s.nodes[0]).length !== 1) { pts.reverse(); tail = s.nodes[0]; }
    used.add(s);
    for (;;) {
      const next = (ends.get(tail) ?? []).find((w) => !used.has(w));
      if (!next) break;
      used.add(next);
      let g = geomPts(next.geometry);
      if (next.nodes[0] === tail) tail = next.nodes.at(-1);
      else { g.reverse(); tail = next.nodes[0]; }
      pts = pts.concat(g.slice(1));
    }
    chains.push(pts);
  }
  return chains;
}
const polyLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
// orient every chain west → east so track order is comparable
const orient = (c) => (c[0][0] > c.at(-1)[0] ? c.slice().reverse() : c);
const sChains = chainTracks(railWays.filter((w) => w.tags.railway === 'light_rail')).filter((c) => polyLength(c) > 600).map(orient);
const rChains = chainTracks(railWays.filter((w) => w.tags.railway === 'rail')).filter((c) => polyLength(c) > 600).map(orient);
if (sChains.length < 2 || rChains.length < 2) throw new Error(`expected 2+2 Stadtbahn tracks, got ${sChains.length}+${rChains.length}`);

function nearestOnPolyline(p, pts) {
  let best = null, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const q = [a[0] + dx * t, a[1] + dz * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d < len) { out.push([a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len]); d += step; }
    carry = (carry + len) % step;
  }
  out.push(pts.at(-1));
  return out;
}
const allTracks = [...sChains.slice(0, 2), ...rChains.slice(0, 2)];
const viaduct = [];
for (const p of resample(allTracks[0], 6)) {
  const qs = allTracks.map((c) => nearestOnPolyline(p, c));
  const c = [(qs[0][0] + qs[1][0] + qs[2][0] + qs[3][0]) / 4, (qs[0][1] + qs[1][1] + qs[2][1] + qs[3][1]) / 4];
  const half = Math.max(...qs.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))) + 2.6;
  viaduct.push(r1(c[0]), r1(c[1]), r1(half));
}

// ---------- areas ----------
const AREA_KIND = (t) => {
  if (t.amenity === 'fountain') return 'fountain';
  if (t.natural === 'water') return 'water';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'park';
  if (t.landuse === 'grass' || t.landuse === 'village_green' || t.landuse === 'flowerbed') return 'grass';
  if (t.natural === 'scrub' || t.natural === 'wood') return 'scrub';
  if (t.leisure === 'playground') return 'sand';
  if (t.landuse === 'construction') return 'construction';
  if (t.highway === 'pedestrian') return 'plaza';
  if (t.railway === 'platform' || t.public_transport === 'platform' || t.highway === 'platform') return 'platform';
  return null;
};
const areas = [];
for (const e of E) {
  const t = e.tags || {};
  if (t.building || t['building:part']) continue;
  const k = AREA_KIND(t);
  if (!k) continue;
  if (num(t.layer) < 0 || t.tunnel === 'yes' || t.level?.startsWith?.('-') || t.location === 'underground') continue;
  if (k === 'platform' && (t.subway === 'yes' || t.train === 'yes' || num(t.layer) > 0)) continue;
  for (const poly of polygonsOf(e)) {
    if (poly.outer.length < 3 || !poly.outer.some((p) => inScene(p, 0))) continue;
    if (ringArea(poly.outer) < 0) poly.outer.reverse();
    areas.push({
      k, p: flat(poly.outer),
      ...(poly.holes.length ? { hs: poly.holes.map((h) => flat(ringArea(h) > 0 ? h.slice().reverse() : h)) } : {}),
      ...(t.name ? { n: t.name } : {}),
    });
  }
}

// ---------- points ----------
const pointsOf = (pred) => E.filter((e) => e.type === 'node' && pred(e.tags || {})).map((e) => ({ e, p: project(e.lat, e.lon) })).filter(({ p }) => inScene(p));
const compass = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const trees = pointsOf((t) => t.natural === 'tree').flatMap(({ e, p }) => [r1(p[0]), r1(p[1]), Math.round(num(e.tags.height) ?? 0)]);
const lamps = pointsOf((t) => t.highway === 'street_lamp').flatMap(({ p }) => [r1(p[0]), r1(p[1])]);
const benches = pointsOf((t) => t.amenity === 'bench').flatMap(({ e, p }) => {
  const d = e.tags.direction;
  return [r1(p[0]), r1(p[1]), d == null ? -1 : Math.round(compass[d] ?? num(d) ?? -1)];
});
const signals = pointsOf((t) => t.highway === 'traffic_signals').flatMap(({ p }) => [r1(p[0]), r1(p[1])]);
const named = (pred) => pointsOf(pred).map(({ e, p }) => ({ x: r1(p[0]), z: r1(p[1]), n: e.tags.name ?? '' }));
const tramStops = named((t) => t.railway === 'tram_stop');
const busStops = named((t) => t.highway === 'bus_stop');
const subwayEntrances = named((t) => t.railway === 'subway_entrance');
const shelters = pointsOf((t) => t.amenity === 'shelter').flatMap(({ p }) => [r1(p[0]), r1(p[1])]);

const bakeLandmark = (l) => ({
  p: flat(l.outer),
  ...(l.holes.length ? { hs: l.holes.map(flat) } : {}),
  parts: l.parts.map((b) => ({
    p: flat(b.outer), h: b.height != null ? r1(b.height) : undefined, mh: b.minHeight || undefined,
    k: b.kind, rs: b.roofShape, n: b.name,
  })),
});

const out = {
  meta: {
    origin: ORIGIN,
    metresPerDegree: { lat: M_LAT, lon: M_LON },
    halfExtent: { x: HALF_X, z: HALF_Z },
    osmBase: raw.osm3s?.timestamp_osm_base,
    attribution: '© OpenStreetMap contributors, ODbL 1.0',
  },
  landmarks: Object.fromEntries(Object.entries(landmarks).map(([k, l]) => [k, bakeLandmark(l)])),
  buildings: bakedBuildings,
  roads, paths, tram,
  rail: { s: sChains.slice(0, 2).map(flat), r: rChains.slice(0, 2).map(flat), viaduct },
  areas, trees, lamps, benches, signals, tramStops, busStops, subwayEntrances, shelters,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));

const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`baked ${outFile} (${kb} kB)`);
console.log({
  buildings: bakedBuildings.length, roads: roads.length, paths: paths.length, tram: tram.length,
  sTracks: sChains.length, rTracks: rChains.length, viaductPts: viaduct.length / 3, areas: areas.length,
  trees: trees.length / 3, lamps: lamps.length / 2, benches: benches.length / 3, tramStops: tramStops.length,
  busStops: busStops.length, subwayEntrances: subwayEntrances.length,
});
if (process.argv.includes('--verbose')) {
  for (const [k, l] of Object.entries(landmarks)) {
    const xs = l.outer.map((p) => p[0]), zs = l.outer.map((p) => p[1]);
    console.log(k, 'centre', centroid(l.outer).map(r1), 'bbox', [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)].map(r1),
      'parts', l.parts.map((p) => `${p.kind}:${p.height ?? '?'}/${p.minHeight}:${Math.round(p.area)}m²${p.name ? ':' + p.name : ''}`).join(' | '));
  }
}
