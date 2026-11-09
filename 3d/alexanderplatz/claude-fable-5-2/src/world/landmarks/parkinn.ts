import * as THREE from 'three';
import { toRing } from '../../core/geo';
import { facadeMaterial, tintMaterial } from '../../core/materials';
import { MeshBuilder } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { canvasTexture, FONT_CONDENSED, speckle, textSign } from '../../core/textures';
import { osm } from '../../data/osm';
import { walls } from '../buildings';
import type { World } from '../world';
import { frameOf, holesOf, outlineOf, partByHeight, sightSpot } from './common';
import type { Landmark } from './types';

export const PARK_INN = { roofHeight: 125, mastHeight: 149.5, floors: 37 };

/** Curtain wall: mirror glass with a white pinstripe at every floor. */
function towerTextures(): [THREE.Texture, THREE.Texture] {
  const draw = (mask: boolean) =>
    canvasTexture(
      128,
      256,
      (g, w, h) => {
        if (mask) {
          g.fillStyle = 'rgb(255,22,150)';
          g.fillRect(0, 0, w, h);
          g.fillStyle = 'rgb(0,120,60)';
          g.fillRect(0, h * 0.8, w, h * 0.2);
          g.fillRect(0, 0, w * 0.06, h);
          return;
        }
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#93aabb');
        grad.addColorStop(0.75, '#6b8496');
        grad.addColorStop(1, '#566d7e');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#e8ecef';
        g.fillRect(0, h * 0.8, w, h * 0.07);
        g.fillStyle = '#7f95a4';
        g.fillRect(0, h * 0.87, w, h * 0.13);
        g.fillStyle = '#d5dade';
        g.fillRect(0, 0, w * 0.06, h);
      },
      { srgb: !mask },
    );
  return [draw(false), draw(true)];
}

/** Two-storey retail base: shop glazing below a clad upper floor. */
function podiumTextures(): [THREE.Texture, THREE.Texture] {
  const draw = (mask: boolean) =>
    canvasTexture(
      256,
      256,
      (g, w, h) => {
        const rng = mulberry32(61);
        g.fillStyle = mask ? 'rgb(0,225,0)' : '#d9d7d1';
        g.fillRect(0, 0, w, h);
        if (!mask) speckle(g, w, h, rng, 2500, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.08)');
        // ribbon window upstairs
        g.fillStyle = mask ? 'rgb(255,24,130)' : '#4f6170';
        g.fillRect(0, h * 0.12, w, h * 0.2);
        // fascia with illuminated lettering strip
        g.fillStyle = mask ? 'rgb(0,200,0)' : '#3b4146';
        g.fillRect(0, h * 0.44, w, h * 0.12);
        g.fillStyle = mask ? 'rgb(140,200,0)' : '#f1efe6';
        g.fillRect(w * 0.12, h * 0.47, w * 0.76, h * 0.06);
        // shop glazing
        g.fillStyle = mask ? 'rgb(255,24,130)' : '#56697a';
        g.fillRect(w * 0.04, h * 0.58, w * 0.92, h * 0.36);
        g.fillStyle = mask ? 'rgb(0,150,40)' : '#2c3136';
        for (const x of [0.04, 0.35, 0.65, 0.94]) g.fillRect(w * x - 2, h * 0.58, 4, h * 0.36);
        g.fillStyle = mask ? 'rgb(0,225,0)' : '#8a8a86';
        g.fillRect(0, h * 0.94, w, h * 0.06);
      },
      { srgb: !mask },
    );
  return [draw(false), draw(true)];
}

