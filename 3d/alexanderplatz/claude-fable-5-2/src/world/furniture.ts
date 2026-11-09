import * as THREE from 'three';
import { SegmentIndex, toRing } from '../core/geo';
import { shared, tintMaterial } from '../core/materials';
import { MeshBuilder, xf } from '../core/mesh';
import { mulberry32 } from '../core/rng';
import { canvasTexture, FONT_CONDENSED, FONT_SANS, glowTexture, textSign } from '../core/textures';
import { osm, type OsmRoad } from '../data/osm';
import { GROUND_LEVEL, levelY } from './ground';
import { uBahnSquare } from './landmarks/station';
import type { World } from './world';

const LAMP_WARM = 0xffd9a0;

/** Instances one model at many placements. */
function instances(geometry: THREE.BufferGeometry, material: THREE.Material, placements: THREE.Matrix4[], shadows = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** BVG stop sign: green H on a yellow disc. */
function stopSignTexture(): THREE.Texture {
  return canvasTexture(
    128,
    128,
    (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#f2d21b';
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#1f7a3a';
      g.lineWidth = 9;
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2 - 9, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#1f7a3a';
      g.font = `700 ${w * 0.66}px ${FONT_SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', w / 2, w / 2 + 4);
    },
    { repeat: false },
  );
}

function tallLamp(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  const grey = 0x6d7477;
  b.add(new THREE.CylinderGeometry(0.07, 0.11, 9.2, 8), xf(0, 4.6, 0), grey);
  for (const side of [-1, 1]) {
    b.box(1.9, 0.08, 0.08, xf(side * 0.95, 9.1, 0, 0, 0, side * 0.12), grey);
    b.box(0.85, 0.12, 0.3, xf(side * 1.9, 9.2, 0), 0x4b5154);
    b.box(0.7, 0.03, 0.22, xf(side * 1.9, 9.13, 0), 0xfff3d6, { glow: LAMP_WARM });
  }
  return b.build();
}

function postLamp(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  b.add(new THREE.CylinderGeometry(0.05, 0.08, 4.3, 8), xf(0, 2.15, 0), 0x3d4447);
  b.add(new THREE.CylinderGeometry(0.34, 0.2, 0.45, 12), xf(0, 4.5, 0), 0xfff3d6, { glow: LAMP_WARM });
  b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12), xf(0, 4.76, 0), 0x3d4447);
  return b.build();
}

function bench(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  const wood = 0x8a6842;
  const iron = 0x33383b;
  for (let i = 0; i < 4; i++) b.box(1.9, 0.04, 0.09, xf(0, 0.46, -0.17 + i * 0.115), wood);
  for (let i = 0; i < 3; i++) b.box(1.9, 0.09, 0.035, xf(0, 0.62 + i * 0.13, -0.26 - i * 0.03), wood);
  for (const x of [-0.8, 0.8]) {
    b.box(0.06, 0.46, 0.45, xf(x, 0.23, 0), iron);
    b.box(0.06, 0.5, 0.06, xf(x, 0.72, -0.28, 0, -0.2), iron);
  }
  return b.build();
}

function signal(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  b.add(new THREE.CylinderGeometry(0.06, 0.07, 3.3, 8), xf(0, 1.65, 0), 0x3a4044);
  b.box(0.3, 0.9, 0.24, xf(0, 3.1, 0.16), 0x1d2022);
  b.add(new THREE.SphereGeometry(0.09, 8, 6), xf(0, 3.38, 0.29), 0x5a1512);
  b.add(new THREE.SphereGeometry(0.09, 8, 6), xf(0, 3.1, 0.29), 0x4d3a0d);
  b.add(new THREE.SphereGeometry(0.09, 8, 6), xf(0, 2.82, 0.29), 0x2de36f, { glow: 0x2de36f });
  return b.build();
}

/** Tram shelter: glazed back and side, flat roof, bench, lit route panel. */
function shelter(): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const b = new MeshBuilder(true);
  const steel = 0x3f474b;
  for (const x of [-2.4, 0, 2.4]) b.box(0.08, 2.5, 0.08, xf(x, 1.25, -0.7), steel);
  b.box(5.2, 0.1, 1.7, xf(0, 2.55, -0.05), 0x2f3538);
  b.box(5.0, 0.03, 1.5, xf(0, 2.49, -0.05), 0xfff6e0, { glow: 0xfff0d0 });
  b.box(2.6, 0.06, 0.4, xf(-0.9, 0.48, -0.42), 0x8a6842);
  b.box(1.2, 1.8, 0.12, xf(1.8, 1.3, -0.62), 0xf4f2ea, { glow: 0x9aa39a });
  const g = new MeshBuilder();
  g.box(5.0, 2.0, 0.03, xf(0, 1.35, -0.72), 0xffffff);
  g.box(0.03, 2.0, 1.3, xf(-2.5, 1.35, -0.05), 0xffffff);
  return { frame: b.build(), glass: g.build() };
}

/** Stair down to the U-Bahn: parapet walls on three sides. */
function subwayStair(): THREE.BufferGeometry {
  const b = new MeshBuilder(true);
  const stone = 0x8d8a82;
  b.box(0.25, 1.05, 6.2, xf(-1.3, 0.52, 0), stone);
  b.box(0.25, 1.05, 6.2, xf(1.3, 0.52, 0), stone);
  b.box(2.85, 1.05, 0.25, xf(0, 0.52, -3.1), stone);
  b.box(2.35, 0.05, 6.0, xf(0, 0.03, 0), 0x1c1e20);
  b.add(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), xf(1.3, 2.1, 3.0), 0x2c3134);
  return b.build();
}

export function buildFurniture(world: World): void {
  const group = world.layers.furniture;
  const rng = mulberry32(151);
  const material = tintMaterial({ roughness: 0.6, metalness: 0.35 });

  const roadIndex = new SegmentIndex<OsmRoad>();
  for (const r of osm.roads) if (r.k !== 'service') roadIndex.add(toRing(r.p), r);
  const tramIndex = new SegmentIndex<null>();
  for (const t of osm.tram) tramIndex.add(toRing(t.p), null);
  const pathIndex = new SegmentIndex<null>();
  for (const p of osm.paths) pathIndex.add(toRing(p.p), null);

  // ---- street lamps: tall twin-arm masts on roads, post-top lanterns elsewhere ----
  const tall: THREE.Matrix4[] = [];
  const post: THREE.Matrix4[] = [];
  const glowPos: number[] = [];
  const pools = new MeshBuilder();
  const yPool = levelY(GROUND_LEVEL.rail) + 0.03;
  for (let i = 0; i < osm.lamps.length; i += 2) {
    const x = osm.lamps[i];
    const z = osm.lamps[i + 1];
    if (world.collision.blocked(x, z)) continue;
    const road = roadIndex.nearest(x, z, 16);
    const big = !!road && road.data.k !== 'residential';
    if (big) {
      tall.push(xf(x, 0, z, Math.atan2(road.tx, road.tz)));
      glowPos.push(x, 9.0, z);
    } else {
      post.push(xf(x, 0, z));
      glowPos.push(x, 4.5, z);
    }
    const r = big ? 15 : 8.5;
    pools.quad([x - r, yPool, z + r], [x + r, yPool, z + r], [x + r, yPool, z - r], [x - r, yPool, z - r], 0xffffff);
  }
  group.add(instances(tallLamp(), material, tall), instances(postLamp(), material, post));

  // night-only halos and pools of light on the pavement
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const haloMaterial = new THREE.PointsMaterial({ map: glowTexture(64, 'rgba(255,236,200,1)', 'rgba(255,200,130,0.3)'), size: 7, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: LAMP_WARM, fog: false });
  const halos = new THREE.Points(glowGeometry, haloMaterial);
  const poolMaterial = new THREE.MeshBasicMaterial({ map: glowTexture(128, 'rgba(255,225,170,0.55)', 'rgba(255,200,130,0.22)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd7a0, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -30 });
  const poolMesh = pools.mesh(poolMaterial, 'none');
  poolMesh.renderOrder = 1;
  group.add(halos, poolMesh);
  halos.frustumCulled = false;
  world.everyFrame.push(() => {
    const n = shared.night.value;
    halos.visible = poolMesh.visible = n > 0.03;
    haloMaterial.opacity = n;
    poolMaterial.opacity = n * 0.55;
  });

  // ---- benches ----
  const benches: THREE.Matrix4[] = [];
  for (let i = 0; i < osm.benches.length; i += 3) {
    const x = osm.benches[i];
    const z = osm.benches[i + 1];
    if (world.collision.blocked(x, z)) continue;
    let rot: number;
    if (osm.benches[i + 2] >= 0) {
      rot = -THREE.MathUtils.degToRad(osm.benches[i + 2]) + Math.PI;
    } else {
      // face the nearest path
      const hit = pathIndex.nearest(x, z, 12);
      rot = hit ? Math.atan2(hit.x - x, hit.z - z) : rng() * Math.PI * 2;
    }
    benches.push(xf(x, 0, z, rot));
  }
  group.add(instances(bench(), material, benches));

  // ---- signals ----
  const signals: THREE.Matrix4[] = [];
  for (let i = 0; i < osm.signals.length; i += 2) {
    const x = osm.signals[i];
    const z = osm.signals[i + 1];
    const road = roadIndex.nearest(x, z, 14);
    if (!road) continue;
    // stand on the kerb to the right of the carriageway, facing oncoming traffic
    const off = road.data.w / 2 + 0.8;
    signals.push(xf(x - road.tz * off, 0, z + road.tx * off, Math.atan2(-road.tx, -road.tz)));
  }
  group.add(instances(signal(), material, signals));

  // ---- tram stops: shelter plus stop flag with the stop name ----
  const { frame, glass } = shelter();
  const shelters: THREE.Matrix4[] = [];
  const flagPoles: THREE.Matrix4[] = [];
  const stopSign = stopSignTexture();
  const signMaterial = new THREE.MeshStandardMaterial({ map: stopSign, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 });
  const signPlanes: THREE.Matrix4[] = [];
  const nameMaterials = new Map<string, { material: THREE.Material; aspect: number }>();
  const addStopFlag = (x: number, z: number, rot: number, name: string): void => {
    flagPoles.push(xf(x, 0, z));
    signPlanes.push(xf(x, 3.05, z, rot));
    if (!name) return;
    let entry = nameMaterials.get(name);
    if (!entry) {
      const sign = textSign(name.replace('S+U ', '').replace('U ', ''), { bg: '#f2d21b', fg: '#16181a', font: FONT_CONDENSED, weight: 600, px: 64, pad: 0.3 });
      entry = { material: new THREE.MeshStandardMaterial({ map: sign.texture, side: THREE.DoubleSide, roughness: 0.6 }), aspect: sign.aspect };
      nameMaterials.set(name, entry);
    }
    const h = 0.28;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.2, h * entry.aspect), h), entry.material);
    plate.applyMatrix4(xf(x, 2.5, z, rot));
    group.add(plate);
  };
  for (const s of osm.tramStops) {
    const track = tramIndex.nearest(s.x, s.z, 12);
    if (!track) continue;
    // shelters stand on the right-hand side of the track, open toward it
    const ox = -track.tz * 3.0;
    const oz = track.tx * 3.0;
    const x = track.x + ox;
    const z = track.z + oz;
    if (world.collision.blocked(x, z)) continue;
    const rot = Math.atan2(-ox, -oz);
    shelters.push(xf(x, 0.24, z, rot));
    for (const along of [-1.6, 0.2, 1.7]) world.spots.push([x + track.tx * along - ox * 0.25, 0.24, z + track.tz * along - oz * 0.25]);
    addStopFlag(track.x + ox * 0.75 + track.tx * 4.2, track.z + oz * 0.75 + track.tz * 4.2, rot + Math.PI / 2, s.n);
  }
  for (const s of osm.busStops) {
    const road = roadIndex.nearest(s.x, s.z, 14);
    if (world.collision.blocked(s.x, s.z)) continue;
    addStopFlag(s.x, s.z, road ? Math.atan2(road.tx, road.tz) + Math.PI / 2 : 0, s.n);
  }
  group.add(instances(frame, material, shelters));
  const glassMesh = instances(glass, new THREE.MeshStandardMaterial({ color: 0xbfd6dc, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.3, depthWrite: false }), shelters, false);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);
  group.add(instances(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8).translate(0, 1.7, 0), new THREE.MeshStandardMaterial({ color: 0x4a5053, roughness: 0.5, metalness: 0.6 }), flagPoles));
  group.add(instances(new THREE.CircleGeometry(0.34, 24), signMaterial, signPlanes, false));

  // ---- U-Bahn entrances ----
  const stairs: THREE.Matrix4[] = [];
  const uSigns: THREE.Matrix4[] = [];
  for (const e of osm.subwayEntrances) {
    if (world.collision.blocked(e.x, e.z)) continue;
    const hit = pathIndex.nearest(e.x, e.z, 10);
    const rot = hit ? Math.atan2(hit.tx, hit.tz) : rng() * Math.PI;
    stairs.push(xf(e.x, 0, e.z, rot));
    const sx = e.x + Math.cos(rot) * 1.3 + Math.sin(rot) * 3.0;
    const sz = e.z - Math.sin(rot) * 1.3 + Math.cos(rot) * 3.0;
    for (const turn of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) uSigns.push(xf(sx + Math.sin(rot + turn) * 0.36, 4.0, sz + Math.cos(rot + turn) * 0.36, rot + turn));
  }
  group.add(instances(subwayStair(), material, stairs));
  const uTexture = uBahnSquare();
  group.add(instances(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshStandardMaterial({ map: uTexture, emissive: 0xffffff, emissiveMap: uTexture, emissiveIntensity: 0.4, roughness: 0.5 }), uSigns, false));
}
