import * as THREE from 'three';
import { offsetPolyline, pointInRing, Polyline, segmentsCross, toRing, type P2 } from '../core/geo';
import { MeshBuilder, xf, type V3 } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { blotches, canvasTexture, speckle } from '../core/textures';
import { osm } from '../data/osm';
import type { World } from './world';

/** Heights of the Stadtbahn viaduct above street level, in metres. */
export const RAIL = { deck: 6.75, railTop: 6.95, parapet: 7.9, platform: 7.9, gauge: 1.435, archBay: 9.6 };

export interface StadtbahnTracks {
  /** S-Bahn tracks, both stored west to east. */
  s: Polyline[];
  /** Regional and long-distance tracks. */
  r: Polyline[];
}

export function stadtbahnTracks(): StadtbahnTracks {
  return { s: osm.rail.s.map((c) => new Polyline(toRing(c))), r: osm.rail.r.map((c) => new Polyline(toRing(c))) };
}

/** One viaduct bay: brick pier, round arch with a glazed infill, stone cornice. */
function archTexture(): THREE.Texture {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(81);
    const rows = 40;
    const cols = 16;
    g.fillStyle = '#8a7a68';
    g.fillRect(0, 0, w, h);
    for (let j = 0; j < rows; j++) {
      for (let i = -1; i < cols; i++) {
        const v = 0.78 + rng() * 0.3;
        g.fillStyle = `rgb(${Math.round(178 * v)},${Math.round(132 * v)},${Math.round(84 * v)})`;
        g.fillRect((i + (j % 2) * 0.5) * (w / cols) + 1, j * (h / rows) + 1, w / cols - 2, h / rows - 2);
      }
    }
    blotches(g, w, h, rng, 12, 'rgba(40,25,10,0.2)', 130);
    // arch opening
    const cx = w / 2;
    const r = w * 0.36;
    const spring = h * 0.56;
    g.fillStyle = '#6d5a47';
    g.beginPath();
    g.moveTo(cx - r - 14, h);
    g.lineTo(cx - r - 14, spring);
    g.arc(cx, spring, r + 14, Math.PI, 0);
    g.lineTo(cx + r + 14, h);
    g.closePath();
    g.fill();
    g.fillStyle = '#27313a';
    g.beginPath();
    g.moveTo(cx - r, h);
    g.lineTo(cx - r, spring);
    g.arc(cx, spring, r, Math.PI, 0);
    g.lineTo(cx + r, h);
    g.closePath();
    g.fill();
    // shopfront inside the arch
    g.fillStyle = '#3d4b57';
    g.fillRect(cx - r + 10, spring + 10, 2 * r - 20, h - spring - 30);
    g.strokeStyle = '#161b20';
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(cx - r + 10 + ((2 * r - 20) * i) / 4, spring + 10);
      g.lineTo(cx - r + 10 + ((2 * r - 20) * i) / 4, h - 20);
      g.stroke();
    }
    g.fillStyle = '#d8c9a4';
    g.fillRect(cx - r + 30, spring - 6, 2 * r - 60, 22);
    // cornice and parapet
    g.fillStyle = '#b9a98f';
    g.fillRect(0, h * 0.11, w, h * 0.035);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h * 0.145, w, 4);
    g.fillStyle = '#5a5148';
    g.fillRect(0, h - 16, w, 16);
  });
}

function ballastTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(82);
    g.fillStyle = '#6b6259';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, rng, 14000, 'rgba(170,160,145,0.4)', 'rgba(30,25,20,0.4)', 3);
  });
}

/** Sleepers on ballast; one tile is two sleepers along the track. */
function sleeperTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g, w, h) => {
    const rng = mulberry32(83);
    g.fillStyle = '#665e55';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, rng, 3000, 'rgba(170,160,145,0.4)', 'rgba(30,25,20,0.4)', 3);
    g.fillStyle = '#4a4138';
    g.fillRect(6, 10, w - 12, 26);
    g.fillRect(6, 74, w - 12, 26);
  });
}

