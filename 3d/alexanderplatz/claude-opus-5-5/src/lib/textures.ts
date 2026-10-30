import * as THREE from 'three';
import { rng } from './geom';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

let maxAnisotropy = 8;
export const setMaxAnisotropy = (n: number) => (maxAnisotropy = n);

export function canvasTexture(w: number, h: number, draw: Draw, color = true, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Sprinkles per-pixel value noise over the canvas (cheap grain). */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- facades

export type FacadeKey = 'plattenbau' | 'plaster' | 'office' | 'glass' | 'brick' | 'stone';

export interface FacadeSpec {
  bayWidth: number;
  floorHeight: number;
  /** Fraction of windows lit at night. */
  litShare: number;
}

export const FACADES: Record<FacadeKey, FacadeSpec> = {
  plattenbau: { bayWidth: 3.6, floorHeight: 2.9, litShare: 0.28 },
  plaster: { bayWidth: 3.8, floorHeight: 3.8, litShare: 0.26 },
  office: { bayWidth: 3.0, floorHeight: 3.7, litShare: 0.2 },
  glass: { bayWidth: 2.4, floorHeight: 3.7, litShare: 0.22 },
  brick: { bayWidth: 4.2, floorHeight: 4.6, litShare: 0.2 },
  stone: { bayWidth: 2.8, floorHeight: 3.6, litShare: 0.2 },
};

/** Tile covers 8 bays x 8 floors so lit-window patterns do not repeat too obviously. */
export const FACADE_TILE = 8;
const CELL = 64;

interface WindowRect { x: number; y: number; w: number; h: number; arch?: boolean }

function facadeLayout(key: FacadeKey): { wall: Draw; windows: (bx: number, fy: number) => WindowRect[] } {
  const C = CELL;
  switch (key) {
    case 'plattenbau':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#e6e2da';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(70,65,60,0.35)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i <= FACADE_TILE; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * C + 0.5); ctx.lineTo(w, i * C + 0.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(i * C + 0.5, 0); ctx.lineTo(i * C + 0.5, h); ctx.stroke();
          }
          // Washed-out concrete bands under the windows.
          ctx.fillStyle = 'rgba(160,150,135,0.25)';
          for (let f = 0; f < FACADE_TILE; f++) ctx.fillRect(0, f * C + C * 0.78, w, C * 0.1);
        },
        windows: (bx, fy) => [{ x: bx + C * 0.16, y: fy + C * 0.24, w: C * 0.68, h: C * 0.46 }],
      };
    case 'plaster':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#efe9dc';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(120,105,85,0.28)';
          for (let f = 0; f < FACADE_TILE; f++) ctx.fillRect(0, f * C + C - 5, w, 3); // cornice line
        },
        windows: (bx, fy) => [{ x: bx + C * 0.3, y: fy + C * 0.14, w: C * 0.4, h: C * 0.62 }],
      };
    case 'office':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#d9d6cf';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          for (let b = 0; b < FACADE_TILE; b++) ctx.fillRect(b * C, 0, 5, h); // pilaster shadow
        },
        windows: (bx, fy) => [{ x: bx + C * 0.1, y: fy + C * 0.12, w: C * 0.8, h: C * 0.64 }],
      };
    case 'glass':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#c9d0d6';
          ctx.fillRect(0, 0, w, h);
        },
        windows: (bx, fy) => [
          { x: bx + 2, y: fy + C * 0.08, w: C / 2 - 4, h: C * 0.86 },
          { x: bx + C / 2 + 2, y: fy + C * 0.08, w: C / 2 - 4, h: C * 0.86 },
        ],
      };
    case 'brick':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#c9a493';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(80,40,30,0.18)';
          for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 1);
            for (let x = (y / 4) % 2 ? 0 : 4; x < w; x += 8) ctx.fillRect(x, y, 1, 4);
          }
          ctx.fillStyle = 'rgba(255,240,220,0.35)';
          for (let f = 0; f < FACADE_TILE; f++) ctx.fillRect(0, f * C + C - 6, w, 4); // stone string course
        },
        windows: (bx, fy) => [{ x: bx + C * 0.3, y: fy + C * 0.16, w: C * 0.4, h: C * 0.6, arch: true }],
      };
    case 'stone':
      return {
        wall: (ctx, w, h) => {
          ctx.fillStyle = '#e8dcc6';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(90,75,55,0.18)';
          for (let y = 0; y < h; y += C / 3) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
        },
        windows: (bx, fy) => [{ x: bx + C * 0.32, y: fy + C * 0.12, w: C * 0.36, h: C * 0.7 }],
      };
  }
}

