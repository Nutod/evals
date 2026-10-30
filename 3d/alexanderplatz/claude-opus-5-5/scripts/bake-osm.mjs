// Build-time bake: fetches OpenStreetMap data once via Overpass, projects it to
// local metres around Alexanderplatz and writes a compact JSON the app imports.
// The app never talks to OSM at runtime. Raw responses are cached in .osm-cache/.
//
// Usage: npm run bake:osm            (uses cache when present)
//        npm run bake:osm -- --fresh (re-download)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BBOX = [52.515, 13.4, 52.5265, 13.422]; // south, west, north, east
const ORIGIN = [52.52075, 13.411]; // lat, lon of scene (0,0)
const HALF_X = 760; // clip extents in metres (east-west)
const HALF_Z = 650; // (north-south)

// Landmarks are modelled by hand; their OSM footprints only place them.
const LANDMARKS = {
  fernsehturm: { type: 'way', id: 556435241 },
  parkinn: { type: 'way', id: 23723125 },
  weltzeituhr: { type: 'way', id: 417529567 },
  station: { type: 'way', id: 20144781 },
  rathaus: { type: 'relation', id: 4211905 },
  marienkirche: { type: 'way', id: 474111581 },
};

// Individual OSM parts used to anchor landmark details (tower positions, nave axis).
const ANCHORS = {
  parkinnTower: 24045068,
  rathausTower: 222813049,
  marienTower: 230953320,
  marienNave: 1551194922,
};

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const bbox = BBOX.join(',');
const QUERIES = {
  base: `[out:json][timeout:90];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["highway"](${bbox});
  way["railway"](${bbox});
  node["natural"="tree"](${bbox});
  way["natural"="water"](52.5130,13.3980,52.5265,13.4220);
  relation["natural"="water"](52.5130,13.3980,52.5265,13.4220);
  way["waterway"="river"](52.5130,13.3980,52.5265,13.4220);
  way["leisure"~"park|garden"](${bbox});
  way["landuse"~"grass"](${bbox});
);
out body;
>;
out skel qt;`,
  detail: `[out:json][timeout:90];
(
  way["building:part"](${bbox});
  relation["building:part"](${bbox});
  node["amenity"="bench"](${bbox});
  node["highway"="street_lamp"](${bbox});
  node["public_transport"="platform"](${bbox});
  node["highway"="bus_stop"](${bbox});
  node["railway"="tram_stop"](${bbox});
  node["amenity"="shelter"](${bbox});
  node["amenity"="fountain"](${bbox});
  way["amenity"="fountain"](${bbox});
  way["highway"="pedestrian"]["area"="yes"](${bbox});
  way["place"="square"](${bbox});
);
out body;
>;
out skel qt;`,
};

async function fetchQuery(name, fresh) {
  const path = `.osm-cache/${name}.json`;
  if (!fresh && existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  for (const url of ENDPOINTS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'alexanderplatz-procedural (build-time bake)' },
      body: new URLSearchParams({ data: QUERIES[name] }),
    });
    const text = await res.text();
    if (!res.ok || !text.startsWith('{')) continue;
    await mkdir('.osm-cache', { recursive: true });
    await writeFile(path, text);
    return JSON.parse(text);
  }
  throw new Error(`Overpass query "${name}" failed on all endpoints`);
}

const rad = (d) => (d * Math.PI) / 180;
const phi = rad(ORIGIN[0]);
const M_PER_DEG_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const M_PER_DEG_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
// Scene axes: +x east, -z north (three.js convention with y up).
const project = (lat, lon) => [(lon - ORIGIN[1]) * M_PER_DEG_LON, -(lat - ORIGIN[0]) * M_PER_DEG_LAT];
const r1 = (v) => Math.round(v * 10) / 10;
const inside = ([x, z], pad = 0) => Math.abs(x) <= HALF_X + pad && Math.abs(z) <= HALF_Z + pad;

