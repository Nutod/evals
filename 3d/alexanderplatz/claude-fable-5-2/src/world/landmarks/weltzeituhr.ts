import * as THREE from 'three';
import { shared } from '../../core/materials';
import { MeshBuilder, xf } from '../../core/mesh';
import { mulberry32 } from '../../core/rng';
import { canvasTexture, FONT_CONDENSED, FONT_SANS, speckle } from '../../core/textures';
import { GROUND_LEVEL, layered, levelY } from '../ground';
import type { World } from '../world';
import { centreOf, freeSpot } from './common';
import type { Landmark } from './types';

export const WELTZEITUHR = { height: 10, columnHeight: 2.7, columnRadius: 0.75, drumRadius: 3.1, drumTop: 4.4, zones: 24 };

/** One panel per time zone, starting at UTC−11 and running east. German spellings, as on the clock. */
export const ZONE_CITIES: string[][] = [
  ['Samoa', 'Midway'], ['Honolulu', 'Tahiti'], ['Anchorage'], ['San Francisco', 'Los Angeles', 'Vancouver'],
  ['Denver', 'Edmonton'], ['Mexiko', 'Chicago'], ['New York', 'Havanna', 'Montreal', 'Lima'], ['Caracas', 'La Paz', 'Santiago'],
  ['Buenos Aires', 'Rio de Janeiro'], ['Südgeorgien'], ['Azoren', 'Kapverden'], ['London', 'Dublin', 'Lissabon', 'Accra'],
  ['Berlin', 'Paris', 'Rom', 'Prag', 'Warschau'], ['Helsinki', 'Kairo', 'Sofia', 'Kapstadt'], ['Moskau', 'Bagdad', 'Nairobi'], ['Dubai', 'Baku', 'Tbilissi'],
  ['Taschkent', 'Karatschi'], ['Almaty', 'Dhaka'], ['Bangkok', 'Hanoi', 'Jakarta'], ['Peking', 'Shanghai', 'Singapur', 'Manila'],
  ['Tokio', 'Seoul', 'Pjöngjang'], ['Sydney', 'Wladiwostok'], ['Magadan', 'Nouméa'], ['Wellington', 'Kamtschatka'],
];
const BERLIN_ZONE = 12;

function drumTexture(): THREE.Texture {
  const pw = 170;
  return canvasTexture(
    pw * 24,
    256,
    (g, w, h) => {
      const rng = mulberry32(71);
      g.fillStyle = '#b9bcbd';
      g.fillRect(0, 0, w, h);
      // brushed aluminium
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
        g.fillRect(rng() * w, rng() * h, 30 + rng() * 80, 1);
      }
      g.fillStyle = '#2b2f33';
      g.fillRect(0, 0, w, 14);
      g.fillRect(0, h - 14, w, 14);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      ZONE_CITIES.forEach((cities, i) => {
        const x = i * pw;
        g.fillStyle = 'rgba(30,34,38,0.55)';
        g.fillRect(x, 0, 2, h);
        g.fillStyle = '#23272b';
        const size = 25;
        g.font = `600 ${size}px ${FONT_CONDENSED}`;
        const top = h / 2 - ((cities.length - 1) * (size + 6)) / 2;
        cities.forEach((c, j) => g.fillText(c.toUpperCase(), x + pw / 2, top + j * (size + 6), pw - 12));
      });
    },
    { repeat: false },
  );
}

