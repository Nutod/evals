import * as THREE from 'three';
import { obb } from '../../core/geo';
import { facadeMaterial, tintMaterial } from '../../core/materials';
import { Frame, MeshBuilder } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { canvasTexture, type Ctx } from '../../core/textures';
import { walls } from '../buildings';
import type { World } from '../world';
import { freeSpot, holesOf, outlineOf, partByHeight } from './common';
import type { Landmark } from './types';

export const RATHAUS = { eaves: 27, towerHeight: 74, towerWidth: 14.6, clockDiameter: 4.75 };

const BRICK: [number, number, number] = [172, 66, 50];

function bricks(g: Ctx, w: number, h: number, rows: number, cols: number, rng: () => number, base = BRICK): void {
  g.fillStyle = '#7d4a3c';
  g.fillRect(0, 0, w, h);
  for (let j = 0; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const v = 0.8 + rng() * 0.28;
      g.fillStyle = `rgb(${Math.round(base[0] * v)},${Math.round(base[1] * v)},${Math.round(base[2] * v)})`;
      g.fillRect((i + (j % 2) * 0.5) * (w / cols) + 0.5, j * (h / rows) + 0.5, w / cols - 1, h / rows - 1);
    }
  }
}

/** Round-arched opening; returns nothing, paints into whichever context is given. */
function arch(g: Ctx, cx: number, top: number, width: number, height: number, fill: string): void {
  const r = width / 2;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(cx - r, top + height);
  g.lineTo(cx - r, top + r);
  g.arc(cx, top + r, r, Math.PI, 0);
  g.lineTo(cx + r, top + height);
  g.closePath();
  g.fill();
}

/** One facade bay over the full wall height: plinth, arched ground floor, terracotta frieze, two upper storeys, cornice. */
function bodyTextures(): [THREE.Texture, THREE.Texture] {
  const W = 256;
  const H = 1024;
  const draw = (mask: boolean) =>
    canvasTexture(
      W,
      H,
      (g) => {
        const rng = mulberry32(101);
        const wall = 'rgb(0,225,0)';
        const glass = mask ? 'rgb(255,30,110)' : '#2c333b';
        const stone = mask ? wall : '#c9a98a';
        if (mask) {
          g.fillStyle = wall;
          g.fillRect(0, 0, W, H);
        } else {
          bricks(g, W, H, 150, 9, rng);
        }
        // cornice with a row of small arches
        g.fillStyle = stone;
        g.fillRect(0, 0, W, 26);
        if (!mask) {
          for (let i = 0; i < 8; i++) arch(g, 16 + i * 32, 30, 22, 30, '#6f3a2e');
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(0, 26, W, 5);
        }
        // second floor: paired windows
        for (const cx of [W * 0.32, W * 0.68]) {
          arch(g, cx, 105, 60, 150, mask ? wall : '#e0c0a0');
          arch(g, cx, 114, 44, 136, glass);
        }
        g.fillStyle = stone;
        g.fillRect(0, 280, W, 14);
        // first floor: tall state-room windows
        arch(g, W / 2, 330, 150, 300, mask ? wall : '#e0c0a0');
        arch(g, W / 2, 344, 124, 280, glass);
        if (!mask) {
          g.fillStyle = '#e0c0a0';
          g.fillRect(W / 2 - 3, 400, 6, 224);
          g.fillRect(W / 2 - 62, 470, 124, 6);
        }
        // terracotta chronicle frieze
        g.fillStyle = mask ? wall : '#b9744f';
        g.fillRect(0, 660, W, 34);
        if (!mask) {
          for (let i = 0; i < 40; i++) {
            g.fillStyle = rng() > 0.5 ? 'rgba(90,40,20,0.5)' : 'rgba(230,170,120,0.5)';
            g.fillRect(rng() * W, 664 + rng() * 22, 4 + rng() * 9, 5 + rng() * 8);
          }
        }
        // ground floor
        arch(g, W / 2, 730, 120, 210, mask ? wall : '#e0c0a0');
        arch(g, W / 2, 742, 98, 198, glass);
        // granite plinth
        g.fillStyle = mask ? wall : '#8f8782';
        g.fillRect(0, 956, W, 68);
        if (!mask) {
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.fillRect(0, 956, W, 4);
        }
      },
      { srgb: !mask },
    );
  return [draw(false), draw(true)];
}

