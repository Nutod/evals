import * as THREE from 'three';
import { MeshBuilder, xf } from '../../core/mesh';
import { canvasTexture, glowTexture } from '../../core/textures';
import { shared, tintMaterial } from '../../core/materials';
import type { World } from '../world';
import { centreOf, concreteTexture, sightSpot } from './common';
import type { Landmark } from './types';

/** Published dimensions in metres. */
export const FERNSEHTURM = {
  height: 368,
  shaftTop: 200,
  footRadius: 16,
  neckRadius: 4.5,
  sphereCentre: 216,
  sphereRadius: 16,
  deckHeight: 203.8,
  restaurantHeight: 207.5,
  mastBase: 250,
};

/** Normal map of the sphere cladding: a grid of shallow steel pyramids. */
function pyramidNormals(): THREE.Texture {
  return canvasTexture(
    256,
    256,
    (g, w, h) => {
      const n = 2;
      const s = w / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = i * s;
          const y = j * s;
          const c = [x + s / 2, y + s / 2];
          const faces: [string, number[]][] = [
            ['rgb(60,128,220)', [x, y, x, y + s]],
            ['rgb(196,128,220)', [x + s, y, x + s, y + s]],
            ['rgb(128,196,220)', [x, y, x + s, y]],
            ['rgb(128,60,220)', [x, y + s, x + s, y + s]],
          ];
          for (const [colour, e] of faces) {
            g.fillStyle = colour;
            g.beginPath();
            g.moveTo(e[0], e[1]);
            g.lineTo(e[2], e[3]);
            g.lineTo(c[0], c[1]);
            g.closePath();
            g.fill();
          }
        }
      }
      void h;
    },
    { srgb: false },
  );
}

const shaftRadius = (y: number): number => {
  const t = THREE.MathUtils.clamp(1 - y / FERNSEHTURM.shaftTop, 0, 1);
  return FERNSEHTURM.neckRadius + (FERNSEHTURM.footRadius - FERNSEHTURM.neckRadius) * Math.pow(t, 2.4);
};

