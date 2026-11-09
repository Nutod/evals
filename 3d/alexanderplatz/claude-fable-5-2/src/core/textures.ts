import * as THREE from 'three';
import { mulberry32, type Rng } from './rng';

export type Ctx = CanvasRenderingContext2D;

export const FONT_SANS = '"Geist Sans", "Helvetica Neue", Arial, sans-serif';
export const FONT_CONDENSED = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

let maxAnisotropy = 8;
export function setMaxAnisotropy(v: number): void {
  maxAnisotropy = Math.min(8, v);
}

export interface TexOptions {
  /** Colour data (albedo) rather than masks or normals. Default true. */
  srgb?: boolean;
  repeat?: boolean;
  mipmaps?: boolean;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Draws a texture in code. Every surface in the scene comes from one of these. */
export function canvasTexture(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void, o: TexOptions = {}): THREE.CanvasTexture {
  const [c, g] = makeCanvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAnisotropy;
  t.generateMipmaps = o.mipmaps !== false;
  t.minFilter = o.mipmaps !== false ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

/** Fine grain: random translucent specks. */
export function speckle(g: Ctx, w: number, h: number, rng: Rng, count: number, light: string, dark: string, maxSize = 2): void {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rng() > 0.5 ? light : dark;
    const s = 0.5 + rng() * maxSize;
    g.fillRect(rng() * w, rng() * h, s, s);
  }
}

/** Soft blotches that break up flat colour; wraps at the edges so it tiles. */
export function blotches(g: Ctx, w: number, h: number, rng: Rng, count: number, color: string, radius: number): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = radius * (0.4 + rng());
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

export function noiseTexture(size: number, seed: number, base: string, light: string, dark: string, density = 0.5): THREE.CanvasTexture {
  return canvasTexture(size, size, (g, w, h) => {
    const rng = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, rng, 30, dark, size / 5);
    blotches(g, w, h, rng, 30, light, size / 5);
    speckle(g, w, h, rng, w * h * density * 0.1, light, dark);
  });
}

/** Radial falloff sprite for lamp glows and light pools. */
export function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.25)'): THREE.CanvasTexture {
  return canvasTexture(
    size,
    size,
    (g, w) => {
      const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.25, mid);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    },
    { repeat: false },
  );
}

export interface SignOptions {
  bg?: string;
  fg?: string;
  font?: string;
  weight?: number;
  pad?: number;
  border?: string;
  /** Canvas pixels per text-height unit; raise for large signs. */
  px?: number;
  letterSpacing?: number;
}

/** A text sign. Returns the texture and its width/height ratio. */
export function textSign(text: string, o: SignOptions = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const px = o.px ?? 96;
  const pad = (o.pad ?? 0.3) * px;
  const font = `${o.weight ?? 600} ${px}px ${o.font ?? FONT_CONDENSED}`;
  const [, probe] = makeCanvas(4, 4);
  probe.font = font;
  if (o.letterSpacing) probe.letterSpacing = `${o.letterSpacing * px}px`;
  const tw = Math.ceil(probe.measureText(text).width);
  const w = tw + pad * 2;
  const h = px + pad * 2;
  const texture = canvasTexture(
    w,
    h,
    (g) => {
      if (o.bg) {
        g.fillStyle = o.bg;
        g.fillRect(0, 0, w, h);
      }
      if (o.border) {
        g.strokeStyle = o.border;
        g.lineWidth = px * 0.06;
        g.strokeRect(px * 0.05, px * 0.05, w - px * 0.1, h - px * 0.1);
      }
      g.font = font;
      if (o.letterSpacing) g.letterSpacing = `${o.letterSpacing * px}px`;
      g.fillStyle = o.fg ?? '#fff';
      g.textBaseline = 'middle';
      g.fillText(text, pad, h / 2 + px * 0.04);
    },
    { repeat: false },
  );
  return { texture, aspect: w / h };
}