/** Tower shaft face: brick with a tall louvred belfry opening. */
function towerTexture(): THREE.Texture {
  return canvasTexture(256, 512, (g, w, h) => {
    const rng = mulberry32(102);
    bricks(g, w, h, 80, 9, rng);
    for (const cx of [w * 0.3, w * 0.7]) {
      arch(g, cx, 60, 70, 380, '#e0c0a0');
      arch(g, cx, 70, 52, 366, '#30262a');
      g.fillStyle = 'rgba(200,150,120,0.5)';
      for (let y = 110; y < 430; y += 18) g.fillRect(cx - 26, y, 52, 4);
    }
    g.fillStyle = '#c9a98a';
    g.fillRect(0, 0, w, 16);
    g.fillRect(0, h - 22, w, 22);
  });
}

function clockTexture(): THREE.Texture {
  return canvasTexture(
    256,
    256,
    (g, w) => {
      const c = w / 2;
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#1f2326';
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f3ead2';
      g.beginPath();
      g.arc(c, c, c - 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2326';
      for (let i = 0; i < 12; i++) {
        g.save();
        g.translate(c, c);
        g.rotate((i / 12) * Math.PI * 2);
        g.fillRect(-4, -c + 22, 8, i % 3 === 0 ? 30 : 18);
        g.restore();
      }
    },
    { repeat: false },
  );
}

/** Berlin's flag: red, white, red with the bear. */
function flagTexture(): THREE.Texture {
  return canvasTexture(
    300,
    180,
    (g, w, h) => {
      g.fillStyle = '#d0102a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.fillRect(0, h / 5, w, (h * 3) / 5);
      // a simple rampant bear
      g.fillStyle = '#16161a';
      g.beginPath();
      g.ellipse(w * 0.5, h * 0.52, 22, 34, 0.25, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(w * 0.55, h * 0.3, 13, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 9;
      g.strokeStyle = '#16161a';
      g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[0.52, 0.42, 0.66, 0.36], [0.5, 0.5, 0.64, 0.52], [0.46, 0.66, 0.4, 0.8], [0.52, 0.68, 0.58, 0.8]]) {
        g.beginPath();
        g.moveTo(w * x0, h * y0);
        g.lineTo(w * x1, h * y1);
        g.stroke();
      }
    },
    { repeat: false },
  );
}

export function buildRathaus(world: World): Landmark {
  const group = new THREE.Group();
  group.name = 'rathaus';
  world.layers.landmarks.add(group);
  const outline = outlineOf('rathaus');
  const holes = holesOf('rathaus');
  const box = obb(outline);
  const tower = partByHeight('rathaus', RATHAUS.towerHeight);
  const R = RATHAUS;

  // local frame: +Z points out of the main front, where the tower stands
  const dx = tower.box.cx - box.cx;
  const dz = tower.box.cz - box.cz;
  const axes: [number, number, number][] = [
    [box.ux, box.uz, box.halfL], [-box.ux, -box.uz, box.halfL], [box.vx, box.vz, box.halfW], [-box.vx, -box.vz, box.halfW],
  ];
  const front = axes.reduce((a, c) => (c[0] * dx + c[1] * dz > a[0] * dx + a[1] * dz ? c : a));
  const f = Frame.plan(box.cx, box.cz, Math.atan2(front[0], front[1]));
  const depth = front[2];
  const span = front[2] === box.halfL ? box.halfW : box.halfL;
  const towerLocal = new THREE.Vector3(tower.box.cx, 0, tower.box.cz).applyMatrix4(f.m.clone().invert());

  // ---- brick body with courtyards ----
  const [map, mask] = bodyTextures();
  const body = new MeshBuilder();
  const white = new THREE.Color(0xffffff);
  for (const r of [outline, ...holes]) walls(body, r, 0, R.eaves, { tileW: 4.5 }, white, 0, 0, 1);
  const brickMaterial = facadeMaterial({ map, mask, lit: 0.3, glow: 1.1, cells: [1, 3], doubleSide: true });
  group.add(body.mesh(brickMaterial));

  const b = new MeshBuilder(true);
  const slate = 0x4a4d52;
  const stone = 0xc9a98a;
  const brickRed = 0xa8402f;
  b.polygon(outline, holes, R.eaves - 0.4, slate, 0.2);

  // corner pavilions and the central entrance block step forward and rise above the eaves
  const blocks = new MeshBuilder();
  const blockFaces = (x: number, z: number, w: number, d: number, h: number): void => {
    const hw = w / 2;
    const hd = d / 2;
    const corners = [f.point(x - hw, 0, z - hd), f.point(x + hw, 0, z - hd), f.point(x + hw, 0, z + hd), f.point(x - hw, 0, z + hd)];
    const ring = corners.map((p) => [p.x, p.z] as [number, number]);
    // the frame is a pure rotation, so this ring keeps the outside on its left like baked footprints
    walls(blocks, ring, 0, h, { tileW: 4.5 }, white, 0, 0, h / R.eaves);
    b.box(w + 0.8, 0.9, d + 0.8, f.at(x, h - 0.2, z), stone);
    b.box(w - 1.2, 0.5, d - 1.2, f.at(x, h + 0.3, z), slate);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) blockFaces(sx * (span - 8.2), sz * (depth - 8.2), 17.5, 17.5, R.eaves + 3.6);
  blockFaces(towerLocal.x, depth - 5.5, 31, 12, R.eaves + 3.2);
  group.add(blocks.mesh(brickMaterial));

  // balustrade along the eaves
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % outline.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 3) continue;
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(-(q[1] - p[1]), q[0] - p[0])).setPosition((p[0] + q[0]) / 2, R.eaves + 0.45, (p[1] + q[1]) / 2);
    b.box(len, 0.9, 0.35, m, stone);
  }

  // entrance portal
  b.box(9, 11, 1.2, f.at(towerLocal.x, 5.5, depth + 0.7), 0x8a3526);
  b.box(5.4, 8.4, 1.3, f.at(towerLocal.x, 4.2, depth + 0.8), 0x2a1f1c, { glow: 0x6b4a2a });
  b.box(13, 1.0, 3.2, f.at(towerLocal.x, 0.5, depth + 2.2), 0x8f8782);

  // ---- tower ----
  const tx = towerLocal.x;
  const tz = towerLocal.z;
  const tw = R.towerWidth;
  const shaftBase = R.eaves;
  const shaftTop = 58;
  const towerMap = towerTexture();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(tw, shaftTop - shaftBase, tw), new THREE.MeshStandardMaterial({ map: towerMap, roughness: 0.85 }));
  shaft.applyMatrix4(f.at(tx, (shaftTop + shaftBase) / 2, tz));
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);

  // clock stage
  b.box(tw + 1.4, 0.9, tw + 1.4, f.at(tx, shaftTop + 0.45, tz), stone);
  b.box(tw - 0.6, 7.4, tw - 0.6, f.at(tx, shaftTop + 4.6, tz), brickRed);
  b.box(tw + 1.8, 1.0, tw + 1.8, f.at(tx, shaftTop + 8.8, tz), stone);
  // open belfry with corner tabernacles
  const belfryBase = shaftTop + 9.3;
  const belfryTop = R.towerHeight - 1.2;
  b.box(tw - 3.4, belfryTop - belfryBase, tw - 3.4, f.at(tx, (belfryTop + belfryBase) / 2, tz), brickRed);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const ox = Math.sin(a) * (tw / 2 - 1.65);
    const oz = Math.cos(a) * (tw / 2 - 1.65);
    b.box(3.2, belfryTop - belfryBase - 1.6, 0.3, f.at(tx + ox, (belfryTop + belfryBase) / 2 - 0.3, tz + oz, a), 0x241c1e);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = tx + sx * (tw / 2 - 0.9);
      const pz = tz + sz * (tw / 2 - 0.9);
      b.add(new THREE.CylinderGeometry(1.15, 1.15, belfryTop - belfryBase + 1, 8), f.at(px, (belfryTop + belfryBase) / 2 + 0.5, pz), brickRed);
      b.add(new THREE.ConeGeometry(1.45, 3.4, 8), f.at(px, belfryTop + 2.7, pz), slate);
      // lower turrets flanking the shaft
      b.add(new THREE.CylinderGeometry(0.9, 0.9, 6, 8), f.at(tx + sx * (tw / 2 + 0.2), shaftBase + 4.6, tz + sz * (tw / 2 + 0.2)), brickRed);
      b.add(new THREE.ConeGeometry(1.15, 2.6, 8), f.at(tx + sx * (tw / 2 + 0.2), shaftBase + 8.9, tz + sz * (tw / 2 + 0.2)), slate);
    }
  }
  b.box(tw - 2.2, 1.2, tw - 2.2, f.at(tx, R.towerHeight - 0.6, tz), stone);
  b.add(new THREE.CylinderGeometry(0.12, 0.16, 13, 8), f.at(tx, R.towerHeight + 6.5, tz), 0xe6e6e0);
  group.add(b.mesh(tintMaterial({ roughness: 0.8, metalness: 0.05 })));

  // clock faces on all four sides
  const clockMap = clockTexture();
  const clockMaterial = new THREE.MeshStandardMaterial({ map: clockMap, transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: clockMap, emissiveIntensity: 0.35, roughness: 0.5 });
  const hands = new MeshBuilder();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const r = (tw - 0.6) / 2 + 0.06;
    const face = new THREE.Mesh(new THREE.CircleGeometry(R.clockDiameter / 2, 40), clockMaterial);
    face.applyMatrix4(f.at(tx + Math.sin(a) * r, shaftTop + 4.6, tz + Math.cos(a) * r, a));
    group.add(face);
    // hands fixed at ten past ten
    hands.box(0.18, 1.5, 0.05, f.at(tx + Math.sin(a) * (r + 0.06), shaftTop + 4.6, tz + Math.cos(a) * (r + 0.06), a, 0, 1.05).multiply(new THREE.Matrix4().makeTranslation(0, 0.7, 0)), 0x15181a);
    hands.box(0.13, 2.1, 0.05, f.at(tx + Math.sin(a) * (r + 0.06), shaftTop + 4.6, tz + Math.cos(a) * (r + 0.06), a, 0, -1.05).multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0)), 0x15181a);
  }
  group.add(hands.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 'none'));

  // flag that ripples in the wind
  const flagGeometry = new THREE.PlaneGeometry(5.4, 3.2, 14, 6);
  flagGeometry.translate(2.7, 0, 0);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.applyMatrix4(f.at(tx, R.towerHeight + 11.2, tz, 0.6));
  flag.castShadow = true;
  group.add(flag);
  const rest = flagGeometry.getAttribute('position').clone();
  world.updaters.push((_dt, t) => {
    const p = flagGeometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = rest.getX(i);
      p.setZ(i, Math.sin(x * 1.6 - t * 5.2) * 0.07 * x + Math.sin(x * 0.7 - t * 2.1) * 0.05 * x);
    }
    p.needsUpdate = true;
  });

  const frontPoint = f.point(towerLocal.x + 25, 0, depth + 62);
  const [sx, sz] = freeSpot(world, frontPoint.x, frontPoint.z);
  const towerWorld = f.point(tx, 0, tz);
  const bearing = (THREE.MathUtils.radToDeg(Math.atan2(-front[0], front[1])) + 360) % 360;
  return {
    id: 'rathaus',
    height: 74,
    name: 'Rotes Rathaus',
    kind: 'City hall · 1869',
    facts: ['Red clinker-brick block of roughly 99 × 88 m around three courtyards', '74 m clock tower with dials 4.75 m across', 'A terracotta frieze of Berlin history runs above the ground floor'],
    approximated: 'Window bays, frieze, portal, tower stages and turrets.',
    anchor: [towerWorld.x, R.towerHeight + 16, towerWorld.z],
    orbit: { target: [box.cx, 26, box.cz], distance: 300, bearing, tilt: 68 },
    street: { x: sx, z: sz, lookAt: [towerWorld.x, 42, towerWorld.z] },
  };
}
