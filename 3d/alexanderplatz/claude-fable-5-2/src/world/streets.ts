import * as THREE from 'three';
import { offsetPolyline, Polyline, toRing, type P2 } from '../core/geo';
import { MeshBuilder, xf } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { blotches, canvasTexture, speckle } from '../core/textures';
import { osm } from '../data/osm';
import { GROUND_LEVEL, layered, levelY } from './ground';
import { inBounds, type World } from './world';

export const TRAM_GAUGE = 1.435;
export const WIRE_HEIGHT = 5.6;

function asphaltTexture(): THREE.Texture {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(21);
    g.fillStyle = '#4b4d51';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 30, 'rgba(30,30,32,0.10)', 110);
    blotches(g, w, h, rng, 20, 'rgba(110,110,112,0.07)', 90);
    speckle(g, w, h, rng, 26000, 'rgba(190,190,190,0.16)', 'rgba(0,0,0,0.22)', 1.6);
    // tar-sealed cracks
    g.strokeStyle = 'rgba(20,20,22,0.5)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      let x = rng() * w;
      let y = rng() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rng() - 0.5) * 60;
        y += (rng() - 0.3) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function gravelTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(22);
    g.fillStyle = '#c4c0b6';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 18, 'rgba(120,110,90,0.06)', 60);
    speckle(g, w, h, rng, 9000, 'rgba(255,250,235,0.12)', 'rgba(90,80,60,0.12)', 2);
  });
}

function trackBedTexture(): THREE.Texture {
  // 2 m tile of small setts between the rails
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(23);
    g.fillStyle = '#6f6c66';
    g.fillRect(0, 0, w, h);
    const n = 10;
    const s = w / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = 120 + Math.floor(rng() * 34);
        g.fillStyle = `rgb(${v + 3},${v},${v - 5})`;
        g.fillRect(((i + (j % 2) * 0.5) % n) * s + 1, j * s + 1, s - 2, s - 2);
      }
    }
    speckle(g, w, h, rng, 2500, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.15)');
  });
}

/** Dashes of paint along a line. */
function dashes(b: MeshBuilder, line: Polyline, offset: number, on: number, off: number, width: number, y: number, margin: number): void {
  const s = { x: 0, z: 0, tx: 1, tz: 0 };
  for (let d = margin; d + on < line.length - margin; d += on + off) {
    line.at(d + on / 2, s);
    const cx = s.x - s.tz * offset;
    const cz = s.z + s.tx * offset;
    const hx = (s.tx * on) / 2;
    const hz = (s.tz * on) / 2;
    const wx = (-s.tz * width) / 2;
    const wz = (s.tx * width) / 2;
    b.quad([cx - hx + wx, y, cz - hz + wz], [cx + hx + wx, y, cz + hz + wz], [cx + hx - wx, y, cz + hz - wz], [cx - hx - wx, y, cz - hz - wz], 0xffffff);
  }
}

/** The polyline with `margin` metres cut from both ends. */
function trimmed(line: Polyline, margin: number): P2[] {
  const a = line.at(margin);
  const out: P2[] = [[a.x, a.z]];
  line.pts.forEach((p, i) => {
    if (line.cum[i] > margin && line.cum[i] < line.length - margin) out.push(p);
  });
  const b = line.at(line.length - margin);
  out.push([b.x, b.z]);
  return out;
}

