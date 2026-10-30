import * as THREE from 'three';
import { osm, type OsmEdge } from '../osm';
import { MeshBuilder, toRing, type Ring } from '../lib/geom';
import { SegmentIndex } from '../lib/segments';
import { asphaltTexture, ballastTexture, pavingTexture, viaductTexture } from '../lib/textures';
import { layered } from './ground';

export const DRIVE_KINDS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'primary_link', 'secondary_link', 'tertiary_link', 'service', 'living_street']);
export const WALK_KINDS = new Set(['footway', 'pedestrian', 'path', 'steps', 'living_street']);
const MARKED = new Set(['primary', 'secondary', 'tertiary', 'residential']);

/** Top of the Stadtbahn viaduct deck through Alexanderplatz. */
export const DECK_Y = 8;
export const driveEdges = osm.roads.filter((e) => DRIVE_KINDS.has(e.k));
export const walkEdges = osm.roads.filter((e) => WALK_KINDS.has(e.k));
export const tramEdges = osm.rails.filter((e) => e.k === 'tram');
export const heavyRailEdges = osm.rails.filter((e) => e.k !== 'tram');

/** Walks a polyline and emits sub-polylines in [from, to] metres. */
function slice(pts: Ring, from: number, to: number): Ring {
  const out: Ring = [];
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    if (d + len >= from && d <= to) {
      const t0 = Math.max(0, (from - d) / len);
      const t1 = Math.min(1, (to - d) / len);
      if (!out.length) out.push(a.clone().lerp(b, t0));
      out.push(a.clone().lerp(b, t1));
    }
    d += len;
  }
  return out;
}

const polylineLength = (pts: Ring) => pts.reduce((s, p, i) => (i ? s + p.distanceTo(pts[i - 1]) : 0), 0);

function dashes(builder: MeshBuilder, pts: Ring, offset: number, dash: number, gap: number, trim: number) {
  const total = polylineLength(pts);
  for (let s = trim; s + dash < total - trim; s += dash + gap) builder.ribbon(slice(pts, s, s + dash), 0.15, 0.06, 1, offset);
}

function junctionCaps(builder: MeshBuilder, edges: OsmEdge[], y: number) {
  const nodes = new Map<number, { p: THREE.Vector2; w: number; n: number }>();
  for (const e of edges) {
    const ends: [number, number, number][] = [[e.a, e.p[0], e.p[1]], [e.b, e.p[e.p.length - 2], e.p[e.p.length - 1]]];
    for (const [id, x, z] of ends) {
      const node = nodes.get(id) ?? { p: new THREE.Vector2(x, z), w: 0, n: 0 };
      node.w = Math.max(node.w, e.w ?? 6);
      node.n++;
      nodes.set(id, node);
    }
  }
  for (const node of nodes.values()) if (node.n >= 2) builder.disc(node.p, node.w / 2, y, 20, 4);
}

export function buildStreets(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'streets';

  const asphalt = new MeshBuilder();
  const walk = new MeshBuilder();
  const cycle = new MeshBuilder();
  const marks = new MeshBuilder();
  for (const e of osm.roads) {
    const pts = toRing(e.p);
    const w = e.w ?? 6;
    if (DRIVE_KINDS.has(e.k)) {
      asphalt.ribbon(pts, w, 0.04, 6);
      if (MARKED.has(e.k) && w >= 6) {
        if (!e.o) dashes(marks, pts, 0, 3, 6, 9);
        else for (let lane = 1; lane < Math.round(w / 3.2); lane++) dashes(marks, pts, -w / 2 + (lane * w) / Math.round(w / 3.2), 3, 6, 9);
        if (e.k === 'primary' || e.k === 'secondary') {
          const total = polylineLength(pts);
          if (total > 20) for (const side of [-1, 1]) marks.ribbon(slice(pts, 6, total - 6), 0.15, 0.06, 1, side * (w / 2 - 0.5));
        }
      }
    } else if (e.k === 'cycleway') cycle.ribbon(pts, w, 0.035, 4);
    else walk.ribbon(pts, w, 0.03, 4);
  }
  junctionCaps(asphalt, driveEdges, 0.04);

  const asphaltTex = asphaltTexture();
  const paving = pavingTexture();
  const parts: [MeshBuilder, THREE.Material, string][] = [
    [walk, layered(new THREE.MeshStandardMaterial({ map: paving, color: 0xf3efe6, roughness: 0.9 }), 3), 'footways'],
    [cycle, layered(new THREE.MeshStandardMaterial({ color: 0xa86a5c, roughness: 0.9 }), 4), 'cycleways'],
    [asphalt, layered(new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0xb0b0b0, roughness: 0.85 }), 5), 'roads'],
    [marks, layered(new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.7 }), 7), 'markings'],
  ];
  for (const [builder, material, name] of parts) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
  }
  group.add(buildTramways(), buildViaduct());
  return group;
}

function buildTramways(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tramways';
  const bed = new MeshBuilder();
  const rails = new MeshBuilder();
  const gauge = 1.435;
  for (const e of tramEdges) {
    const pts = toRing(e.p);
    bed.ribbon(pts, 2.9, 0.05, 4);
    for (const side of [-1, 1]) rails.ribbon(pts, 0.09, 0.07, 1, (side * gauge) / 2);
  }
  group.add(new THREE.Mesh(bed.build(), layered(new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.9 }), 6)));
  group.add(new THREE.Mesh(rails.build(), layered(new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }), 8)));
  for (const m of group.children as THREE.Mesh[]) m.receiveShadow = true;
  group.add(buildCatenary());
  return group;
}

