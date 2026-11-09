import * as THREE from 'three';
import { facadeMaterial } from '../core/materials';
import { mulberry32 } from '../core/rng';
import { canvasTexture, speckle, type Ctx } from '../core/textures';

/** Mask encoding: R = window, G = roughness, B = metalness. */
const WALL_MASK = 'rgb(0,232,0)';
const GLASS_MASK = 'rgb(255,26,120)';
const FRAME_MASK = 'rgb(0,150,40)';

export type FacadeId = 'plaster' | 'panel' | 'glass' | 'brick' | 'stone' | 'grid' | 'plain' | 'shop' | 'base';

export interface Facade {
  id: FacadeId;
  material: THREE.MeshStandardMaterial;
  /** Width of one texture tile in metres. */
  tileW: number;
  /** Nominal storey height in metres. */
  floorH: number;
}

interface Painter {
  /** Paints the same shapes into albedo (a) and mask (m). */
  rect(x: number, y: number, w: number, h: number, albedo: string, mask: string): void;
  a: Ctx;
  m: Ctx;
  w: number;
  h: number;
}

function paintPair(w: number, h: number, seed: number, wall: string, draw: (p: Painter, rng: () => number) => void): [THREE.Texture, THREE.Texture] {
  let albedoCtx!: Ctx;
  let p!: Painter;
  const rng = mulberry32(seed);
  const map = canvasTexture(w, h, (g) => {
    albedoCtx = g;
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
  });
  const mask = canvasTexture(
    w,
    h,
    (g) => {
      g.fillStyle = WALL_MASK;
      g.fillRect(0, 0, w, h);
      p = {
        a: albedoCtx,
        m: g,
        w,
        h,
        rect(x, y, rw, rh, albedo, maskColor) {
          albedoCtx.fillStyle = albedo;
          albedoCtx.fillRect(x * w, y * h, rw * w, rh * h);
          g.fillStyle = maskColor;
          g.fillRect(x * w, y * h, rw * w, rh * h);
        },
      };
      draw(p, rng);
    },
    { srgb: false },
  );
  return [map, mask];
}