const fresh = process.argv.includes('--fresh');
const [base, detail] = [await fetchQuery('base', fresh), await fetchQuery('detail', fresh)];

const nodes = new Map();
const ways = new Map();
const relations = new Map();
for (const e of [...base.elements, ...detail.elements]) {
  if (e.type === 'node') nodes.set(e.id, { ...(nodes.get(e.id) ?? {}), ...e });
  else if (e.type === 'way') ways.set(e.id, { ...(ways.get(e.id) ?? {}), ...e });
  else relations.set(e.id, { ...(relations.get(e.id) ?? {}), ...e });
}

const wayPoints = (w) => w.nodes.map((id) => nodes.get(id)).filter(Boolean).map((n) => project(n.lat, n.lon));
const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);

// Join relation member ways into closed rings.
function assembleRings(members) {
  const segs = members.map((m) => ways.get(m.ref)?.nodes).filter((n) => n && n.length > 1).map((n) => [...n]);
  const rings = [];
  while (segs.length) {
    const ring = segs.shift();
    let grown = true;
    while (ring[0] !== ring[ring.length - 1] && grown) {
      grown = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const end = ring[ring.length - 1];
        if (s[0] === end) ring.push(...s.slice(1));
        else if (s[s.length - 1] === end) ring.push(...s.reverse().slice(1));
        else continue;
        segs.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring[0] === ring[ring.length - 1]) rings.push(ring);
  }
  return rings.map((ids) => ids.map((id) => nodes.get(id)).filter(Boolean).map((n) => project(n.lat, n.lon)));
}

function polygonOf(e) {
  if (e.type === 'way') {
    if (e.nodes[0] !== e.nodes[e.nodes.length - 1]) return null;
    return { outer: [wayPoints(e)], inner: [] };
  }
  const outer = assembleRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner'));
  const inner = assembleRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner'));
  return outer.length ? { outer, inner } : null;
}