export function buildRail(world: World): void {
  const group = world.layers.streets;
  const v = osm.rail.viaduct;
  const centre: P2[] = [];
  const half: number[] = [];
  for (let i = 0; i < v.length; i += 3) {
    centre.push([v[i], v[i + 1]]);
    half.push(v[i + 2]);
  }
  const n = centre.length;
  const station = toRing(osm.landmarks.station.p);
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const nz = (b[0] - a[0]) / l;
    right.push([centre[i][0] + nx * half[i], centre[i][1] + nz * half[i]]);
    left.push([centre[i][0] - nx * half[i], centre[i][1] - nz * half[i]]);
  }

  // which spans bridge a street: those get steel girders instead of brick arches
  const open = new Array<boolean>(n - 1).fill(false);
  const crossers: { pts: P2[]; w: number }[] = [
    ...osm.roads.map((r) => ({ pts: toRing(r.p), w: r.w })),
    ...osm.tram.map((t) => ({ pts: toRing(t.p), w: 3 })),
    ...osm.paths.filter((p) => p.k === 'pedestrian').map((p) => ({ pts: toRing(p.p), w: p.w })),
  ];
  for (const c of crossers) {
    for (let k = 1; k < c.pts.length; k++) {
      const a = c.pts[k - 1];
      const b = c.pts[k];
      for (let i = 0; i < n - 1; i++) {
        if (Math.abs(a[0] - centre[i][0]) > 120 && Math.abs(b[0] - centre[i][0]) > 120) continue;
        if (segmentsCross(a, b, left[i], left[i + 1]) || segmentsCross(a, b, right[i], right[i + 1]) || segmentsCross(a, b, centre[i], centre[i + 1])) {
          const spread = Math.ceil((c.w / 2 + 2.5) / 6);
          for (let j = Math.max(0, i - spread); j <= Math.min(n - 2, i + spread); j++) open[j] = true;
        }
      }
    }
  }
  const inStation = (i: number): boolean => {
    const mx = (centre[i][0] + centre[i + 1][0]) / 2;
    const mz = (centre[i][1] + centre[i + 1][1]) / 2;
    return pointInRing(mx, mz, station);
  };

  const brick = new MeshBuilder();
  const steel = new MeshBuilder();
  const deck = new MeshBuilder();
  const girderTop = RAIL.parapet;
  const girderBottom = RAIL.deck - 1.5;
  let run = 0;
  for (let i = 0; i < n - 1; i++) {
    if (inStation(i)) continue;
    const seg = Math.hypot(centre[i + 1][0] - centre[i][0], centre[i + 1][1] - centre[i][1]);
    const L0 = left[i];
    const L1 = left[i + 1];
    const R0 = right[i];
    const R1 = right[i + 1];
    const y = (p: P2, h: number): V3 => [p[0], h, p[1]];
    deck.quad(y(R0, RAIL.deck), y(R1, RAIL.deck), y(L1, RAIL.deck), y(L0, RAIL.deck), 0xffffff, [0, run / 4, (half[i] * 2) / 4, (run + seg) / 4]);
    if (open[i]) {
      for (const [a, b, flip] of [[R0, R1, false], [L0, L1, true]] as const) {
        const p = flip ? b : a;
        const q = flip ? a : b;
        steel.quad(y(q, girderBottom), y(p, girderBottom), y(p, girderTop), y(q, girderTop), 0x586860);
        steel.quad(y(p, girderBottom), y(q, girderBottom), y(q, girderTop), y(p, girderTop), 0x4c5a53);
      }
      steel.quad(y(L0, girderBottom), y(L1, girderBottom), y(R1, girderBottom), y(R0, girderBottom), 0x3f4a45);
      // stiffener ribs
      const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const rot = Math.atan2(-(centre[i + 1][1] - centre[i][1]), centre[i + 1][0] - centre[i][0]);
      for (const m of [mid(R0, R1), mid(L0, L1)]) steel.box(0.18, girderTop - girderBottom, 0.5, xf(m[0], (girderTop + girderBottom) / 2, m[1], rot), 0x65766d);
    } else {
      const u0 = run / RAIL.archBay;
      const u1 = (run + seg) / RAIL.archBay;
      brick.quad(y(R1, 0), y(R0, 0), y(R0, RAIL.parapet), y(R1, RAIL.parapet), 0xffffff, [u1, 0, u0, 1]);
      brick.quad(y(L0, 0), y(L1, 0), y(L1, RAIL.parapet), y(L0, RAIL.parapet), 0xffffff, [u0, 0, u1, 1]);
    }
    // abutment where brick meets an open span or the station
    const prevOpen = i === 0 || open[i - 1] || inStation(i - 1);
    const nextOpen = i === n - 2 || open[i + 1] || inStation(i + 1);
    if (!open[i] && prevOpen) brick.quad(y(L0, 0), y(R0, 0), y(R0, RAIL.deck), y(L0, RAIL.deck), 0xcfc4b4, [0, 0, 0.12, 0.8]);
    if (!open[i] && nextOpen) brick.quad(y(R1, 0), y(L1, 0), y(L1, RAIL.deck), y(R1, RAIL.deck), 0xcfc4b4, [0, 0, 0.12, 0.8]);
    run += seg;
  }
  const arch = archTexture();
  const brickMesh = brick.mesh(new THREE.MeshStandardMaterial({ map: arch, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  brickMesh.name = 'viaduct';
  const steelMesh = steel.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55 }));
  const deckMesh = deck.mesh(new THREE.MeshStandardMaterial({ map: ballastTexture(), roughness: 1 }));
  group.add(brickMesh, steelMesh, deckMesh);

  // ---- tracks ----
  const beds = new MeshBuilder();
  const rails = new MeshBuilder();
  const masts = new MeshBuilder();
  const wire: number[] = [];
  const tracks = stadtbahnTracks();
  const s = { x: 0, z: 0, tx: 1, tz: 0 };
  for (const [kind, lines] of [['s', tracks.s], ['r', tracks.r]] as const) {
    lines.forEach((line, index) => {
      beds.ribbon(line.pts, 2.7, RAIL.deck + 0.06, 0xffffff, 1 / 1.3);
      for (const side of [-1, 1]) {
        rails.ribbon(offsetPolyline(line.pts, (side * RAIL.gauge) / 2), 0.075, RAIL.railTop, 0xffffff);
      }
      if (kind === 's') {
        // third rail beside each S-Bahn track
        rails.ribbon(offsetPolyline(line.pts, index === 0 ? 1.25 : -1.25), 0.1, RAIL.railTop + 0.08, 0xffffff);
        return;
      }
      // overhead line for the mainline tracks, carried on masts outside the hall
      for (let i = 1; i < line.pts.length; i++) {
        wire.push(line.pts[i - 1][0], RAIL.railTop + 5.5, line.pts[i - 1][1], line.pts[i][0], RAIL.railTop + 5.5, line.pts[i][1]);
      }
      // only the outer track carries masts; the inner one has no clearance beside it
      if (index === 0) return;
      const outward = 1;
      for (let d = 20; d < line.length; d += 46) {
        line.at(d, s);
        const px = s.x - s.tz * 2.7 * outward;
        const pz = s.z + s.tx * 2.7 * outward;
        if (pointInRing(px, pz, station)) continue;
        const rot = Math.atan2(-s.tz, s.tx);
        masts.box(0.22, 7.2, 0.22, xf(px, RAIL.deck + 3.6, pz), 0x5a6a62);
        masts.box(0.1, 0.1, 3.0, xf(px + s.tz * 1.4 * outward, RAIL.railTop + 5.9, pz - s.tx * 1.4 * outward, rot), 0x5a6a62);
      }
    });
  }
  const bedMesh = beds.mesh(new THREE.MeshStandardMaterial({ map: sleeperTexture(), roughness: 1 }), 'receive');
  const railMesh = rails.mesh(new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.35, metalness: 0.9 }), 'none');
  const mastMesh = masts.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), 'cast');
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(bedMesh, railMesh, mastMesh, new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: 0x22262a, transparent: true, opacity: 0.7 })));
}
