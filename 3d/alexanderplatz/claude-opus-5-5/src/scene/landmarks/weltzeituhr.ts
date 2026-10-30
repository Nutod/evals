import * as THREE from 'three';
import { canvasTexture } from '../../lib/textures';
import { centroid } from '../../lib/geom';
import { layered } from '../ground';
import { registerNight } from '../night';
import { footprint, shadowed, streetFrom, type Landmark } from './common';

// Approximate: ~10 m overall; 24-sided time-zone drum on a slim column, the rotating
// hour ring beneath it and the stylised planetary model on top. City list abridged.
const ZONES: [string, string[]][] = [
  ['0', ['London', 'Lissabon', 'Dakar']], ['+1', ['Berlin', 'Paris', 'Rom']], ['+2', ['Kairo', 'Helsinki', 'Athen']],
  ['+3', ['Moskau', 'Bagdad', 'Nairobi']], ['+4', ['Baku', 'Dubai']], ['+5', ['Taschkent', 'Karatschi']],
  ['+6', ['Omsk', 'Dhaka']], ['+7', ['Hanoi', 'Bangkok', 'Jakarta']], ['+8', ['Peking', 'Ulan Bator']],
  ['+9', ['Tokio', 'Pjöngjang']], ['+10', ['Wladiwostok', 'Sydney']], ['+11', ['Magadan', 'Nouméa']],
  ['+12', ['Wellington', 'Fidschi']], ['−11', ['Samoa']], ['−10', ['Honolulu']], ['−9', ['Anchorage']],
  ['−8', ['Los Angeles', 'Vancouver']], ['−7', ['Denver']], ['−6', ['Mexiko', 'Chicago']],
  ['−5', ['New York', 'Havanna', 'Lima']], ['−4', ['Caracas', 'La Paz']], ['−3', ['Rio de Janeiro', 'Buenos Aires']],
  ['−2', ['Noronha']], ['−1', ['Azoren', 'Kap Verde']],
];

const DRUM_R = 2.1;
const DRUM_Y0 = 2.9, DRUM_Y1 = 4.6;

function drumTexture() {
  const panel = 128;
  return canvasTexture(panel * 24, 192, (ctx, _w, h) => {
    ZONES.forEach(([zone, cities], i) => {
      const x = i * panel;
      ctx.fillStyle = i % 2 ? '#d7dde0' : '#c4ccd1';
      ctx.fillRect(x, 0, panel, h);
      ctx.fillStyle = '#21323c';
      ctx.fillRect(x, 0, panel, 34);
      ctx.fillStyle = '#f4d65a';
      ctx.font = '700 22px system-ui, Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone, x + panel / 2, 25);
      ctx.fillStyle = '#1b262c';
      ctx.font = '600 15px system-ui, Helvetica, Arial, sans-serif';
      cities.forEach((city, k) => ctx.fillText(city.toUpperCase(), x + panel / 2, 66 + k * 34, panel - 10));
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + panel - 2, 0, 2, h);
    });
  }, true, false);
}

function hourTexture() {
  return canvasTexture(1536, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e9e4d6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b262c';
    ctx.font = '700 34px system-ui, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 24; i++) ctx.fillText(String(i + 1), ((i + 0.5) / 24) * w, h / 2 + 2);
  }, true, false);
}

function mosaicTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = '#b9b3a6';
    ctx.fillRect(0, 0, w, h);
    const rings = ['#8d887d', '#c9c4b8', '#9c7f72', '#c9c4b8', '#7d8486'];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(cx, cy, w / 2 - i * 34, 0, Math.PI * 2); ctx.fill();
    });
    // Compass rose
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const len = i % 4 === 0 ? w * 0.36 : i % 2 === 0 ? w * 0.26 : w * 0.18;
      ctx.fillStyle = i % 2 ? '#dcd7cb' : '#4a5155';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.lineTo(cx + Math.cos(a + 0.18) * 30, cy + Math.sin(a + 0.18) * 30);
      ctx.lineTo(cx + Math.cos(a - 0.18) * 30, cy + Math.sin(a - 0.18) * 30);
      ctx.fill();
    }
  }, true, false);
}

export function buildWeltzeituhr(): Landmark {
  const fp = footprint('weltzeituhr');
  const c = centroid(fp.outer[0]);
  const group = new THREE.Group();
  group.name = 'weltzeituhr';
  group.position.set(c.x, 0, c.y);

  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec2, metalness: 0.85, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4348, metalness: 0.6, roughness: 0.4 });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64).rotateX(-Math.PI / 2), layered(new THREE.MeshStandardMaterial({ map: mosaicTexture(), roughness: 0.8 }), 9));
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  group.add(floor);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 24), dark);
  plinth.position.y = 0.175;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, DRUM_Y0, 16), steel);
  column.position.y = DRUM_Y0 / 2;
  group.add(plinth, column);

  // Rotating hour ring under the drum (turns once per day).
  const hourRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.32, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: hourTexture(), roughness: 0.5, side: THREE.DoubleSide }),
  );
  hourRing.position.y = DRUM_Y0 - 0.25;
  group.add(hourRing);

  // 24-sided time-zone drum.
  const drumTex = drumTexture();
  const drumMat = new THREE.MeshStandardMaterial({ map: drumTex, emissiveMap: drumTex, emissive: 0xffffff, roughness: 0.45, metalness: 0.2 });
  registerNight(drumMat, 0.55, 0);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_Y1 - DRUM_Y0, 24, 1, true), drumMat);
  drum.position.y = (DRUM_Y0 + DRUM_Y1) / 2;
  drum.rotation.y = Math.PI / 24;
  group.add(drum);
  for (const y of [DRUM_Y0, DRUM_Y1]) {
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R + 0.12, DRUM_R + 0.12, 0.12, 24), steel);
    lid.position.y = y;
    lid.rotation.y = Math.PI / 24;
    group.add(lid);
  }

  // Upper mast and the planetary model: orbits as thin rings, planets as spheres.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 8), steel);
  mast.position.y = DRUM_Y1 + 2.3;
  group.add(mast);
  const planets = new THREE.Group();
  planets.position.y = 9.1;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8c547, metalness: 0.7, roughness: 0.3 }));
  planets.add(sun);
  const orbiters: { pivot: THREE.Object3D; speed: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const r = 0.45 + i * 0.16;
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 4, 64), steel);
    orbit.rotation.x = Math.PI / 2 + (i % 3 - 1) * 0.12;
    planets.add(orbit);
    const pivot = new THREE.Object3D();
    pivot.rotation.x = orbit.rotation.x - Math.PI / 2;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (i % 4) * 0.02, 8, 6), steel);
    planet.position.x = r;
    pivot.add(planet);
    pivot.rotation.y = i * 1.7;
    planets.add(pivot);
    orbiters.push({ pivot, speed: 0.6 / (1 + i * 0.5) });
  }
  group.add(planets);
  shadowed(group);
  floor.castShadow = false;

  return {
    key: 'weltzeituhr',
    name: 'Weltzeituhr',
    detail: '≈10 m · 1969',
    object: group,
    labelAt: new THREE.Vector3(c.x, 14, c.y),
    view: { focus: new THREE.Vector3(c.x, 5, c.y), distance: 32, bearing: 160, elevation: 12, street: { from: streetFrom(c, 200, 16), lookAt: new THREE.Vector3(c.x, 5.5, c.y) } },
    update: (time, dt) => {
      hourRing.rotation.y = (time / 86400) * Math.PI * 2;
      for (const o of orbiters) o.pivot.rotation.y += dt * o.speed;
    },
  };
}