/** A glazed opening with frame, mullions and a soft reflection gradient. */
function windowAt(p: Painter, x: number, y: number, w: number, h: number, o: { frame?: string; glass?: string; cols?: number; rows?: number; sill?: boolean } = {}): void {
  const f = 0.012;
  p.rect(x - f, y - f, w + f * 2, h + f * 2, o.frame ?? '#e9e6df', FRAME_MASK);
  p.rect(x, y, w, h, o.glass ?? '#3d4a57', GLASS_MASK);
  const g = p.a;
  const grad = g.createLinearGradient(0, y * p.h, 0, (y + h) * p.h);
  grad.addColorStop(0, 'rgba(150,175,200,0.28)');
  grad.addColorStop(0.6, 'rgba(20,30,40,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grad;
  g.fillRect(x * p.w, y * p.h, w * p.w, h * p.h);
  const cols = o.cols ?? 2;
  const rows = o.rows ?? 1;
  for (let i = 1; i < cols; i++) p.rect(x + (w * i) / cols - 0.006, y, 0.012, h, o.frame ?? '#e9e6df', FRAME_MASK);
  for (let j = 1; j < rows; j++) p.rect(x, y + (h * j) / rows - 0.005, w, 0.01, o.frame ?? '#e9e6df', FRAME_MASK);
  if (o.sill !== false) {
    p.rect(x - 0.03, y + h + f, w + 0.06, 0.02, '#d4d0c8', WALL_MASK);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect((x - 0.03) * p.w, (y + h + f + 0.02) * p.h, (w + 0.06) * p.w, 0.012 * p.h);
  }
}

function grain(p: Painter, rng: () => number, amount = 1): void {
  speckle(p.a, p.w, p.h, rng, p.w * p.h * 0.02 * amount, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.07)', 2);
}

function shade(g: Ctx, x: number, y: number, w: number, h: number, alpha: number): void {
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.fillRect(x, y, w, h);
}

export function createFacades(): Record<FacadeId, Facade> {
  const S = 256;
  const make = (id: FacadeId, tileW: number, floorH: number, pair: [THREE.Texture, THREE.Texture], o: { lit?: number; cells?: [number, number]; glow?: number; env?: number } = {}): Facade => ({
    id,
    tileW,
    floorH,
    material: facadeMaterial({ map: pair[0], mask: pair[1], lit: o.lit, cells: o.cells, glow: o.glow, doubleSide: true, envMapIntensity: o.env }),
  });

  // rendered plaster with tall casement windows (pre-war and post-reunification infill)
  const plaster = paintPair(S, S, 31, '#f1eee6', (p, rng) => {
    grain(p, rng);
    shade(p.a, 0, 0, p.w, p.h * 0.03, 0.1);
    p.rect(0, 0.0, 1, 0.022, '#fbf9f2', WALL_MASK);
    windowAt(p, 0.31, 0.2, 0.38, 0.56, { rows: 2 });
    p.rect(0.27, 0.15, 0.46, 0.028, '#fbf9f2', WALL_MASK);
  });

  // East German precast panel block: window bay next to a loggia bay
  const panel = paintPair(S * 2, S, 32, '#ecebe6', (p, rng) => {
    grain(p, rng, 1.4);
    const g = p.a;
    g.strokeStyle = 'rgba(70,70,70,0.45)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, p.w / 2 - 2, p.h - 2);
    g.strokeRect(p.w / 2 + 1, 1, p.w / 2 - 2, p.h - 2);
    windowAt(p, 0.09, 0.26, 0.32, 0.46, { cols: 3, frame: '#f4f4f0' });
    // loggia: shadowed recess behind a solid balustrade
    p.rect(0.55, 0.16, 0.4, 0.8, '#5a5e60', WALL_MASK);
    windowAt(p, 0.6, 0.2, 0.3, 0.5, { cols: 2, sill: false, glass: '#2f3941' });
    p.rect(0.54, 0.66, 0.42, 0.3, '#d9d6cc', WALL_MASK);
    shade(g, 0.54 * p.w, 0.66 * p.h, 0.42 * p.w, 3, 0.25);
  });

  // curtain wall: full-height glazing with spandrel bands
  const glass = paintPair(S, S, 33, '#8b98a3', (p) => {
    p.rect(0, 0, 1, 1, '#7d909e', GLASS_MASK);
    const g = p.a;
    const grad = g.createLinearGradient(0, 0, 0, p.h);
    grad.addColorStop(0, 'rgba(190,215,235,0.30)');
    grad.addColorStop(0.7, 'rgba(40,60,80,0.12)');
    grad.addColorStop(1, 'rgba(10,20,30,0.3)');
    g.fillStyle = grad;
    g.fillRect(0, 0, p.w, p.h);
    p.rect(0, 0.74, 1, 0.26, '#5c6b76', 'rgb(0,60,130)');
    p.rect(0, 0, 0.035, 1, '#c9ced2', 'rgb(0,90,200)');
    p.rect(0, 0.73, 1, 0.02, '#c9ced2', 'rgb(0,90,200)');
  });

  // brick with segmental-arched windows
  const brick = paintPair(S, S, 34, '#ffffff', (p, rng) => {
    const g = p.a;
    const rows = 26;
    const bh = p.h / rows;
    for (let j = 0; j < rows; j++) {
      for (let i = -1; i < 9; i++) {
        const v = 0.78 + rng() * 0.22;
        g.fillStyle = `rgb(${Math.round(232 * v)},${Math.round(226 * v)},${Math.round(220 * v)})`;
        g.fillRect((i + (j % 2) * 0.5) * (p.w / 8) + 1, j * bh + 1, p.w / 8 - 2, bh - 2);
      }
    }
    shade(g, 0, 0, p.w, p.h, 0.04);
    windowAt(p, 0.31, 0.22, 0.38, 0.54, { rows: 2, frame: '#f2efe8' });
    p.rect(0.28, 0.16, 0.44, 0.04, '#f6f2e6', WALL_MASK);
  });

  // dressed stone: ashlar courses, deep window surrounds
  const stone = paintPair(S, S, 35, '#f0ece2', (p, rng) => {
    grain(p, rng, 1.6);
    const g = p.a;
    g.strokeStyle = 'rgba(90,80,60,0.28)';
    g.lineWidth = 1.5;
    for (let j = 0; j <= 8; j++) {
      g.beginPath();
      g.moveTo(0, (j * p.h) / 8);
      g.lineTo(p.w, (j * p.h) / 8);
      g.stroke();
      for (let i = 0; i < 3; i++) {
        const x = ((i + (j % 2) * 0.5) * p.w) / 3;
        g.beginPath();
        g.moveTo(x, (j * p.h) / 8);
        g.lineTo(x, ((j + 1) * p.h) / 8);
        g.stroke();
      }
    }
    p.rect(0.26, 0.13, 0.48, 0.7, '#f8f5ec', WALL_MASK);
    windowAt(p, 0.31, 0.19, 0.38, 0.58, { rows: 3, frame: '#d8d2c4' });
    p.rect(0.22, 0.1, 0.56, 0.035, '#fbf8f0', WALL_MASK);
    shade(g, 0.22 * p.w, 0.135 * p.h, 0.56 * p.w, 3, 0.2);
    p.rect(0, 0.965, 1, 0.035, '#fbf8f0', WALL_MASK);
  });

  // modern office grid: deep reveals, mostly glass
  const grid = paintPair(S, S, 36, '#eeeeea', (p, rng) => {
    grain(p, rng);
    windowAt(p, 0.1, 0.14, 0.8, 0.68, { cols: 2, sill: false, frame: '#3a3f44', glass: '#46545f' });
    shade(p.a, 0.1 * p.w, 0.14 * p.h, 0.8 * p.w, 5, 0.3);
    shade(p.a, 0.1 * p.w, 0.14 * p.h, 4, 0.68 * p.h, 0.2);
  });

  // windowless cladding for sheds, kiosks and plant
  const plain = paintPair(S, S, 37, '#eceae4', (p, rng) => {
    grain(p, rng, 1.5);
    const g = p.a;
    g.strokeStyle = 'rgba(60,60,60,0.25)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, p.w - 2, p.h - 2);
    g.beginPath();
    g.moveTo(p.w / 2, 0);
    g.lineTo(p.w / 2, p.h);
    g.stroke();
  });

  // glazed shopfront under a fascia
  const shop = paintPair(S, S, 38, '#e6e3dc', (p, rng) => {
    grain(p, rng);
    p.rect(0, 0, 1, 0.2, '#4d5357', WALL_MASK);
    p.rect(0.1, 0.045, 0.8, 0.11, '#e8e4d8', 'rgb(110,200,0)');
    windowAt(p, 0.06, 0.25, 0.88, 0.66, { cols: 3, sill: false, frame: '#2e3236', glass: '#4b5a66' });
    p.rect(0, 0.93, 1, 0.07, '#7b7b78', WALL_MASK);
  });

  // residential plinth: window, entrance door, window
  const base = paintPair(S * 3, S, 39, '#dcd8cf', (p, rng) => {
    grain(p, rng, 1.4);
    const g = p.a;
    g.strokeStyle = 'rgba(80,70,60,0.22)';
    g.lineWidth = 2;
    for (let j = 1; j < 7; j++) {
      g.beginPath();
      g.moveTo(0, (j * p.h) / 7);
      g.lineTo(p.w, (j * p.h) / 7);
      g.stroke();
    }
    windowAt(p, 0.09, 0.22, 0.15, 0.46, { rows: 2 });
    windowAt(p, 0.76, 0.22, 0.15, 0.46, { rows: 2 });
    p.rect(0.425, 0.2, 0.15, 0.8, '#4a3a2e', 'rgb(0,140,0)');
    windowAt(p, 0.44, 0.24, 0.12, 0.2, { sill: false, frame: '#4a3a2e' });
    p.rect(0, 0.9, 1, 0.1, '#a9a59c', WALL_MASK);
  });

  return {
    plaster: make('plaster', 2.9, 3.3, plaster, { lit: 0.34 }),
    panel: make('panel', 7.2, 2.9, panel, { lit: 0.4, cells: [2, 1] }),
    glass: make('glass', 1.6, 3.6, glass, { lit: 0.5, glow: 1.1, env: 1.25 }),
    brick: make('brick', 2.9, 3.4, brick, { lit: 0.3 }),
    stone: make('stone', 3.3, 3.9, stone, { lit: 0.3 }),
    grid: make('grid', 2.8, 3.5, grid, { lit: 0.45, glow: 1.3 }),
    plain: make('plain', 4, 4, plain, { lit: 0 }),
    shop: make('shop', 4.2, 4.4, shop, { lit: 0.92, glow: 2.0 }),
    base: make('base', 9, 4.2, base, { lit: 0.25, cells: [3, 1] }),
  };
}