export function buildStreets(world: World): void {
  const group = world.layers.streets;
  const yRoad = levelY(GROUND_LEVEL.road);
  const yPath = levelY(GROUND_LEVEL.path);
  const yBed = levelY(GROUND_LEVEL.bed);
  const yMark = levelY(GROUND_LEVEL.marking);
  const yRail = levelY(GROUND_LEVEL.rail);

  // ---- carriageways ----
  const asphalt = new MeshBuilder();
  const service = new MeshBuilder();
  const marks = new MeshBuilder();
  for (const r of osm.roads) {
    const pts = toRing(r.p);
    const target = r.k === 'service' ? service : asphalt;
    target.ribbon(pts, r.w, yRoad, 0xffffff, 1 / 12);
    // round the joints so consecutive segments do not leave wedges
    for (const p of pts) target.disc(p[0], p[1], r.w / 2, yRoad, 0xffffff, 10, 1 / 12);

    if (r.k === 'service' || r.k === 'residential') continue;
    const line = new Polyline(pts);
    if (line.length < 14) continue;
    const perDirection = r.o ? r.l : Math.max(1, Math.floor(r.l / 2));
    const laneW = r.w / (r.o ? r.l : Math.max(2, r.l));
    if (!r.o) marks.ribbon(trimmed(line, 5), 0.14, yMark, 0xffffff);
    for (let i = 1; i < perDirection; i++) {
      const off = r.o ? (i - r.l / 2) * laneW : i * laneW;
      dashes(marks, line, off, 3, 6, 0.12, yMark, 6);
      if (!r.o) dashes(marks, line, -off, 3, 6, 0.12, yMark, 6);
    }
  }
  const asphaltMap = asphaltTexture();
  const asphaltMesh = asphalt.mesh(layered(new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.92, color: 0xdcdcdc }), GROUND_LEVEL.road), 'receive');
  const serviceMesh = service.mesh(layered(new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.95, color: 0xf0ede8 }), GROUND_LEVEL.road), 'receive');
  const markMesh = marks.mesh(layered(new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.7 }), GROUND_LEVEL.marking), 'receive');
  group.add(serviceMesh, asphaltMesh, markMesh);

  // ---- footways through parks, pedestrian streets ----
  const walk = new MeshBuilder();
  const promenade = new MeshBuilder();
  for (const p of osm.paths) {
    if (p.k === 'steps') continue;
    const pts = toRing(p.p);
    if (p.k === 'pedestrian') {
      promenade.ribbon(pts, p.w, yPath, 0xffffff, 1 / 4);
      for (const q of pts) promenade.disc(q[0], q[1], p.w / 2, yPath, 0xffffff, 8, 1 / 4);
    } else {
      walk.ribbon(pts, p.w, yPath, 0xffffff, 1 / 3);
    }
  }
  group.add(
    walk.mesh(layered(new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1, color: 0xdcd8cf }), GROUND_LEVEL.path), 'receive'),
    promenade.mesh(layered(new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 0.9, color: 0xcfcdc8 }), GROUND_LEVEL.path), 'receive'),
  );

  // ---- tram tracks: sett bed, grooved rails, overhead wire and poles ----
  const bed = new MeshBuilder();
  const rails = new MeshBuilder();
  const poles = new MeshBuilder();
  const wire: number[] = [];
  const rng = mulberry32(24);
  let sincePole = 0;
  for (const t of osm.tram) {
    const pts = toRing(t.p);
    bed.ribbon(pts, 2.5, yBed, 0xffffff, 1 / 2);
    for (const side of [-1, 1]) rails.ribbon(offsetPolyline(pts, (side * TRAM_GAUGE) / 2), 0.11, yRail, 0xffffff);
    for (let i = 1; i < pts.length; i++) wire.push(pts[i - 1][0], WIRE_HEIGHT, pts[i - 1][1], pts[i][0], WIRE_HEIGHT, pts[i][1]);
    if (t.s) continue;
    const line = new Polyline(pts);
    const s = { x: 0, z: 0, tx: 1, tz: 0 };
    for (let d = 38 - sincePole; d < line.length; d += 38) {
      line.at(d, s);
      const px = s.x - s.tz * 3.1;
      const pz = s.z + s.tx * 3.1;
      if (!inBounds(px, pz) || world.collision.blocked(px, pz)) continue;
      const rot = Math.atan2(s.tz, -s.tx);
      poles.add(poleGeometry, xf(px, 0, pz), 0x4a5650);
      // bracket arm reaching over the track
      poles.box(0.07, 0.07, 3.3, xf(px + s.tz * 1.6, WIRE_HEIGHT + 0.25, pz - s.tx * 1.6, rot), 0x4a5650);
      poles.box(0.03, 0.03, 3.2, xf(px + s.tz * 1.55, WIRE_HEIGHT + 0.6, pz - s.tx * 1.55, rot, 0.21), 0x4a5650);
    }
    sincePole = (sincePole + line.length) % 38;
    if (rng() < 0.02) sincePole = 0;
  }
  const bedMesh = bed.mesh(layered(new THREE.MeshStandardMaterial({ map: trackBedTexture(), roughness: 0.9 }), GROUND_LEVEL.bed), 'receive');
  const railMesh = rails.mesh(layered(new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.35, metalness: 0.9 }), GROUND_LEVEL.rail), 'receive');
  const poleMesh = poles.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), 'cast');
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wires = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: 0x22262a, transparent: true, opacity: 0.75 }));
  group.add(bedMesh, railMesh, poleMesh, wires);

  // ---- raised tram and bus platforms ----
  const platforms = new MeshBuilder();
  const H = 0.24;
  for (const a of osm.areas) {
    if (a.k !== 'platform') continue;
    const ring: P2[] = toRing(a.p);
    platforms.polygon(ring, [], H, 0xc9c6bd);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      platforms.quad([q[0], 0, q[1]], [p[0], 0, p[1]], [p[0], H, p[1]], [q[0], H, q[1]], 0xe8e6e0);
    }
  }
  group.add(platforms.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'both'));
}

const poleGeometry = new THREE.CylinderGeometry(0.1, 0.14, WIRE_HEIGHT + 1.2, 8).translate(0, (WIRE_HEIGHT + 1.2) / 2, 0);