const dropClosing = (ring) => (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring);
const centroid = (ring) => {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
};
function pointInRing([x, z], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

const num = (v) => {
  if (v == null) return undefined;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const LEVEL_M = 3.3;
function heights(t) {
  const levels = num(t['building:levels']);
  const roofLevels = num(t['roof:levels']) ?? 0;
  let h = num(t.height) || (levels != null ? (levels + roofLevels) * LEVEL_M + 1 : undefined);
  const mh = num(t.min_height) ?? (num(t['building:min_level']) != null ? num(t['building:min_level']) * LEVEL_M : 0);
  if (!h) h = t.building === 'roof' ? 4 : t.building === 'garage' || t.building === 'kiosk' ? 4 : 14;
  return { h: r1(h), mh: r1(Math.min(mh, h - 0.5)) };
}

// ---- Landmarks
const landmarkFootprints = {};
for (const [key, ref] of Object.entries(LANDMARKS)) {
  const e = ref.type === 'way' ? ways.get(ref.id) : relations.get(ref.id);
  const poly = e && polygonOf(e);
  if (!poly) throw new Error(`Landmark ${key} missing from OSM data`);
  landmarkFootprints[key] = { outer: poly.outer.map(dropClosing), inner: poly.inner.map(dropClosing) };
}
const landmarkRings = Object.values(landmarkFootprints).flatMap((f) => f.outer);
const anchors = Object.fromEntries(
  Object.entries(ANCHORS).map(([key, id]) => {
    const w = ways.get(id);
    if (!w) throw new Error(`Anchor ${key} (way ${id}) missing from OSM data`);
    return [key, flat(dropClosing(wayPoints(w)))];
  }),
);
const inLandmark = (c) => landmarkRings.some((ring) => pointInRing(c, ring));

// ---- Buildings and building parts
const SKIP_PARTS = new Set(['elevator', 'antenna']);
const parts = [];
const buildings = [];
for (const e of [...ways.values(), ...relations.values()]) {
  const t = e.tags;
  if (!t || !(t.building || t['building:part'])) continue;
  if (t.building && t['building:part']) continue;
  if (Object.values(LANDMARKS).some((l) => l.type === e.type && l.id === e.id)) continue;
  if (t.location === 'underground' || t.layer?.startsWith('-')) continue;
  if (t['building:part'] && SKIP_PARTS.has(t['building:part'])) continue;
  const poly = polygonOf(e);
  if (!poly) continue;
  const outer = poly.outer.map(dropClosing).filter((r) => r.length >= 3);
  if (!outer.length) continue;
  const c = centroid(outer[0]);
  if (!inside(c) || inLandmark(c)) continue;
  const { h, mh } = heights(t);
  const item = {
    id: e.id,
    outer: outer.map(flat),
    ...(poly.inner.length ? { inner: poly.inner.map(dropClosing).map(flat) } : {}),
    h,
    ...(mh ? { mh } : {}),
    k: t['building:part'] ? 'part' : t.building,
    ...(t.name ? { name: t.name } : {}),
    ...(t['building:colour'] ? { col: t['building:colour'] } : {}),
    ...(t['building:material'] ? { mat: t['building:material'] } : {}),
    ...(t['roof:shape'] && t['roof:shape'] !== 'flat' ? { roof: t['roof:shape'] } : {}),
    ...(t['roof:colour'] ? { roofCol: t['roof:colour'] } : {}),
  };
  (t['building:part'] ? parts : buildings).push({ item, outer });
}
// A building outline fully described by parts is replaced by those parts.
const keptBuildings = buildings.filter(({ outer }) => !parts.some((p) => pointInRing(centroid(p.outer[0]), outer[0])));

// ---- Linear networks (split at shared nodes so they form a graph)
const ROAD_WIDTH = {
  motorway: 14, trunk: 14, primary: 13, secondary: 10.5, tertiary: 8.5, primary_link: 6, secondary_link: 6, tertiary_link: 6,
  residential: 7, unclassified: 7, living_street: 5.5, service: 4.5, pedestrian: 5, footway: 2.5, path: 2, cycleway: 2, steps: 2.5,
};
const DRIVE = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'primary_link', 'secondary_link', 'tertiary_link', 'service', 'living_street']);
const WALK = new Set(['footway', 'pedestrian', 'path', 'living_street', 'steps']);

function buildNetwork(filter, describe) {
  const selected = [...ways.values()].filter((w) => w.tags && filter(w.tags) && w.tags.area !== 'yes');
  const use = new Map();
  for (const w of selected) for (const id of w.nodes) use.set(id, (use.get(id) ?? 0) + 1);
  const junction = new Map();
  const junctionIndex = (id) => {
    if (!junction.has(id)) junction.set(id, junction.size);
    return junction.get(id);
  };
  const edges = [];
  for (const w of selected) {
    let run = [];
    const flush = () => {
      const pts = run.map((id) => nodes.get(id)).filter(Boolean).map((n) => project(n.lat, n.lon));
      if (pts.length >= 2 && pts.some((p) => inside(p))) {
        edges.push({ a: junctionIndex(run[0]), b: junctionIndex(run.at(-1)), p: flat(pts), ...describe(w.tags) });
      }
    };
    for (let i = 0; i < w.nodes.length; i++) {
      const id = w.nodes[i];
      const n = nodes.get(id);
      if (n && !inside(project(n.lat, n.lon), 60)) {
        run.push(id);
        flush();
        run = [];
        continue;
      }
      run.push(id);
      if (i > 0 && i < w.nodes.length - 1 && use.get(id) > 1) {
        flush();
        run = [id];
      }
    }
    flush();
  }
  return edges;
}

const roadWidth = (t) => {
  const w = num(t.width);
  if (w && w > 1) return r1(w);
  const lanes = num(t.lanes);
  if (lanes && DRIVE.has(t.highway)) return r1(Math.max(lanes * 3.2, 5));
  return ROAD_WIDTH[t.highway] ?? 4;
};

