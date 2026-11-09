import * as THREE from 'three';
import { centroid, toRing, type P2 } from '../core/geo';
import { MeshBuilder, xf } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { canvasTexture } from '../core/textures';
import { osm } from '../data/osm';
import type { World } from './world';

/** Vertical streaks with soft alpha, scrolled downward to read as falling water. */
function fallTexture(): THREE.Texture {
  return canvasTexture(64, 128, (g, w, h) => {
    const rng = mulberry32(141);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const len = 20 + rng() * 60;
      const grad = g.createLinearGradient(0, y, 0, y + len);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(235,245,255,${0.35 + rng() * 0.4})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      for (const oy of [-h, 0]) g.fillRect(x, y + oy, 1 + rng() * 2, len);
    }
  });
}

function rippleNormals(): THREE.Texture {
  return canvasTexture(
    128,
    128,
    (g, w, h) => {
      const rng = mulberry32(142);
      g.fillStyle = 'rgb(128,128,255)';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const tilt = Math.floor(rng() * 70);
        g.strokeStyle = `rgba(${128 + tilt},${128 - tilt},255,0.6)`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(rng() * w, rng() * h, 4 + rng() * 14, 0, Math.PI * 2);
        g.stroke();
      }
    },
    { srgb: false },
  );
}

export function buildFountains(world: World): void {
  const group = world.layers.landmarks;
  const stone = new MeshBuilder();
  const water = new MeshBuilder();
  const falls = new MeshBuilder();
  const rim = 0.45;

  // every mapped fountain gets a kerbed basin on its real outline
  for (const a of osm.areas) {
    if (a.k !== 'fountain') continue;
    const ring = toRing(a.p);
    const holes = (a.hs ?? []).map(toRing);
    water.polygon(ring, holes, rim - 0.12, 0xffffff, 1 / 5);
    for (const r of [ring, ...holes]) {
      for (let i = 0; i < r.length; i++) {
        const p = r[i];
        const q = r[(i + 1) % r.length];
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.2) continue;
        stone.box(len + 0.3, rim, 0.4, xf((p[0] + q[0]) / 2, rim / 2, (p[1] + q[1]) / 2, Math.atan2(-dz, dx)), 0xb9b1a4);
      }
    }
  }

  const veil = (x: number, y0: number, y1: number, z: number, r0: number, r1: number): void => {
    falls.add(new THREE.CylinderGeometry(r0, r1, y0 - y1, 14, 1, true), xf(x, (y0 + y1) / 2, z), 0xffffff, { uvScale: [3, (y0 - y1) / 2.5] });
  };

  // ---- Brunnen der Völkerfreundschaft: a spiral of 17 bowls rising to the centre ----
  const [vx, vz] = centroid(toRing(osm.landmarks.voelkerbrunnen.p));
  const copper = 0x8d6b4a;
  const enamel = [0x3f7f8a, 0x4c8f7a, 0x356a86];
  stone.add(new THREE.CylinderGeometry(4.2, 4.6, 0.9, 32), xf(vx, 0.45, vz), 0xa9a196);
  for (let i = 0; i < 17; i++) {
    const t = i / 16;
    const angle = t * Math.PI * 3.4;
    const r = 8.6 * (1 - t) + 0.2;
    const height = 1.3 + t * 4.9;
    const bowl = 1.55 - t * 0.5;
    const x = vx + Math.cos(angle) * r;
    const z = vz + Math.sin(angle) * r;
    stone.add(new THREE.CylinderGeometry(0.14, 0.2, height, 8), xf(x, height / 2, z), copper);
    stone.add(new THREE.CylinderGeometry(bowl, 0.22, 0.55, 16), xf(x, height + 0.27, z), copper);
    stone.add(new THREE.CylinderGeometry(bowl * 0.96, bowl * 0.96, 0.04, 16), xf(x, height + 0.5, z), enamel[i % 3]);
    veil(x, height + 0.5, rim - 0.1, z, bowl * 1.0, bowl * 1.12);
  }

  // ---- Neptunbrunnen: bronze group on a rock above a red granite basin ----
  const ring: P2[] = toRing(osm.landmarks.neptunbrunnen.p);
  const [nx, nz] = centroid(ring);
  const bronze = 0x4f6f5f;
  const granite = 0x9b6a5c;
  stone.add(new THREE.CylinderGeometry(3.3, 4.4, 1.5, 12), xf(nx, 0.75, nz), 0x8a8478);
  stone.add(new THREE.CylinderGeometry(2.3, 2.6, 0.5, 20), xf(nx, 1.75, nz), granite);
  stone.add(new THREE.CylinderGeometry(1.2, 1.9, 1.6, 9), xf(nx, 2.8, nz), 0x7c776c);
  // Neptune with trident
  stone.add(new THREE.CapsuleGeometry(0.42, 1.1, 4, 10), xf(nx, 4.5, nz, 0, 0.12), bronze);
  stone.add(new THREE.SphereGeometry(0.3, 12, 8), xf(nx, 5.55, nz + 0.05), bronze);
  stone.box(0.06, 3.2, 0.06, xf(nx + 0.6, 4.9, nz, 0, 0, -0.12), bronze);
  stone.box(0.5, 0.06, 0.06, xf(nx + 0.78, 6.45, nz), bronze);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    // the four river figures seated on the rim, sea creatures between them
    const fx = nx + Math.cos(a) * 6.3;
    const fz = nz + Math.sin(a) * 6.3;
    stone.add(new THREE.CapsuleGeometry(0.36, 0.7, 4, 8), xf(fx, 1.25, fz, -a, 0, 0.5), bronze);
    stone.add(new THREE.SphereGeometry(0.24, 10, 8), xf(fx - Math.cos(a) * 0.3, 1.95, fz - Math.sin(a) * 0.3), bronze);
    const b = a + Math.PI / 4;
    stone.add(new THREE.SphereGeometry(0.5, 10, 8), xf(nx + Math.cos(b) * 3.4, 1.0, nz + Math.sin(b) * 3.4, 0, 0, 0, [1.4, 0.7, 0.9]), bronze);
    veil(nx + Math.cos(b) * 3.0, 2.2, rim, nz + Math.sin(b) * 3.0, 0.08, 0.7);
  }
  veil(nx, 2.0, rim, nz, 2.3, 2.9);

  const ripple = rippleNormals();
  const fall = fallTexture();
  const waterMesh = water.mesh(
    new THREE.MeshStandardMaterial({ color: 0x4e7f8c, roughness: 0.06, metalness: 0.55, normalMap: ripple, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.88 }),
    'receive',
  );
  const fallMesh = falls.mesh(new THREE.MeshStandardMaterial({ map: fall, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, color: 0xeaf4ff, emissive: 0x8fa8b8, emissiveIntensity: 0.25 }), 'none');
  fallMesh.renderOrder = 3;
  group.add(stone.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })), waterMesh, fallMesh);

  world.updaters.push((dt) => {
    fall.offset.y += dt * 0.9;
    ripple.offset.x += dt * 0.05;
    ripple.offset.y += dt * 0.03;
  });
}