export function buildFernsehturm(world: World): Landmark {
  const [cx, cz] = centreOf('fernsehturm');
  const F = FERNSEHTURM;
  const group = new THREE.Group();
  group.name = 'fernsehturm';
  group.position.set(cx, 0, cz);
  world.layers.landmarks.add(group);

  // ---- concrete shaft ----
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 50; i++) {
    const y = (i / 50) * F.shaftTop;
    profile.push(new THREE.Vector2(shaftRadius(y), y));
  }
  const concrete = concreteTexture(51, '#d2cdc3', 24);
  concrete.repeat.set(3, 26);
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 }));
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);

  // ---- everything painted or glazed ----
  const b = new MeshBuilder(true);
  const white = 0xe9e7e1;
  const red = 0xc0392b;
  const steelGrey = 0x9aa0a6;
  const glass = 0x1b242e;
  const warm = 0xffc98a;

  // slit windows climbing the shaft on four sides
  for (let side = 0; side < 4; side++) {
    for (let y = 26; y < 190; y += 8.2) {
      const r = shaftRadius(y) + 0.02;
      b.box(0.7, 2.2, 0.12, xf(Math.sin((side * Math.PI) / 2) * r, y, Math.cos((side * Math.PI) / 2) * r, (side * Math.PI) / 2), glass, { glow: 0x554433 });
    }
  }

  // flared collar that carries the sphere
  b.add(new THREE.CylinderGeometry(7.4, F.neckRadius, 4.5, 48, 1, true), xf(0, F.shaftTop - 1.2, 0), white);
  b.add(new THREE.CylinderGeometry(7.4, 7.4, 1.2, 48), xf(0, F.shaftTop + 1.6, 0), steelGrey);

  // window bands of the observation deck and the revolving restaurant
  const R = F.sphereRadius;
  for (const floor of [F.deckHeight, F.restaurantHeight]) {
    const mid = floor + 1.75 - F.sphereCentre;
    const top = Math.acos((mid + 1.0) / R);
    const bottom = Math.acos((mid - 1.0) / R);
    b.add(new THREE.SphereGeometry(R + 0.08, 72, 2, 0, Math.PI * 2, top, bottom - top), xf(0, F.sphereCentre, 0), glass, { glow: warm });
    // mullions
    const rr = Math.sqrt(R * R - mid * mid) + 0.12;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      b.box(0.12, 2.1, 0.1, xf(Math.sin(a) * rr, F.sphereCentre + mid, Math.cos(a) * rr, a, Math.asin(mid / R)), steelGrey);
    }
  }
  // seam ring on the upper hemisphere
  b.add(new THREE.TorusGeometry(Math.sqrt(R * R - 13 * 13), 0.28, 8, 64), xf(0, F.sphereCentre + 13, 0, 0, Math.PI / 2), steelGrey);

  // antenna carrier: banded drum with service galleries
  const sphereTop = F.sphereCentre + R;
  b.add(new THREE.CylinderGeometry(3.6, 5.2, F.mastBase - sphereTop + 1.5, 32), xf(0, (F.mastBase + sphereTop) / 2 - 0.75, 0), white);
  for (const y of [236, 241, 246, 250]) {
    b.add(new THREE.CylinderGeometry(5.6, 5.6, 0.35, 32), xf(0, y, 0), steelGrey);
    b.add(new THREE.TorusGeometry(5.6, 0.05, 6, 32), xf(0, y + 1.1, 0, 0, Math.PI / 2), steelGrey);
  }

  // red and white steel mast in four tapering stages
  const stages = [
    { y0: 250, y1: 272, r0: 2.3, r1: 2.0 },
    { y0: 272, y1: 302, r0: 1.7, r1: 1.4 },
    { y0: 302, y1: 336, r0: 1.1, r1: 0.85 },
    { y0: 336, y1: F.height, r0: 0.6, r1: 0.28 },
  ];
  let band = 0;
  for (const s of stages) {
    const n = Math.round((s.y1 - s.y0) / 5.6);
    for (let i = 0; i < n; i++) {
      const ya = s.y0 + ((s.y1 - s.y0) * i) / n;
      const yb = s.y0 + ((s.y1 - s.y0) * (i + 1)) / n;
      const ra = s.r0 + ((s.r1 - s.r0) * i) / n;
      const rb = s.r0 + ((s.r1 - s.r0) * (i + 1)) / n;
      b.add(new THREE.CylinderGeometry(rb, ra, yb - ya, 16), xf(0, (ya + yb) / 2, 0), band++ % 2 ? white : red);
    }
    b.add(new THREE.CylinderGeometry(s.r0 + 1.2, s.r0 + 1.2, 0.25, 20), xf(0, s.y0, 0), steelGrey);
    // dipole panels on the lower stages
    if (s.r0 > 1) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        b.box(0.5, (s.y1 - s.y0) * 0.6, 0.18, xf(Math.sin(a) * (s.r0 + 0.35), (s.y0 + s.y1) / 2, Math.cos(a) * (s.r0 + 0.35), a), white);
      }
    }
  }

  // ---- entrance pavilion: glazed ring under a pleated concrete roof ----
  const folds = 36;
  const rim = (k: number, r: number, y: number): [number, number, number] => {
    const a = (k / folds) * Math.PI * 2;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  };
  for (let k = 0; k < folds; k++) {
    const crest = k % 2 === 0;
    const i0 = rim(k, 14.5, crest ? 10.2 : 7.4);
    const o0 = rim(k, crest ? 37 : 29.5, crest ? 12.4 : 6.2);
    const i1 = rim(k + 1, 14.5, crest ? 7.4 : 10.2);
    const o1 = rim(k + 1, crest ? 29.5 : 37, crest ? 6.2 : 12.4);
    b.quad(i0, i1, o1, o0, white);
    b.quad(i1, i0, o0, o1, 0xd9d6cf);
  }
  b.add(new THREE.CylinderGeometry(26, 26, 5.6, 72, 1, true), xf(0, 3.4, 0), 0x33424d, { glow: 0xffd9a0 });
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    b.box(0.16, 5.6, 0.2, xf(Math.sin(a) * 26.05, 3.4, Math.cos(a) * 26.05, a), white);
  }
  b.add(new THREE.CylinderGeometry(38, 39.5, 0.6, 72), xf(0, 0.3, 0), 0xbdb9b0);

  const painted = b.mesh(tintMaterial({ roughness: 0.55, metalness: 0.15 }));
  group.add(painted);

  // ---- stainless steel sphere ----
  const normals = pyramidNormals();
  normals.repeat.set(30, 11);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 64),
    new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.3, normalMap: normals, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.5 }),
  );
  sphere.position.y = F.sphereCentre;
  sphere.castShadow = true;
  group.add(sphere);

  // ---- aircraft warning lights ----
  const beaconMaterial = new THREE.SpriteMaterial({ map: glowTexture(64, 'rgba(255,80,60,1)', 'rgba(255,40,30,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const [y, r, size] of [[F.height, 0, 16], [336, 1.6, 9], [302, 2, 9], [272, 2.6, 9], [F.mastBase, 5.8, 8]] as const) {
    const count = r === 0 ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(beaconMaterial);
      const a = (i / count) * Math.PI * 2;
      s.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      s.scale.setScalar(size);
      group.add(s);
    }
  }
  world.everyFrame.push((_dt, t) => {
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.4);
    beaconMaterial.opacity = (0.12 + 0.88 * shared.night.value) * pulse;
  });

  const clock = centreOf('weltzeituhr');
  const [sx, sz] = sightSpot(world, [cx, cz], [clock[0] - 30, clock[1] + 30], 90);
  return {
    id: 'fernsehturm',
    height: 368,
    name: 'Fernsehturm',
    kind: 'TV tower · 1969',
    facts: ['368 m to the antenna tip, the tallest structure in Germany', 'Steel-clad sphere 32 m across, with the viewing deck at 203.8 m and the revolving restaurant at 207.5 m', 'Concrete shaft 32 m wide at the foot'],
    approximated: 'Pavilion plan, cladding pattern, antenna fittings and shaft windows.',
    anchor: [cx, F.sphereCentre + R + 8, cz],
    orbit: { target: [cx, 165, cz], distance: 640, bearing: 305, tilt: 80 },
    street: { x: sx, z: sz, lookAt: [cx, 190, cz] },
  };
}