function windowPath(ctx: CanvasRenderingContext2D, r: WindowRect) {
  ctx.beginPath();
  if (r.arch) {
    const rad = r.w / 2;
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x, r.y + rad);
    ctx.arc(r.x + rad, r.y + rad, rad, Math.PI, 0);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.closePath();
  } else ctx.rect(r.x, r.y, r.w, r.h);
}

export interface FacadeMaps {
  map: THREE.Texture;
  emissiveMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const facadeCache = new Map<FacadeKey, FacadeMaps>();

/** Colour, night-lighting and roughness maps for one facade style. Canvas y=0 is the top floor. */
export function facadeMaps(key: FacadeKey): FacadeMaps {
  const cached = facadeCache.get(key);
  if (cached) return cached;
  const size = CELL * FACADE_TILE;
  const layout = facadeLayout(key);
  const rects: WindowRect[] = [];
  for (let f = 0; f < FACADE_TILE; f++) for (let b = 0; b < FACADE_TILE; b++) rects.push(...layout.windows(b * CELL, f * CELL));
  const r = rng(key.length * 977 + key.charCodeAt(0));
  const lit = rects.map(() => r() < FACADES[key].litShare);
  const tones = rects.map(() => r());

  const map = canvasTexture(size, size, (ctx, w, h) => {
    layout.wall(ctx, w, h);
    for (const [i, rect] of rects.entries()) {
      // Frame
      ctx.fillStyle = key === 'glass' ? '#5d6b75' : 'rgba(255,255,255,0.85)';
      windowPath(ctx, { ...rect, x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 });
      ctx.fill();
      // Glass: sky reflection gradient with per-window variation (blinds, curtains).
      const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      const t = tones[i];
      const base = key === 'glass' ? [70, 92, 112] : [52, 62, 74];
      g.addColorStop(0, `rgb(${base[0] + 40 * t},${base[1] + 40 * t},${base[2] + 45 * t})`);
      g.addColorStop(1, `rgb(${base[0] - 15},${base[1] - 15},${base[2] - 10})`);
      ctx.fillStyle = g;
      windowPath(ctx, rect);
      ctx.fill();
      if (t > 0.72 && key !== 'glass') {
        ctx.fillStyle = 'rgba(225,215,195,0.75)'; // half-drawn blind
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h * (0.2 + (t - 0.72) * 2));
      }
    }
    if (key === 'glass') {
      ctx.fillStyle = 'rgba(40,48,56,0.9)';
      for (let f = 0; f < FACADE_TILE; f++) ctx.fillRect(0, f * CELL + CELL - 3, w, 5); // slab edges
    }
    grain(ctx, w, h, 14, key.length);
  });

  const emissiveMap = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (const [i, rect] of rects.entries()) {
      if (!lit[i]) continue;
      const t = tones[i];
      ctx.fillStyle = t < 0.18 ? '#9fc4ff' : t < 0.6 ? '#ffd9a0' : '#ffe6c4';
      ctx.globalAlpha = 0.55 + 0.45 * t;
      windowPath(ctx, rect);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  const roughnessMap = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#262626';
    for (const rect of rects) { windowPath(ctx, rect); ctx.fill(); }
  }, false);

  const maps = { map, emissiveMap, roughnessMap };
  facadeCache.set(key, maps);
  return maps;
}