/** Tram overhead line: poles every ~35 m and a contact wire 5.8 m above the rails. */
function buildCatenary(): THREE.Group {
  const group = new THREE.Group();
  const wire: number[] = [];
  const poles: THREE.Matrix4[] = [];
  for (const e of tramEdges) {
    const pts = toRing(e.p);
    for (let i = 0; i < pts.length - 1; i++) wire.push(pts[i].x, 5.8, pts[i].y, pts[i + 1].x, 5.8, pts[i + 1].y);
    const total = polylineLength(pts);
    for (let s = 12; s < total - 5; s += 35) {
      const seg = slice(pts, s, s + 0.5);
      if (seg.length < 2) continue;
      const dir = seg[1].clone().sub(seg[0]).normalize();
      const n = new THREE.Vector2(-dir.y, dir.x);
      const at = seg[0].clone().addScaledVector(n, 3.2);
      poles.push(new THREE.Matrix4().makeTranslation(at.x, 3.3, at.y));
      wire.push(at.x, 6.3, at.y, seg[0].x, 5.9, seg[0].y);
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)),
    new THREE.LineBasicMaterial({ color: 0x2b2f33, transparent: true, opacity: 0.7 }),
  );
  lines.name = 'catenary-wire';
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.13, 6.6, 6), new THREE.MeshStandardMaterial({ color: 0x5d6468, roughness: 0.6, metalness: 0.4 }), poles.length);
  poles.forEach((m, i) => pole.setMatrixAt(i, m));
  pole.castShadow = true;
  group.add(lines, pole);
  return group;
}

/**
 * The Stadtbahn runs on a brick arch viaduct through Mitte. Each S-Bahn/mainline
 * track becomes a deck ribbon; walls are left open where the line bridges a road.
 */
function buildViaduct(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'viaduct';
  const roads = new SegmentIndex(driveEdges.filter((e) => e.k !== 'service'));
  const deck = new MeshBuilder();
  const walls = new MeshBuilder();
  const girders = new MeshBuilder();
  const rails = new MeshBuilder();
  const halfWidth = 2.6;
  const up = new THREE.Vector3(0, 1, 0);

  for (const e of heavyRailEdges) {
    const pts = toRing(e.p);
    deck.ribbon(pts, halfWidth * 2, DECK_Y, 4.8);
    for (const side of [-1, 1]) rails.ribbon(pts, 0.08, DECK_Y + 0.18, 1, (side * 1.435) / 2);
    const total = polylineLength(pts);
    const step = 3;
    for (let s = 0; s < total - 0.01; s += step) {
      const seg = slice(pts, s, Math.min(total, s + step));
      if (seg.length < 2) continue;
      const [a, b] = [seg[0], seg[seg.length - 1]];
      const dir = b.clone().sub(a).normalize();
      const n = new THREE.Vector2(-dir.y, dir.x);
      const mid = a.clone().lerp(b, 0.5);
      const road = roads.nearest(mid, 14);
      const overRoad = road && road.distance < (road.segment.edge.w ?? 6) / 2 + 0.5;
      for (const side of [-1, 1]) {
        const pa = a.clone().addScaledVector(n, side * halfWidth);
        const pb = b.clone().addScaledVector(n, side * halfWidth);
        const facing = new THREE.Vector3(n.x * side, 0, n.y * side);
        const builder = overRoad ? girders : walls;
        const y0 = overRoad ? DECK_Y - 1.8 : 0;
        const u0 = s / 15, u1 = (s + a.distanceTo(b)) / 15;
        builder.quad(
          new THREE.Vector3(pa.x, y0, pa.y), new THREE.Vector3(pb.x, y0, pb.y), new THREE.Vector3(pb.x, DECK_Y, pb.y), new THREE.Vector3(pa.x, DECK_Y, pa.y),
          [new THREE.Vector2(u0, y0 / DECK_Y), new THREE.Vector2(u1, y0 / DECK_Y), new THREE.Vector2(u1, 1), new THREE.Vector2(u0, 1)],
          facing,
        );
      }
      if (overRoad) {
        // Underside of the bridge deck.
        const corners = [-1, 1].flatMap((side) => [a, b].map((p) => p.clone().addScaledVector(n, side * halfWidth)));
        girders.quad(
          new THREE.Vector3(corners[0].x, DECK_Y - 1.8, corners[0].y), new THREE.Vector3(corners[1].x, DECK_Y - 1.8, corners[1].y),
          new THREE.Vector3(corners[3].x, DECK_Y - 1.8, corners[3].y), new THREE.Vector3(corners[2].x, DECK_Y - 1.8, corners[2].y),
          undefined, up.clone().negate(),
        );
      }
    }
  }
  const viaductTex = viaductTexture();
  viaductTex.wrapT = THREE.ClampToEdgeWrapping;
  const meshes: [MeshBuilder, THREE.Material, string][] = [
    [deck, new THREE.MeshStandardMaterial({ map: ballastTexture(), roughness: 1 }), 'deck'],
    [walls, new THREE.MeshStandardMaterial({ map: viaductTex, roughness: 0.9 }), 'arches'],
    [girders, new THREE.MeshStandardMaterial({ color: 0x4f5a55, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }), 'girders'],
    [rails, layered(new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }), 2), 'rails'],
  ];
  for (const [builder, material, name] of meshes) {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.name = name;
    mesh.castShadow = name !== 'rails';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