function hourTexture(): THREE.Texture {
  const pw = 96;
  return canvasTexture(
    pw * 24,
    96,
    (g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 54px ${FONT_SANS}`;
      for (let i = 0; i < 24; i++) {
        const hour = i + 1;
        const day = hour >= 7 && hour <= 18;
        g.fillStyle = day ? '#f1c232' : '#1d2b4f';
        g.fillRect(i * pw, 0, pw, h);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(i * pw, 0, 2, h);
        g.fillStyle = day ? '#1b1b1b' : '#f3f3f3';
        g.fillText(String(hour), i * pw + pw / 2, h / 2 + 3);
      }
      void w;
    },
    { repeat: false },
  );
}

/** Compass rose mosaic set into the paving under the clock. */
function roseTexture(): THREE.Texture {
  return canvasTexture(
    512,
    512,
    (g, w) => {
      const c = w / 2;
      const rng = mulberry32(72);
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#b4ada0';
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8f887c';
      g.beginPath();
      g.arc(c, c, c * 0.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c9c2b4';
      g.beginPath();
      g.arc(c, c, c * 0.74, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 16; i++) {
        const major = i % 4 === 0;
        const mid = i % 2 === 0;
        const len = c * (major ? 0.94 : mid ? 0.66 : 0.42);
        const half = (major ? 0.13 : 0.1) * c;
        g.save();
        g.translate(c, c);
        g.rotate((i / 16) * Math.PI * 2);
        g.fillStyle = major ? '#4b4640' : '#6f685d';
        g.beginPath();
        g.moveTo(0, -len);
        g.lineTo(half, 0);
        g.lineTo(0, 0);
        g.closePath();
        g.fill();
        g.fillStyle = major ? '#e2dccd' : '#a59d8f';
        g.beginPath();
        g.moveTo(0, -len);
        g.lineTo(-half, 0);
        g.lineTo(0, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
      speckle(g, w, w, rng, 9000, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.12)', 2.5);
      g.globalCompositeOperation = 'destination-in';
      g.beginPath();
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      g.fill();
    },
    { repeat: false },
  );
}

const faceted = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
};

export function buildWeltzeituhr(world: World): Landmark {
  const [cx, cz] = centreOf('weltzeituhr');
  const W = WELTZEITUHR;
  const group = new THREE.Group();
  group.name = 'weltzeituhr';
  group.position.set(cx, 0, cz);
  world.layers.landmarks.add(group);

  const rose = new THREE.Mesh(
    new THREE.CircleGeometry(8.6, 64).rotateX(-Math.PI / 2),
    layered(new THREE.MeshStandardMaterial({ map: roseTexture(), transparent: true, roughness: 0.8 }), GROUND_LEVEL.marking),
  );
  rose.position.y = levelY(GROUND_LEVEL.marking);
  rose.receiveShadow = true;
  group.add(rose);

  const b = new MeshBuilder();
  const dark = 0x3a3e42;
  const alu = 0xb5b9bc;
  b.add(new THREE.CylinderGeometry(W.columnRadius, W.columnRadius, W.columnHeight, 24), xf(0, W.columnHeight / 2, 0), dark);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box(0.05, W.columnHeight, 0.05, xf(Math.sin(a) * W.columnRadius, W.columnHeight / 2, Math.cos(a) * W.columnRadius, a), 0x54595e);
  }
  b.add(new THREE.CylinderGeometry(1.1, 0.95, 0.25, 24), xf(0, 0.125, 0), 0x2c2f33);
  // underside and lid of the drum
  b.add(faceted(new THREE.CylinderGeometry(W.drumRadius - 0.45, W.columnRadius, 0.35, 24)), xf(0, W.columnHeight + 0.05, 0), dark);
  b.add(faceted(new THREE.CylinderGeometry(W.drumRadius * 0.6, W.drumRadius + 0.06, 0.3, 24)), xf(0, W.drumTop + 0.15, 0), dark);
  // mast and hub of the planetary model
  b.add(new THREE.CylinderGeometry(0.05, 0.1, W.height - W.drumTop - 0.1, 10), xf(0, (W.height + W.drumTop - 0.1) / 2, 0), alu);
  b.add(new THREE.SphereGeometry(0.1, 10, 8), xf(0, W.height - 0.1, 0), alu);
  group.add(b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7 })));

  // time-zone drum
  const drum = new THREE.Mesh(
    faceted(new THREE.CylinderGeometry(W.drumRadius, W.drumRadius, W.drumTop - 3.3, 24, 1, true)),
    new THREE.MeshStandardMaterial({ map: drumTexture(), roughness: 0.4, metalness: 0.75 }),
  );
  drum.position.y = (W.drumTop + 3.3) / 2;
  drum.castShadow = true;
  group.add(drum);

  // revolving hour ring below the drum
  const hourMap = hourTexture();
  const hourMaterial = new THREE.MeshStandardMaterial({ map: hourMap, emissive: 0xffffff, emissiveMap: hourMap, emissiveIntensity: 0, roughness: 0.5 });
  const hours = new THREE.Mesh(faceted(new THREE.CylinderGeometry(W.drumRadius - 0.3, W.drumRadius - 0.42, 0.56, 24, 1, true)), hourMaterial);
  hours.position.y = 3.0;
  group.add(hours);

  // planetary model: hoops and spheres turning once a minute
  const planets = new THREE.Group();
  planets.position.y = 7.3;
  const pb = new MeshBuilder();
  pb.add(new THREE.SphereGeometry(0.34, 20, 14), null, 0xd9b34a);
  const orbits = [
    { r: 0.9, tilt: 0.5, turn: 0.3, size: 0.1 }, { r: 1.25, tilt: -0.35, turn: 1.4, size: 0.14 }, { r: 1.6, tilt: 0.2, turn: 2.2, size: 0.15 },
    { r: 1.95, tilt: -0.55, turn: 0.9, size: 0.12 }, { r: 2.3, tilt: 0.42, turn: 2.9, size: 0.28 }, { r: 2.6, tilt: -0.18, turn: 1.9, size: 0.24 },
  ];
  for (const o of orbits) {
    const m = xf(0, 0, 0, o.turn, Math.PI / 2 + o.tilt);
    pb.add(new THREE.TorusGeometry(o.r, 0.025, 6, 48), m, alu);
    for (const a of [o.turn * 2, o.turn * 2 + Math.PI * 0.9]) {
      const p = new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * o.r, 0).applyMatrix4(m);
      pb.add(new THREE.SphereGeometry(o.size, 14, 10), xf(p.x, p.y, p.z), 0xc8ccd0);
    }
  }
  const planetMesh = pb.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.95 }), 'cast');
  planets.add(planetMesh);
  group.add(planets);

  const step = (Math.PI * 2) / W.zones;
  world.updaters.push((dt) => {
    planets.rotation.y += (dt * Math.PI * 2) / 60;
    // hour tile "h" sits under the zone whose local time is h o'clock
    const berlinHour = world.clock.dayTime / 3600;
    hours.rotation.y = (BERLIN_ZONE + 0.5 - (berlinHour - 0.5)) * step;
    hourMaterial.emissiveIntensity = 0.55 * shared.night.value;
  });

  const [sx, sz] = freeSpot(world, cx + 9, cz + 14);
  return {
    id: 'weltzeituhr',
    height: 10,
    name: 'Weltzeituhr',
    kind: 'World clock · 1969',
    facts: ['10 m tall, on a 2.7 m column', '24-sided drum naming cities in every time zone, with a revolving hour ring', 'Planetary model above turns once a minute'],
    approximated: 'City list, panel engraving, planetary model and the paving rose.',
    anchor: [cx, W.height + 1.5, cz],
    orbit: { target: [cx, 4.5, cz], distance: 46, bearing: 330, tilt: 72 },
    street: { x: sx, z: sz, lookAt: [cx, 4.6, cz] },
  };
}
