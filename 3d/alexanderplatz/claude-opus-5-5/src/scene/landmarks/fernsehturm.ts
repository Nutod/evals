import * as THREE from 'three';
import { canvasTexture } from '../../lib/textures';
import { centroid, rng } from '../../lib/geom';
import { registerNight } from '../night';
import { footprint, shadowed, streetFrom, type Landmark } from './common';

// Dimensions after published figures: 368 m total, 250 m concrete shaft (32 m at the
// foot, ~9 m below the sphere), 32 m steel-clad sphere centred ~212 m, observation
// deck 203.8 m, Telecafé 207.5 m, 118 m antenna. Pavilion geometry is approximate.
const SHAFT_TOP = 250;
const SPHERE_Y = 212;
const SPHERE_R = 16;
const TOTAL = 368;

function shaftRadius(y: number) {
  if (y > SPHERE_Y) return 4.1;
  return 4.5 + 11.5 * Math.pow(1 - y / SPHERE_Y, 1.6);
}

function concreteTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e4e2dc';
    ctx.fillRect(0, 0, w, h);
    const r = rng(31);
    // Sliding-formwork lifts leave faint horizontal bands.
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = `rgba(90,90,85,${0.03 + r() * 0.05})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 3000; i++) {
      const v = 190 + r() * 50;
      ctx.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
  });
}

/**
 * Sphere skin: triangular stainless-steel facets, with the dark window band
 * of the observation deck and Telecafé below the equator. Canvas row 0 = north pole.
 */
function sphereMaps() {
  const W = 1024, H = 512;
  const latToY = (lat: number) => ((90 - lat) / 180) * H;
  const bandTop = latToY(-8), bandBottom = latToY(-44);
  const cols = 60;
  const draw = (ctx: CanvasRenderingContext2D, kind: 'color' | 'rough' | 'glow') => {
    ctx.fillStyle = kind === 'color' ? '#c9cdd2' : kind === 'rough' ? '#5a5a5a' : '#000';
    ctx.fillRect(0, 0, W, H);
    if (kind === 'color') {
      const r = rng(5);
      const rows = 16;
      for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
        const x = (c / cols) * W, y = (row / rows) * H, cw = W / cols, ch = H / rows;
        for (const tri of [[[x, y], [x + cw, y], [x, y + ch]], [[x + cw, y], [x + cw, y + ch], [x, y + ch]]]) {
          const v = 175 + r() * 60;
          ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
          ctx.beginPath();
          ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]);
          ctx.fill();
        }
      }
      ctx.strokeStyle = 'rgba(80,85,92,0.5)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo((c / cols) * W, 0); ctx.lineTo((c / cols) * W, H); ctx.stroke(); }
    }
    // Window band: two storeys of glazing.
    ctx.fillStyle = kind === 'color' ? '#1d2a33' : kind === 'rough' ? '#0a0a0a' : '#ffc98a';
    ctx.fillRect(0, bandTop, W, bandBottom - bandTop);
    ctx.fillStyle = kind === 'color' ? '#8d949a' : kind === 'rough' ? '#555' : '#000';
    const mid = (bandTop + bandBottom) / 2;
    ctx.fillRect(0, mid - 3, W, 6);
    for (let c = 0; c < cols; c++) ctx.fillRect((c / cols) * W - 1, bandTop, 3, bandBottom - bandTop);
  };
  const color = canvasTexture(W, H, (ctx) => draw(ctx, 'color'));
  const rough = canvasTexture(W, H, (ctx) => draw(ctx, 'rough'), false);
  const glow = canvasTexture(W, H, (ctx) => draw(ctx, 'glow'));
  return { color, rough, glow };
}

/** Folded-plate pavilion roof around the tower foot: alternating peaks and valleys. */
function pavilion(): THREE.Group {
  const group = new THREE.Group();
  const folds = 18;
  const inner = 17, outer = 40;
  const positions: number[] = [];
  const push = (...v: THREE.Vector3[]) => v.forEach((p) => positions.push(p.x, p.y, p.z));
  const P = (r: number, a: number, y: number) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  for (let i = 0; i < folds; i++) {
    const a0 = (i / folds) * Math.PI * 2, a1 = ((i + 0.5) / folds) * Math.PI * 2, a2 = ((i + 1) / folds) * Math.PI * 2;
    // Outer edge: peaks at fold centres, valleys between; inner edge meets the shaft.
    const valley0 = P(outer * 0.92, a0, 6.5), peak = P(outer, a1, 13), valley1 = P(outer * 0.92, a2, 6.5);
    const in0 = P(inner, a0, 10), in1 = P(inner, a2, 10), inMid = P(inner, a1, 11);
    push(in0, peak, valley0, in0, inMid, peak, inMid, in1, peak, in1, valley1, peak);
    // Glazed wall under each fold.
    const g0 = P(outer * 0.92, a0, 0), g2 = P(outer * 0.92, a2, 0), gp = P(outer, a1, 0);
    push(valley0, peak, gp, valley0, gp, g0, peak, valley1, g2, peak, g2, gp);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // Each fold emits 12 roof vertices followed by 12 glazing vertices.
  for (let i = 0; i < folds; i++) {
    geo.addGroup(i * 24, 12, 0);
    geo.addGroup(i * 24 + 12, 12, 1);
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcfccc4, roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.1, metalness: 0.4, emissive: 0xffd9a8, side: THREE.DoubleSide });
  registerNight(glassMat, 0.55, 0);
  const mesh = new THREE.Mesh(geo, [roofMat, glassMat]);
  group.add(mesh);
  return group;
}

export function buildFernsehturm(): Landmark {
  const fp = footprint('fernsehturm');
  const c = centroid(fp.outer[0]);
  const group = new THREE.Group();
  group.name = 'fernsehturm';
  group.position.set(c.x, 0, c.y);

  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.85 });
  const profile: THREE.Vector2[] = [];
  for (let y = 0; y <= SHAFT_TOP; y += y < 40 ? 4 : 10) profile.push(new THREE.Vector2(shaftRadius(y), y));
  profile.push(new THREE.Vector2(0.01, SHAFT_TOP));
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), concrete);
  shaft.name = 'shaft';
  group.add(shaft);

  const maps = sphereMaps();
  const sphereMat = new THREE.MeshStandardMaterial({
    map: maps.color, roughnessMap: maps.rough, emissiveMap: maps.glow, emissive: 0xffffff,
    metalness: 0.85, roughness: 1, envMapIntensity: 1.3,
  });
  registerNight(sphereMat, 1.4, 0);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R, 96, 48), sphereMat);
  sphere.position.y = SPHERE_Y;
  sphere.name = 'sphere';
  group.add(sphere);
  // Thin ledges framing the window band.
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, metalness: 0.7, roughness: 0.4 });
  for (const lat of [-7, -45]) {
    const rad = THREE.MathUtils.degToRad(lat);
    const ledge = new THREE.Mesh(new THREE.TorusGeometry(SPHERE_R * Math.cos(rad) + 0.25, 0.25, 6, 96), ledgeMat);
    ledge.rotation.x = Math.PI / 2;
    ledge.position.y = SPHERE_Y + SPHERE_R * Math.sin(rad);
    group.add(ledge);
  }

  // Antenna: steel lattice clad in red/white bands, with service platforms.
  const red = new THREE.MeshStandardMaterial({ color: 0xc8352e, roughness: 0.5, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.5, metalness: 0.3 });
  const mast = new THREE.Group();
  let y = SHAFT_TOP;
  let band = 0;
  while (y < TOTAL - 4) {
    const h = y < 285 ? 17 : 10;
    const t0 = (y - SHAFT_TOP) / (TOTAL - SHAFT_TOP), t1 = Math.min(1, (y + h - SHAFT_TOP) / (TOTAL - SHAFT_TOP));
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - 1.75 * t1, 2.2 - 1.75 * t0, h, 16), band % 2 ? red : white);
    seg.position.y = y + h / 2;
    mast.add(seg);
    y += h;
    band++;
  }
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, TOTAL - y, 8), red);
  tip.position.y = (TOTAL + y) / 2;
  mast.add(tip);
  for (const py of [262, 285, 307]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - (py - 250) * 0.02, 3.4 - (py - 250) * 0.02, 0.5, 20), white);
    ring.position.y = py;
    mast.add(ring);
  }
  group.add(mast);

  // Aviation obstruction lights (red), blinking after dusk.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const beacons: THREE.Mesh[] = [];
  for (const [by, r] of [[TOTAL, 0.6], [307, 2], [262, 2.6], [SPHERE_Y + SPHERE_R + 0.5, 4.5]] as const) {
    for (let k = 0; k < (r > 1 ? 4 : 1); k++) {
      const a = (k / 4) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), beaconMat);
      m.position.set(r > 1 ? Math.cos(a) * r : 0, by, r > 1 ? Math.sin(a) * r : 0);
      beacons.push(m);
      group.add(m);
    }
  }

  group.add(pavilion());
  shadowed(group);
  for (const b of beacons) b.castShadow = false;

  const focus = new THREE.Vector3(c.x, 180, c.y);
  return {
    key: 'fernsehturm',
    name: 'Fernsehturm',
    detail: '368 m · 1969',
    object: group,
    labelAt: new THREE.Vector3(c.x, TOTAL + 8, c.y),
    view: {
      focus,
      distance: 620,
      bearing: 140,
      elevation: 14,
      street: { from: streetFrom(c, 125, 210), lookAt: new THREE.Vector3(c.x, 150, c.y) },
    },
    update: (time) => {
      const on = Math.floor(time * 0.8) % 2 === 0;
      for (const b of beacons) b.visible = on;
    },
  };
}
