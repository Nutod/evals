import * as THREE from 'three';
import { obb } from '../../core/geo';
import { facadeMaterial, tintMaterial } from '../../core/materials';
import { Frame, MeshBuilder, type V3 } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { blotches, canvasTexture, speckle } from '../../core/textures';
import type { World } from '../world';
import { copperTexture, freeSpot, outlineOf, partByHeight } from './common';
import type { Landmark } from './types';

export const MARIENKIRCHE = { spireTip: 90, towerStone: 48, eaves: 15, ridge: 31, naveHalfWidth: 12 };

/** Brick bay with a pointed lancet window and tracery. */
function bayTextures(): [THREE.Texture, THREE.Texture] {
  const W = 256;
  const H = 512;
  const draw = (mask: boolean) =>
    canvasTexture(
      W,
      H,
      (g) => {
        const rng = mulberry32(111);
        if (mask) {
          g.fillStyle = 'rgb(0,230,0)';
          g.fillRect(0, 0, W, H);
        } else {
          g.fillStyle = '#8d5a44';
          g.fillRect(0, 0, W, H);
          for (let j = 0; j < 80; j++) {
            for (let i = -1; i < 10; i++) {
              const v = 0.8 + rng() * 0.28;
              g.fillStyle = `rgb(${Math.round(186 * v)},${Math.round(96 * v)},${Math.round(64 * v)})`;
              g.fillRect((i + (j % 2) * 0.5) * (W / 10) + 0.5, j * (H / 80) + 0.5, W / 10 - 1, H / 80 - 1);
            }
          }
          blotches(g, W, H, rng, 10, 'rgba(50,25,15,0.2)', 120);
        }
        const lancet = (cx: number, top: number, w: number, h: number, fill: string): void => {
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(cx - w / 2, top + h);
          g.lineTo(cx - w / 2, top + w * 0.9);
          g.quadraticCurveTo(cx - w / 2, top + w * 0.2, cx, top);
          g.quadraticCurveTo(cx + w / 2, top + w * 0.2, cx + w / 2, top + w * 0.9);
          g.lineTo(cx + w / 2, top + h);
          g.closePath();
          g.fill();
        };
        lancet(W / 2, 70, 104, 330, mask ? 'rgb(0,230,0)' : '#d9c4a8');
        lancet(W / 2, 84, 84, 308, mask ? 'rgb(255,40,60)' : '#252b38');
        if (!mask) {
          g.fillStyle = '#d9c4a8';
          g.fillRect(W / 2 - 15, 150, 4, 242);
          g.fillRect(W / 2 + 11, 150, 4, 242);
          g.fillRect(W / 2 - 42, 250, 84, 4);
          // fieldstone plinth
          for (let i = 0; i < 40; i++) {
            const v = 120 + Math.floor(rng() * 70);
            g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
            g.beginPath();
            g.ellipse(rng() * W, 462 + rng() * 46, 12 + rng() * 10, 8 + rng() * 6, 0, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#d9c4a8';
          g.fillRect(0, 0, W, 14);
        }
      },
      { srgb: !mask },
    );
  return [draw(false), draw(true)];
}

/** Pale limestone blocks of the west tower. */
function limestoneTexture(): THREE.Texture {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(112);
    g.fillStyle = '#b8b2a4';
    g.fillRect(0, 0, w, h);
    const rows = 22;
    for (let j = 0; j < rows; j++) {
      let x = -rng() * 40;
      while (x < w) {
        const bw = 26 + rng() * 44;
        const v = 176 + Math.floor(rng() * 40);
        g.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
        g.fillRect(x + 1, j * (h / rows) + 1, bw - 2, h / rows - 2);
        x += bw;
      }
    }
    blotches(g, w, h, rng, 14, 'rgba(60,55,45,0.18)', 130);
    speckle(g, w, h, rng, 6000, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.1)', 2);
  });
}

function tileTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = mulberry32(113);
    g.fillStyle = '#7d3b2c';
    g.fillRect(0, 0, w, h);
    const rows = 16;
    for (let j = 0; j < rows; j++) {
      for (let i = -1; i < 16; i++) {
        const v = 0.78 + rng() * 0.3;
        g.fillStyle = `rgb(${Math.round(176 * v)},${Math.round(82 * v)},${Math.round(58 * v)})`;
        g.beginPath();
        g.roundRect((i + (j % 2) * 0.5) * (w / 16) + 1, j * (h / rows), w / 16 - 2, h / rows + 4, [0, 0, 6, 6]);
        g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, j * (h / rows), w, 2);
    }
  });
}

export function buildMarienkirche(world: World): Landmark {
  const group = new THREE.Group();
  group.name = 'marienkirche';
  world.layers.landmarks.add(group);
  const M = MARIENKIRCHE;
  const box = obb(outlineOf('marienkirche'));
  const spire = partByHeight('marienkirche', M.spireTip);
  // local frame: +X runs from the west tower toward the choir
  const towardTower = (spire.box.cx - box.cx) * box.ux + (spire.box.cz - box.cz) * box.uz;
  const ex = towardTower < 0 ? box.ux : -box.ux;
  const ez = towardTower < 0 ? box.uz : -box.uz;
  const f = Frame.plan(box.cx, box.cz, Math.atan2(-ez, ex));
  const half = box.halfL;
  const pt = (x: number, y: number, z: number): V3 => {
    const p = f.point(x, y, z);
    return [p.x, p.y, p.z];
  };

  const [bayMap, bayMask] = bayTextures();
  const brick = new MeshBuilder();
  const roof = new MeshBuilder();
  const b = new MeshBuilder(true);
  const white = 0xffffff;
  const brickRed = 0xb5694a;
  const stoneGrey = 0xbcb6a8;
  const copper = 0xe6f2ec;

  const towerDepth = 13.5;
  const naveX0 = -half + towerDepth;
  const naveX1 = half - 27;
  const choirX1 = half - 7;
  const NW = M.naveHalfWidth;
  const CW = 6.4;
  const bay = 5.6;

  /** Vertical wall between two plan points, textured in whole bays. */
  const wall = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, bays?: number): void => {
    const n = bays ?? Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / bay));
    brick.quad(pt(x0, y0, z0), pt(x1, y0, z1), pt(x1, y1, z1), pt(x0, y1, z0), white, [0, 0, n, 1]);
  };
  /** Gable roof over a rectangle running along X. */
  const gable = (x0: number, x1: number, hw: number, eaves: number, ridge: number): void => {
    const o = 0.5;
    roof.quad(pt(x0, eaves, hw + o), pt(x1, eaves, hw + o), pt(x1, ridge, 0), pt(x0, ridge, 0), white, [0, 0, (x1 - x0) / 3, 5]);
    roof.quad(pt(x1, eaves, -hw - o), pt(x0, eaves, -hw - o), pt(x0, ridge, 0), pt(x1, ridge, 0), white, [0, 0, (x1 - x0) / 3, 5]);
  };

  // ---- nave ----
  wall(naveX0, NW, naveX1, NW, 0, M.eaves);
  wall(naveX1, -NW, naveX0, -NW, 0, M.eaves);
  wall(naveX1, NW, naveX1, CW, 0, M.eaves, 0.04);
  wall(naveX1, -CW, naveX1, -NW, 0, M.eaves, 0.04);
  gable(naveX0, naveX1, NW, M.eaves, M.ridge);
  // east gable of the nave, above the choir roof
  b.tri(pt(naveX1, M.eaves, NW), pt(naveX1, M.eaves, -NW), pt(naveX1, M.ridge, 0), brickRed);
  for (let x = naveX0 + bay; x < naveX1 - 1; x += bay) {
    for (const side of [-1, 1]) {
      b.box(1.1, M.eaves - 2.5, 1.9, f.at(x, (M.eaves - 2.5) / 2, side * (NW + 0.95)), brickRed);
      b.box(1.1, 2.6, 1.3, f.at(x, M.eaves - 2.2, side * (NW + 0.6), 0, side * 0.5), 0x8f4a36);
    }
  }

  // ---- choir with a polygonal apse ----
  const choirEaves = M.eaves;
  const choirRidge = 26.5;
  wall(naveX1, CW, choirX1, CW, 0, choirEaves);
  wall(choirX1, -CW, naveX1, -CW, 0, choirEaves);
  gable(naveX1, choirX1, CW, choirEaves, choirRidge);
  const apse: [number, number][] = [[choirX1, CW], [choirX1 + 4.6, CW * 0.62], [half, 0], [choirX1 + 4.6, -CW * 0.62], [choirX1, -CW]];
  for (let i = 0; i < apse.length - 1; i++) {
    const [x0, z0] = apse[i];
    const [x1, z1] = apse[i + 1];
    wall(x0, z0, x1, z1, 0, choirEaves, 1);
    roof.tri(pt(x0, choirEaves, z0), pt(x1, choirEaves, z1), pt(choirX1, choirRidge, 0), white, [0, 0, 1, 0, 0.5, 3]);
    b.box(0.9, choirEaves - 2, 1.5, f.at(x1, (choirEaves - 2) / 2, z1, Math.atan2(-z1, x1 - choirX1 + 0.01)), brickRed);
  }

  // side chapels and sacristy with lean-to roofs
  const annex = (x: number, z: number, w: number, d: number, h: number): void => {
    const side = Math.sign(z);
    b.box(w, h, d, f.at(x, h / 2, z), brickRed);
    roof.quad(pt(x - w / 2 - 0.3, h, z + (side * d) / 2 + side * 0.3), pt(x + w / 2 + 0.3, h, z + (side * d) / 2 + side * 0.3), pt(x + w / 2 + 0.3, h + 2.6, z - (side * d) / 2), pt(x - w / 2 - 0.3, h + 2.6, z - (side * d) / 2), white, [0, 0, w / 3, 1.5]);
    b.box(1.6, h * 0.55, 0.15, f.at(x, h * 0.5, z + side * (d / 2 + 0.03)), 0x242a36, { glow: 0x40301c });
  };
  for (const x of [naveX0 + 5.5, naveX0 + 13.5, naveX0 + 21.5, naveX0 + 29]) annex(x, NW + 2.6, 7.2, 5.2, 9.5);
  annex(naveX1 + 6, -(CW + 3), 10, 6, 4.6);

  // ---- west tower: limestone westwork and shaft ----
  const stone = limestoneTexture();
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.92 });
  const towerX = -half + towerDepth / 2;
  const stoneBlock = (w: number, h: number, d: number, y: number, repeat: [number, number]): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat[0], uv.getY(i) * repeat[1]);
    const m = new THREE.Mesh(g, stoneMaterial);
    m.applyMatrix4(f.at(towerX, y + h / 2, 0));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  stoneBlock(towerDepth, 21, NW * 2 + 1.2, 0, [2, 2.5]);
  const tw = 12.6;
  stoneBlock(tw, M.towerStone - 21, tw, 21, [1.4, 3.2]);
  // sloped shoulders where the westwork narrows to the shaft
  for (const side of [-1, 1]) {
    roof.quad(pt(towerX - towerDepth / 2, 21, side * (NW + 0.6)), pt(towerX + towerDepth / 2, 21, side * (NW + 0.6)), pt(towerX + towerDepth / 2, 26.5, (side * tw) / 2), pt(towerX - towerDepth / 2, 26.5, (side * tw) / 2), white, [0, 0, 4, 2]);
  }
  // portal, lancets and clock
  b.box(0.3, 8.5, 4.4, f.at(-half - 0.1, 4.25, 0), 0x2a2220);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const r = tw / 2 + 0.05;
    for (const off of [-2.4, 2.4]) {
      b.box(1.5, 9.5, 0.2, f.at(towerX + Math.sin(a) * r + Math.cos(a) * off, 38, Math.cos(a) * r - Math.sin(a) * off, a), 0x23262c);
    }
    b.add(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 24), f.at(towerX + Math.sin(a) * r, 29.5, Math.cos(a) * r, a, Math.PI / 2), 0xe9e0c6, { glow: 0x7a6a40 });
  }
  b.box(tw + 1, 0.8, tw + 1, f.at(towerX, M.towerStone, 0), stoneGrey);

  // ---- copper crown: two open octagonal stages and a spire ----
  const cu = new MeshBuilder();
  const stage = (y0: number, y1: number, r: number): void => {
    cu.add(new THREE.CylinderGeometry(r * 0.94, r, y1 - y0, 8), f.at(towerX, (y0 + y1) / 2, 0, Math.PI / 8), white);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = r * 0.93;
      // dark gothic openings and a slim pinnacle on every corner
      b.box(r * 0.42, (y1 - y0) * 0.62, 0.2, f.at(towerX + Math.sin(a) * rr, (y0 + y1) / 2, Math.cos(a) * rr, a), 0x1e2a28);
      const ca = a + Math.PI / 8;
      cu.add(new THREE.ConeGeometry(0.42, 4.2, 6), f.at(towerX + Math.sin(ca) * r * 1.02, y1 + 1.6, Math.cos(ca) * r * 1.02), white);
    }
    cu.add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.5, 8), f.at(towerX, y1, 0, Math.PI / 8), white);
  };
  stage(M.towerStone + 0.4, 61, 5.9);
  stage(61.5, 71, 4.0);
  cu.add(new THREE.ConeGeometry(3.3, 15.5, 8), f.at(towerX, 71 + 7.75, 0, Math.PI / 8), white);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cu.add(new THREE.ConeGeometry(0.9, 7, 6), f.at(towerX + sx * (tw / 2 - 0.6), M.towerStone + 3.9, sz * (tw / 2 - 0.6)), white);
  b.add(new THREE.SphereGeometry(0.55, 12, 8), f.at(towerX, 86.9, 0), 0xd4af37);
  b.box(0.14, 2.6, 0.14, f.at(towerX, 88.7, 0), 0xd4af37);
  b.box(0.14, 0.14, 1.3, f.at(towerX, 89.1, 0), 0xd4af37);
  // ridge turret over the nave
  cu.add(new THREE.ConeGeometry(0.8, 5.5, 6), f.at((naveX0 + naveX1) / 2, M.ridge + 2.4, 0), white);

  group.add(
    brick.mesh(facadeMaterial({ map: bayMap, mask: bayMask, lit: 1, glow: 0.42, doubleSide: true })),
    roof.mesh(new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.8, side: THREE.DoubleSide })),
    b.mesh(tintMaterial({ roughness: 0.85, metalness: 0.05 })),
    cu.mesh(new THREE.MeshStandardMaterial({ map: copperTexture(114), color: copper, roughness: 0.6, metalness: 0.25, flatShading: true })),
  );

  const view = f.point(-half - 34, 0, 52);
  const [sx, sz] = freeSpot(world, view.x, view.z);
  const towerWorld = f.point(towerX, 0, 0);
  return {
    id: 'marienkirche',
    height: 90,
    name: 'Marienkirche',
    kind: 'Brick Gothic church · 13th century',
    facts: ['One of the oldest churches in Berlin, a three-aisled hall church', 'West tower about 90 m tall', 'Copper-clad neo-Gothic crown added by Carl Gotthard Langhans in 1790'],
    approximated: 'Bay count, buttresses, chapels, tower openings and the spire profile.',
    anchor: [towerWorld.x, M.spireTip + 8, towerWorld.z],
    orbit: { target: [box.cx, 26, box.cz], distance: 210, bearing: 40, tilt: 70 },
    street: { x: sx, z: sz, lookAt: [towerWorld.x, 44, towerWorld.z] },
  };
}