export function buildParkInn(world: World): Landmark {
  const group = new THREE.Group();
  group.name = 'park-inn';
  world.layers.landmarks.add(group);
  const data = osm.landmarks.parkInn;
  const tower = partByHeight('parkInn', PARK_INN.roofHeight, 800);
  const podiumH = 10.5;

  // ---- podium ----
  const [podMap, podMask] = podiumTextures();
  const podium = new MeshBuilder();
  const outline = outlineOf('parkInn');
  const holes = holesOf('parkInn');
  for (const r of [outline, ...holes]) walls(podium, r, 0, podiumH, { tileW: 6.5 }, new THREE.Color(0xffffff), 0, 0, 1);
  group.add(podium.mesh(facadeMaterial({ map: podMap, mask: podMask, lit: 0.95, glow: 1.9, doubleSide: true })));

  const trim = new MeshBuilder(true);
  trim.polygon(outline, holes, podiumH - 0.3, 0x66696d, 0.2);
  // setbacks and plant mapped on the podium roof
  for (const p of data.parts) {
    if (p.h == null || p.h > 20 || (p.mh ?? 0) < 5) continue;
    const ring = toRing(p.p);
    walls(trim, ring, p.mh ?? 0, p.h, { tileW: 4 }, new THREE.Color(0xc9c8c3), 0, 0, 0.1);
    trim.polygon(ring, [], p.h, 0x77797c, 0.2);
  }

  // ---- tower ----
  const [towerMap, towerMask] = towerTextures();
  const shaft = new MeshBuilder();
  const base = tower.part.mh ?? podiumH;
  const floors = PARK_INN.floors;
  walls(shaft, tower.ring, base, PARK_INN.roofHeight, { tileW: 1.35 }, new THREE.Color(0xffffff), 0, 0, floors);
  group.add(shaft.mesh(facadeMaterial({ map: towerMap, mask: towerMask, lit: 0.42, glow: 1.25, envMapIntensity: 1.6, doubleSide: true })));
  trim.polygon(tower.ring, [], PARK_INN.roofHeight, 0x5d6064, 0.2);

  // crown: louvred plant floors
  const f = frameOf(tower.box);
  const L = tower.box.halfL;
  const W = tower.box.halfW;
  trim.box(L * 2 - 3, 4.2, W * 2 - 3, f.at(0, PARK_INN.roofHeight + 2.1, 0), 0x4b5055);
  trim.box(L * 2 - 1.5, 0.5, W * 2 - 1.5, f.at(0, PARK_INN.roofHeight + 4.4, 0), 0xd5d8da);
  for (let i = -6; i <= 6; i++) trim.box(0.25, 4.2, W * 2 - 2.8, f.at((i / 6.5) * (L - 1.5), PARK_INN.roofHeight + 2.1, 0), 0x8d9296);
  // corner fins that run the full height of the slab ends
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) trim.box(0.5, PARK_INN.roofHeight - base, 0.5, f.at(sx * (L + 0.05), (PARK_INN.roofHeight + base) / 2, sz * (W + 0.05)), 0xe3e6e8);
  }
  // roof mast with platforms
  const mastH = PARK_INN.mastHeight - PARK_INN.roofHeight - 4.6;
  trim.add(new THREE.CylinderGeometry(0.22, 0.45, mastH, 10), f.at(L * 0.55, PARK_INN.roofHeight + 4.6 + mastH / 2, 0), 0xd0d3d6);
  trim.add(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 14), f.at(L * 0.55, PARK_INN.roofHeight + 4.6 + mastH * 0.45, 0), 0x9aa0a6);
  trim.box(0.5, 0.5, 0.5, f.at(L * 0.55, PARK_INN.mastHeight, 0), 0xaa2222, { glow: 0xff3322 });
  // viewing terrace rail on the roof edge
  trim.box(L * 2, 1.1, 0.08, f.at(0, PARK_INN.roofHeight + 0.55, W - 0.2), 0xbfc5c9);
  trim.box(L * 2, 1.1, 0.08, f.at(0, PARK_INN.roofHeight + 0.55, -W + 0.2), 0xbfc5c9);
  group.add(trim.mesh(tintMaterial({ roughness: 0.6, metalness: 0.2 })));

  // rooftop lettering on both long sides
  const sign = textSign('PARK INN', { fg: '#ffffff', font: FONT_CONDENSED, weight: 700, px: 160, pad: 0.12, letterSpacing: 0.06 });
  const signMaterial = new THREE.MeshStandardMaterial({ map: sign.texture, transparent: true, alphaTest: 0.4, emissive: 0xffffff, emissiveMap: sign.texture, emissiveIntensity: 0.9, roughness: 0.4 });
  const signH = 5.4;
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(signH * sign.aspect, signH), signMaterial);
    m.applyMatrix4(f.at(0, PARK_INN.roofHeight + 7.6, side * (W - 0.6), side > 0 ? 0 : Math.PI));
    group.add(m);
  }
  // sign frame
  const frame = new MeshBuilder();
  for (const side of [-1, 1]) frame.box(signH * sign.aspect + 1, 0.25, 0.25, f.at(0, PARK_INN.roofHeight + 4.9, side * (W - 0.6)), 0x8d9296);
  group.add(frame.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 })));

  const [sx, sz] = sightSpot(world, [tower.box.cx, tower.box.cz], [tower.box.cx + 20, tower.box.cz + 170], 100);
  return {
    id: 'park-inn',
    height: 125,
    name: 'Park Inn',
    kind: 'Hotel tower · 1970',
    facts: ['125 m to the roof, about 150 m with the mast', '37 hotel floors above a two-storey retail base', 'Opened as Interhotel Stadt Berlin'],
    approximated: 'Facade grid, podium shopfronts, rooftop plant and lettering.',
    anchor: [tower.box.cx, PARK_INN.mastHeight + 6, tower.box.cz],
    orbit: { target: [tower.box.cx, 62, tower.box.cz], distance: 400, bearing: 25, tilt: 74 },
    street: { x: sx, z: sz, lookAt: [tower.box.cx, 90, tower.box.cz] },
  };
}