/** Ground-floor shopfronts: 4 bays wide, one 4.5 m storey tall. */
export const SHOP_BAY = 5;
export const SHOP_HEIGHT = 4.5;
let shopMaps: FacadeMaps | null = null;
export function shopfrontMaps(): FacadeMaps {
  if (shopMaps) return shopMaps;
  const W = 512, H = 128;
  const bw = W / 4;
  const awnings = ['#1f4d3d', '#7a2b2b', '#2c3e66', '#c49a2a', '#444', '#8a5a2b'];
  const r = rng(42);
  const picks = [0, 1, 2, 3].map(() => ({ awning: awnings[Math.floor(r() * awnings.length)], lit: r() }));
  const map = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#b9b2a6';
    ctx.fillRect(0, 0, W, H);
    picks.forEach((p, i) => {
      const x = i * bw;
      ctx.fillStyle = p.awning; // fascia / sign band
      ctx.fillRect(x + 4, 6, bw - 8, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 5; k++) ctx.fillRect(x + 18 + k * 18, 12, 10, 6); // lettering hint
      const g = ctx.createLinearGradient(0, 30, 0, H - 8);
      g.addColorStop(0, '#5b6d78');
      g.addColorStop(1, '#2a3238');
      ctx.fillStyle = g;
      ctx.fillRect(x + 8, 30, bw - 16, H - 40);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x + bw / 2 - 2, 30, 4, H - 40); // mullion
      ctx.fillRect(x + 8, H - 12, bw - 16, 4);
    });
    grain(ctx, W, H, 10, 7);
  });
  const emissiveMap = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    picks.forEach((p, i) => {
      const x = i * bw;
      ctx.fillStyle = p.lit > 0.3 ? '#ffdcaa' : '#3a3020';
      ctx.fillRect(x + 8, 30, bw - 16, H - 40);
      ctx.fillStyle = '#fff3d6';
      for (let k = 0; k < 5; k++) ctx.fillRect(x + 18 + k * 18, 12, 10, 6);
    });
  });
  const roughnessMap = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#202020';
    picks.forEach((_, i) => ctx.fillRect(i * bw + 8, 30, bw - 16, H - 40));
  }, false);
  shopMaps = { map, emissiveMap, roughnessMap };
  return shopMaps;
}

// ---------------------------------------------------------------- ground

export const pavingTexture = () =>
  canvasTexture(256, 256, (ctx, w, h) => {
    // Large granite slabs with joints; one tile = 4 m.
    ctx.fillStyle = '#b8b4ab';
    ctx.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const v = 170 + r() * 26;
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      ctx.fillRect(x * 64 + ((y % 2) * 32) % 64, y * 32, 63, 31);
    }
    ctx.fillStyle = 'rgba(70,65,60,0.5)';
    for (let y = 0; y <= h; y += 32) ctx.fillRect(0, y, w, 1);
    grain(ctx, w, h, 18, 4);
  });

export const asphaltTexture = () =>
  canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a4c50';
    ctx.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 400; i++) {
      const v = 55 + r() * 35;
      ctx.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
      ctx.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3);
    }
    grain(ctx, w, h, 22, 10);
  });

export const grassTexture = () =>
  canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5f7f3e';
    ctx.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 1200; i++) {
      const g = 100 + r() * 60;
      ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.45)`;
      ctx.fillRect(r() * w, r() * h, 2, 3 + r() * 4);
    }
    grain(ctx, w, h, 16, 12);
  });

export const ballastTexture = () =>
  canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6b655d';
    ctx.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 900; i++) {
      const v = 70 + r() * 70;
      ctx.fillStyle = `rgb(${v},${v - 5},${v - 12})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    // Sleepers every 0.6 m across the track (tile = 4.8 m along v).
    ctx.fillStyle = '#4b4038';
    for (let y = 0; y < h; y += 16) ctx.fillRect(10, y, w - 20, 6);
  });

