import * as THREE from 'three';
import { facadeMaterial, tintMaterial } from '../../core/materials';
import { MeshBuilder, type V3 } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { canvasTexture, FONT_CONDENSED, FONT_SANS, speckle, textSign } from '../../core/textures';
import { obb } from '../../core/geo';
import { walls } from '../buildings';
import { RAIL, stadtbahnTracks } from '../rail';
import type { World } from '../world';
import { centreOf, frameOf, freeSpot, outlineOf } from './common';
import type { Landmark } from './types';

export const STATION = { baseTop: 7.2, wallTop: 14.4, ridge: 21.6, hallHalfWidth: 19.4 };


/** Ground floor: pale stone piers with tall arched shop windows. */
function baseTextures(): [THREE.Texture, THREE.Texture] {
  const draw = (mask: boolean) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        const rng = mulberry32(91);
        g.fillStyle = mask ? 'rgb(0,225,0)' : '#d8cfb8';
        g.fillRect(0, 0, w, h);
        if (!mask) {
          speckle(g, w, h, rng, 3000, 'rgba(255,255,255,0.1)', 'rgba(60,40,10,0.1)', 2);
          g.strokeStyle = 'rgba(90,75,50,0.25)';
          for (let j = 1; j < 9; j++) {
            g.beginPath();
            g.moveTo(0, (j * h) / 9);
            g.lineTo(w, (j * h) / 9);
            g.stroke();
          }
        }
        const cx = w / 2;
        const r = w * 0.34;
        const spring = h * 0.42;
        g.fillStyle = mask ? 'rgb(255,24,120)' : '#33414c';
        g.beginPath();
        g.moveTo(cx - r, h * 0.93);
        g.lineTo(cx - r, spring);
        g.arc(cx, spring, r, Math.PI, 0);
        g.lineTo(cx + r, h * 0.93);
        g.closePath();
        g.fill();
        g.strokeStyle = mask ? 'rgb(0,140,40)' : '#1d2226';
        g.lineWidth = 4;
        for (let i = 1; i < 4; i++) {
          g.beginPath();
          g.moveTo(cx - r + (2 * r * i) / 4, spring - (i === 2 ? r : r * 0.86));
          g.lineTo(cx - r + (2 * r * i) / 4, h * 0.93);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(cx - r, spring);
        g.lineTo(cx + r, spring);
        g.stroke();
        // shop sign across the springing line
        g.fillStyle = mask ? 'rgb(150,200,0)' : '#efe6cf';
        g.fillRect(cx - r + 12, spring + 8, 2 * r - 24, 18);
        g.fillStyle = mask ? 'rgb(0,225,0)' : '#8c8672';
        g.fillRect(0, h * 0.93, w, h * 0.07);
        g.fillStyle = mask ? 'rgb(0,225,0)' : '#efe7d2';
        g.fillRect(0, 0, w, h * 0.05);
      },
      { srgb: !mask },
    );
  return [draw(false), draw(true)];
}

/** Steel-framed glazing: opaque bars, translucent panes. */
function glazingTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(150,185,205,0.30)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(56,66,70,1)';
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, 0, 5, h);
    g.fillStyle = 'rgba(56,66,70,0.9)';
    g.fillRect(w / 2 - 1, 0, 3, h);
    g.fillRect(0, h / 2 - 1, w, 3);
  });
}