const roads = buildNetwork(
  (t) => t.highway && (DRIVE.has(t.highway) || WALK.has(t.highway) || t.highway === 'cycleway') && !t.tunnel && t.layer !== '-1' && t.indoor !== 'yes' && t.level == null,
  (t) => ({
    k: t.highway,
    w: roadWidth(t),
    ...(t.oneway === 'yes' ? { o: 1 } : {}),
    ...(t.bridge ? { br: 1 } : {}),
    ...(t.name ? { n: t.name } : {}),
  }),
);

const rails = buildNetwork(
  (t) => ['tram', 'light_rail', 'rail'].includes(t.railway) && !t.tunnel && t.service !== 'yard',
  (t) => ({ k: t.railway, ...(t.bridge || t.layer > 0 ? { el: 1 } : {}) }),
);

// ---- Areas
const areas = [];
for (const e of [...ways.values(), ...relations.values()]) {
  const t = e.tags;
  if (!t) continue;
  let k;
  if (t.natural === 'water' || t.waterway === 'riverbank') k = 'water';
  else if (t.leisure === 'park' || t.leisure === 'garden') k = 'park';
  else if (t.landuse === 'grass') k = 'grass';
  else if (t.highway === 'pedestrian' && t.area === 'yes') k = 'plaza';
  else if (t.amenity === 'fountain' && e.type === 'way') k = 'fountain';
  else continue;
  const poly = polygonOf(e);
  if (!poly) continue;
  const outer = poly.outer.map(dropClosing).filter((r) => r.length >= 3 && r.some((p) => inside(p, 200)));
  if (!outer.length) continue;
  areas.push({ k, outer: outer.map(flat), ...(poly.inner.length ? { inner: poly.inner.map(dropClosing).map(flat) } : {}) });
}

// ---- Points
const points = { trees: [], lamps: [], benches: [], stops: [], fountains: [] };
for (const n of nodes.values()) {
  const t = n.tags;
  if (!t) continue;
  const p = project(n.lat, n.lon);
  if (!inside(p)) continue;
  const xz = [r1(p[0]), r1(p[1])];
  if (t.natural === 'tree') points.trees.push(...xz);
  else if (t.highway === 'street_lamp') points.lamps.push(...xz);
  else if (t.amenity === 'bench') points.benches.push(...xz);
  else if (t.amenity === 'fountain') points.fountains.push(...xz);
  else if (t.railway === 'tram_stop' || t.highway === 'bus_stop' || t.amenity === 'shelter') {
    points.stops.push({ p: xz, k: t.railway === 'tram_stop' ? 'tram' : t.highway === 'bus_stop' ? 'bus' : 'shelter', ...(t.name ? { n: t.name } : {}), ...(t.shelter === 'yes' ? { s: 1 } : {}) });
  }
}

const out = {
  attribution: '© OpenStreetMap contributors, ODbL 1.0',
  source: `Overpass API, OSM base ${base.osm3s?.timestamp_osm_base ?? 'unknown'}`,
  origin: ORIGIN,
  extent: [HALF_X, HALF_Z],
  landmarks: Object.fromEntries(
    Object.entries(landmarkFootprints).map(([k, f]) => [k, { outer: f.outer.map(flat), ...(f.inner.length ? { inner: f.inner.map(flat) } : {}) }]),
  ),
  anchors,
  buildings: [...keptBuildings, ...parts].map((b) => b.item),
  roads,
  rails,
  areas,
  ...points,
};
await mkdir('src/data', { recursive: true });
await writeFile('src/data/osm.json', JSON.stringify(out));
console.log(
  `baked ${out.buildings.length} buildings, ${roads.length} road edges, ${rails.length} rail edges, ${areas.length} areas, ` +
    `${points.trees.length / 2} trees, ${points.lamps.length / 2} lamps, ${points.benches.length / 2} benches, ${points.stops.length} stops`,
);