/** Brick viaduct elevation: arches 15 m wide, deck ~8 m high. u = metres/15, v = 0..1 over 8 m. */
export const viaductTexture = () =>
  canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a2523a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(60,25,15,0.25)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
      for (let x = (y / 3) % 2 ? 0 : 3; x < w; x += 6) ctx.fillRect(x, y, 1, 3);
    }
    // Arch opening (infilled with glazed shopfronts like the real Stadtbahnbögen)
    const ax = w * 0.12, aw = w * 0.76, top = h * 0.3;
    ctx.fillStyle = '#2e3236';
    ctx.beginPath();
    ctx.moveTo(ax, h);
    ctx.lineTo(ax, top + aw / 4);
    ctx.ellipse(w / 2, top + aw / 4, aw / 2, aw / 4, 0, Math.PI, 0);
    ctx.lineTo(ax + aw, h);
    ctx.fill();
    ctx.strokeStyle = '#c9b9a2';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,190,210,0.25)';
    for (let x = ax + 12; x < ax + aw - 8; x += 22) ctx.fillRect(x, top + aw / 4, 2, h - top - aw / 4);
    ctx.fillStyle = '#7d3b2a';
    ctx.fillRect(0, 0, w, h * 0.1); // cornice
    grain(ctx, w, h, 14, 6);
  });

export const roofTexture = () =>
  canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8a8884';
    ctx.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 300; i++) {
      const v = 110 + r() * 50;
      ctx.fillStyle = `rgba(${v},${v},${v - 4},0.35)`;
      ctx.fillRect(r() * w, r() * h, 3, 3);
    }
    grain(ctx, w, h, 20, 22);
  });

// ---------------------------------------------------------------- signs

export interface SignOptions {
  bg?: string;
  fg?: string;
  font?: string;
  width?: number;
  height?: number;
  padding?: number;
  border?: string;
}

/** Text panel rendered to a texture (not repeating). Returns the texture and its aspect ratio. */
export function signTexture(text: string, o: SignOptions = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const height = o.height ?? 128;
  const font = o.font ?? `600 ${Math.round(height * 0.62)}px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const width = o.width ?? Math.ceil(probe.measureText(text).width + (o.padding ?? height * 0.4) * 2);
  const texture = canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = o.bg ?? '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = h * 0.06;
      ctx.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
    }
    ctx.fillStyle = o.fg ?? '#111';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + h * 0.04);
  }, true, false);
  return { texture, aspect: width / height };
}

/** Round transit roundel ("S" green, "U" blue) used on station signage. */
export function roundelTexture(letter: 'S' | 'U'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = letter === 'S' ? '#008d4f' : '#115d91';
    if (letter === 'S') {
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
    } else ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${h * 0.72}px system-ui, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + h * 0.05);
  }, true, false);
}

/** Soft radial sprite for lamp glows and light pools. */
export const glowTexture = () =>
  canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, true, false);

/** Fills the canvas with running-bond brickwork. `course` is the brick height in pixels. */
export function brickPattern(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, course = 4, mortar = 'rgba(60,25,15,0.22)') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const r = rng(w + h);
  for (let y = 0; y < h; y += course) {
    for (let x = (y / course) % 2 ? -course : 0; x < w; x += course * 2) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,220,200'},${r() * 0.08})`;
      ctx.fillRect(x, y, course * 2, course);
    }
  }
  ctx.fillStyle = mortar;
  for (let y = 0; y < h; y += course) {
    ctx.fillRect(0, y, w, 1);
    for (let x = (y / course) % 2 ? course : 0; x < w; x += course * 2) ctx.fillRect(x, y, 1, course);
  }
}

/** Path for a round (or pointed, Gothic) arched opening with its base at y + h. */
export function archPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pointed = false) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  if (pointed) {
    ctx.lineTo(x, y + w * 0.8);
    ctx.quadraticCurveTo(x, y + w * 0.1, x + r, y);
    ctx.quadraticCurveTo(x + w, y + w * 0.1, x + w, y + w * 0.8);
  } else {
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
  }
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}