function roundel(letter: string, bg: string, round: boolean): THREE.Texture {
  return canvasTexture(
    128,
    128,
    (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = bg;
      if (round) {
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(2, 2, w - 4, w - 4);
      }
      g.fillStyle = '#fff';
      g.font = `700 ${w * 0.78}px ${FONT_SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, w / 2, w / 2 + w * 0.05);
    },
    { repeat: false },
  );
}

export const sBahnRoundel = (): THREE.Texture => roundel('S', '#1d8f3a', true);
export const uBahnSquare = (): THREE.Texture => roundel('U', '#1456a8', false);

export function buildStation(world: World): Landmark {
  const group = new THREE.Group();
  group.name = 'station';
  world.layers.landmarks.add(group);
  const outline = outlineOf('station');
  const box = obb(outline);
  const f = frameOf(box);
  const S = STATION;
  const L = box.halfL - 1.2;
  const W = S.hallHalfWidth;
  // where each track crosses the middle of the hall, measured across it
  const tracks = stadtbahnTracks();
  const TRACK_OFFSETS = [...tracks.s, ...tracks.r]
    .map((line) => {
      const p = line.at(line.project(box.cx, box.cz).s);
      return (p.x - box.cx) * box.vx + (p.z - box.cz) * box.vz;
    })
    .sort((a, c) => a - c);

  // ---- ground floor under the tracks ----
  const [baseMap, baseMask] = baseTextures();
  const base = new MeshBuilder();
  walls(base, outline, 0, S.baseTop, { tileW: 8.2 }, new THREE.Color(0xffffff), 0, 0, 1);
  group.add(base.mesh(facadeMaterial({ map: baseMap, mask: baseMask, lit: 0.95, glow: 1.8, doubleSide: true })));

  const b = new MeshBuilder(true);
  const steel = 0x4f5d5a;
  const zinc = 0xaeb4b6;
  b.polygon(outline, [], RAIL.deck, 0x5f5850, 0.2);
  b.polygon(outline, [], 0.05, 0x9a968c, 0.2);

  // ---- hall profile: glazed side walls and a shallow elliptical vault ----
  const ARC = 20;
  const arc: [number, number][] = [];
  for (let i = 0; i <= ARC; i++) {
    const t = (i / ARC) * Math.PI;
    arc.push([W * Math.cos(t), S.wallTop + (S.ridge - S.wallTop) * Math.sin(t)]);
  }
  const pt = (x: number, y: number, z: number): V3 => {
    const p = f.point(x, y, z);
    return [p.x, p.y, p.z];
  };
  const glass = new MeshBuilder();
  for (let i = 0; i < ARC; i++) {
    const [z0, y0] = arc[i];
    const [z1, y1] = arc[i + 1];
    const mid = (i + 0.5) / ARC;
    // a glazed lantern runs along the crown, the haunches are zinc
    const skylight = Math.abs(mid - 0.5) < 0.16;
    const target = skylight ? glass : b;
    target.quad(pt(-L, y0, z0), pt(L, y0, z0), pt(L, y1, z1), pt(-L, y1, z1), skylight ? 0xffffff : zinc, [0, 0, (2 * L) / 2.6, 2]);
    if (!skylight) b.quad(pt(L, y0, z0), pt(-L, y0, z0), pt(-L, y1, z1), pt(L, y1, z1), 0x8d9396);
  }
  // long glazed walls between hall floor and the springing of the vault
  for (const side of [-1, 1]) {
    const z = side * W;
    const a = pt(-L * side, S.baseTop, z);
    const c = pt(L * side, S.baseTop, z);
    glass.quad(a, c, [c[0], S.wallTop, c[2]], [a[0], S.wallTop, a[2]], 0xffffff, [0, 0, (2 * L) / 2.6, (S.wallTop - S.baseTop) / 2.4]);
    b.box(2 * L, 0.5, 0.5, f.at(0, S.wallTop, z), steel);
    b.box(2 * L, 0.35, 0.4, f.at(0, S.baseTop + 0.2, z), steel);
  }
  // gable aprons above the track openings
  const apron = 13.1;
  for (const end of [-1, 1]) {
    const x = end * L;
    for (let i = 0; i < ARC; i++) {
      const [z0, y0] = arc[i];
      const [z1, y1] = arc[i + 1];
      const quad: [V3, V3, V3, V3] = [pt(x, apron, z0), pt(x, apron, z1), pt(x, y1, z1), pt(x, y0, z0)];
      if (end > 0) quad.reverse();
      glass.quad(quad[0], quad[1], quad[2], quad[3], 0xffffff, [z0 / 2.6, 0, z1 / 2.6, 3]);
    }
    b.box(0.5, 0.6, 2 * W, f.at(x, apron, 0), steel);
    for (const side of [-1, 1]) b.box(0.6, apron - S.baseTop, 0.6, f.at(x, (apron + S.baseTop) / 2, side * W), steel);
  }
  // arched ribs with their columns
  const ribs = Math.round((2 * L) / 8.2);
  for (let k = 0; k <= ribs; k++) {
    const x = -L + (2 * L * k) / ribs;
    for (let i = 0; i < ARC; i++) {
      const [z0, y0] = arc[i];
      const [z1, y1] = arc[i + 1];
      const len = Math.hypot(z1 - z0, y1 - y0);
      b.box(0.28, 0.42, len + 0.05, f.at(x, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2, 0, -Math.atan2(y1 - y0, z1 - z0)), steel);
    }
    for (const side of [-1, 1]) b.box(0.3, S.wallTop - S.baseTop, 0.3, f.at(x, (S.wallTop + S.baseTop) / 2, side * W), steel);
    // tie rod and hanging lamps
    b.box(0.08, 0.08, 2 * W, f.at(x, S.wallTop + 0.3, 0), steel);
    for (const z of [-8.4, 8.6]) b.box(0.25, 0.12, 2.2, f.at(x, S.wallTop - 0.4, z), 0xf4f1e4, { glow: 0xfff0c8 });
  }
  for (const z of [-W * 0.62, 0, W * 0.62]) {
    const t = Math.acos(z / W);
    b.box(2 * L, 0.2, 0.2, f.at(0, S.wallTop + (S.ridge - S.wallTop) * Math.sin(t) - 0.35, z), steel);
  }

  // ---- island platforms between each pair of tracks ----
  const platformLength = 2 * L - 14;
  for (const [a, c] of [[TRACK_OFFSETS[0], TRACK_OFFSETS[1]], [TRACK_OFFSETS[2], TRACK_OFFSETS[3]]]) {
    const z = (a + c) / 2;
    const width = c - a - 3.3;
    b.box(platformLength, RAIL.platform - RAIL.deck, width, f.at(0, (RAIL.platform + RAIL.deck) / 2, z), 0xb9b6ae);
    for (const side of [-1, 1]) b.box(platformLength, 0.02, 0.35, f.at(0, RAIL.platform + 0.01, z + side * (width / 2 - 0.35)), 0xf2f0e8);
    for (let x = -platformLength / 2 + 14; x < platformLength / 2; x += 21) {
      // bench, timetable case and stair balustrade stand-ins
      b.box(2.4, 0.45, 0.6, f.at(x, RAIL.platform + 0.42, z), 0x375a46);
      for (const [ox, oz] of [[-3.5, 1.8], [2.6, -2.1], [9.5, 1.2], [-8, -1.5]]) {
        const spot = f.point(x + ox, RAIL.platform, z + oz);
        world.spots.push([spot.x, spot.y, spot.z]);
      }
      b.box(0.12, 2.3, 1.5, f.at(x + 6, RAIL.platform + 1.15, z), 0x2d3336);
      b.box(0.14, 1.3, 1.3, f.at(x + 6, RAIL.platform + 1.3, z), 0xe9e9e2, { glow: 0x8fa0a0 });
    }
  }
  group.add(b.mesh(tintMaterial({ roughness: 0.6, metalness: 0.35 })));

  const glazing = glazingTexture();
  const glassMesh = glass.mesh(new THREE.MeshStandardMaterial({ map: glazing, transparent: true, roughness: 0.12, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 }), 'none');
  glassMesh.renderOrder = 2;
  group.add(glassMesh);

  // ---- signs ----
  const name = textSign('Alexanderplatz', { bg: '#f7f7f2', fg: '#15191c', font: FONT_CONDENSED, weight: 600, px: 110, pad: 0.28 });
  const nameMaterial = new THREE.MeshStandardMaterial({ map: name.texture, emissive: 0xffffff, emissiveMap: name.texture, emissiveIntensity: 0.25, roughness: 0.6 });
  const boardH = 0.62;
  for (const z of [(TRACK_OFFSETS[0] + TRACK_OFFSETS[1]) / 2, (TRACK_OFFSETS[2] + TRACK_OFFSETS[3]) / 2]) {
    for (let x = -platformLength / 2 + 10; x < platformLength / 2; x += 26) {
      for (const face of [0, Math.PI]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(boardH * name.aspect, boardH), nameMaterial);
        m.applyMatrix4(f.at(x, RAIL.platform + 3.0, z + (face ? -0.03 : 0.03), face));
        group.add(m);
      }
    }
  }
  const big = textSign('Bahnhof Alexanderplatz', { fg: '#f4f1e6', font: FONT_CONDENSED, weight: 600, px: 150, pad: 0.1, letterSpacing: 0.05 });
  const bigMaterial = new THREE.MeshStandardMaterial({ map: big.texture, transparent: true, alphaTest: 0.35, emissive: 0xfff1c9, emissiveMap: big.texture, emissiveIntensity: 0.5, roughness: 0.5 });
  const sMaterial = new THREE.MeshStandardMaterial({ map: sBahnRoundel(), transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: sBahnRoundel(), emissiveIntensity: 0.35 });
  const uMaterial = new THREE.MeshStandardMaterial({ map: uBahnSquare(), transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: uBahnSquare(), emissiveIntensity: 0.35 });
  for (const side of [-1, 1]) {
    const rot = side > 0 ? 0 : Math.PI;
    const z = side * (W + 0.45);
    const lettering = new THREE.Mesh(new THREE.PlaneGeometry(1.9 * big.aspect, 1.9), bigMaterial);
    lettering.applyMatrix4(f.at(0, S.wallTop - 1.6, z, rot));
    group.add(lettering);
    for (const [x, material] of [[-26, sMaterial], [26, uMaterial]] as const) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), material);
      sign.applyMatrix4(f.at(x * side, S.wallTop - 1.6, z, rot));
      group.add(sign);
    }
  }

  // street viewpoint on the Alexanderplatz side of the hall
  const clock = centreOf('weltzeituhr');
  const plazaSide = Math.sign((clock[0] - box.cx) * box.vx + (clock[1] - box.cz) * box.vz) || 1;
  const side = f.point(22, 0, plazaSide * 64);
  const [sx, sz] = freeSpot(world, side.x, side.z);
  return {
    id: 'station',
    height: 22,
    name: 'Bahnhof Alexanderplatz',
    kind: 'Stadtbahn station · 1882, hall rebuilt 1926',
    facts: ['Glazed hall about 165 m long and 40 m wide on the Stadtbahn viaduct', 'Two island platforms: S-Bahn on the plaza side, regional trains toward the Fernsehturm', 'Three U-Bahn lines cross underneath'],
    approximated: 'Hall profile and heights, facade bays, platform fittings and signage.',
    anchor: [box.cx, S.ridge + 6, box.cz],
    orbit: { target: [box.cx, 10, box.cz], distance: 250, bearing: 232, tilt: 66 },
    street: { x: sx, z: sz, lookAt: [box.cx, 12, box.cz] },
  };
}
