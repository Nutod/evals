import * as THREE from 'three';
import { archPath, brickPattern, canvasTexture } from '../../lib/textures';
import { centroid, MeshBuilder } from '../../lib/geom';
import { registerNight } from '../night';
import { anchorCenter, anchorFrame, footprint, shadowed, streetFrom, type Landmark } from './common';

// Rotes Rathaus (1861–69): clinker-brick block around three courtyards with the
// terracotta "stone chronicle" frieze above the ground floor and a 74 m tower.
// Footprint and tower position from OSM; storey heights and ornament approximate.
const EAVES = 24;
const BAY = 6;
const PX_PER_M = 512 / EAVES;

/** One 6 m bay over the full 24 m height. Canvas y=0 is the eaves. */
function facadeMaps() {
  const W = Math.round(BAY * PX_PER_M), H = 512;
  const Y = (m: number) => H - m * PX_PER_M; // metres above ground to canvas y
  const openings: { x: number; y: number; w: number; h: number }[] = [
    { x: W * 0.2, y: Y(5.6), w: W * 0.6, h: 5.6 * PX_PER_M }, // arcade
    ...[0.18, 0.56].map((fx) => ({ x: W * fx, y: Y(12.4), w: W * 0.26, h: 4.6 * PX_PER_M })), // piano nobile pair
    ...[0.18, 0.56].map((fx) => ({ x: W * fx, y: Y(17.6), w: W * 0.26, h: 3.8 * PX_PER_M })),
    ...[0.22, 0.58].map((fx) => ({ x: W * fx, y: Y(21.8), w: W * 0.2, h: 2.4 * PX_PER_M })),
  ];
  const draw = (ctx: CanvasRenderingContext2D, kind: 'color' | 'glow' | 'rough') => {
    if (kind === 'color') brickPattern(ctx, W, H, '#b8573c', 4);
    else {
      ctx.fillStyle = kind === 'glow' ? '#000' : '#e0e0e0';
      ctx.fillRect(0, 0, W, H);
    }
    if (kind === 'color') {
      // Terracotta frieze band with relief panels.
      ctx.fillStyle = '#c9925c';
      ctx.fillRect(0, Y(7.2), W, 1.4 * PX_PER_M);
      ctx.fillStyle = 'rgba(90,50,25,0.45)';
      for (let x = 4; x < W; x += 14) ctx.fillRect(x, Y(7.0), 8, 1.0 * PX_PER_M);
      // String courses and the corbel-arch cornice.
      ctx.fillStyle = '#d8b48f';
      for (const m of [5.8, 12.8, 18.2]) ctx.fillRect(0, Y(m), W, 5);
      ctx.fillStyle = '#7c3524';
      ctx.fillRect(0, 0, W, 0.9 * PX_PER_M);
      for (let x = 0; x < W; x += 12) { archPath(ctx, x + 1, 0.9 * PX_PER_M, 10, 10); ctx.fill(); }
      // Pilasters at bay edges.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, 6, H);
      ctx.fillRect(W - 6, 0, 6, H);
    }
    for (const o of openings) {
      if (kind === 'color') {
        ctx.fillStyle = '#e1c39c';
        archPath(ctx, o.x - 3, o.y - 3, o.w + 6, o.h + 3);
        ctx.fill();
        const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        g.addColorStop(0, '#5a6c76'); g.addColorStop(1, '#1f2a30');
        ctx.fillStyle = g;
      } else ctx.fillStyle = kind === 'glow' ? '#ffd29a' : '#202020';
      archPath(ctx, o.x, o.y, o.w, o.h);
      ctx.fill();
      if (kind === 'color') {
        ctx.fillStyle = 'rgba(225,215,195,0.85)';
        ctx.fillRect(o.x + o.w / 2 - 1, o.y + o.w / 2, 2, o.h - o.w / 2);
      }
    }
  };
  const map = canvasTexture(W, H, (ctx) => draw(ctx, 'color'));
  const glow = canvasTexture(W, H, (ctx) => draw(ctx, 'glow'));
  const rough = canvasTexture(W, H, (ctx) => draw(ctx, 'rough'), false);
  for (const t of [map, glow, rough]) t.wrapT = THREE.ClampToEdgeWrapping;
  return { map, glow, rough };
}

function towerTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    brickPattern(ctx, w, h, '#b45238', 4);
    ctx.fillStyle = '#d8b48f';
    for (const y of [h * 0.3, h * 0.62]) ctx.fillRect(0, y, w, 6);
    // Tall paired arched lights in the upper shaft, portal at the base.
    for (const cx of [w * 0.3, w * 0.7]) {
      ctx.fillStyle = '#1e272c';
      archPath(ctx, cx - 18, h * 0.06, 36, h * 0.22); ctx.fill();
      archPath(ctx, cx - 14, h * 0.36, 28, h * 0.22); ctx.fill();
    }
    ctx.fillStyle = '#1e272c';
    archPath(ctx, w * 0.32, h * 0.72, w * 0.36, h * 0.28); ctx.fill();
    ctx.strokeStyle = '#e1c39c'; ctx.lineWidth = 5; ctx.stroke();
  }, true, false);
}

function clockTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#20282c';
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#d8b25a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(c + Math.cos(a) * (c - 14) - 3, c + Math.sin(a) * (c - 14) - 3, 6, 6);
    }
    ctx.lineWidth = 5; ctx.strokeStyle = '#d8b25a';
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c, c - 38); ctx.moveTo(c, c); ctx.lineTo(c + 26, c + 10); ctx.stroke();
  }, true, false);
}

export function buildRathaus(): Landmark {
  const fp = footprint('rathaus');
  const group = new THREE.Group();
  group.name = 'rathaus';

  // Main block: OSM outline with courtyard holes.
  const maps = facadeMaps();
  const walls = new MeshBuilder();
  for (const ring of [...fp.outer, ...fp.inner]) walls.walls(ring, 0, EAVES, BAY, EAVES);
  const wallMat = new THREE.MeshStandardMaterial({ map: maps.map, emissiveMap: maps.glow, emissive: 0xffffff, roughnessMap: maps.rough, roughness: 1, envMapIntensity: 0.6 });
  registerNight(wallMat, 0.9, 0);
  group.add(new THREE.Mesh(walls.build(), wallMat));

  const roof = new MeshBuilder();
  roof.color.set(0x6f7174);
  for (const ring of fp.outer) roof.polygon(ring, fp.inner, EAVES + 0.9, 6);
  const parapet = new MeshBuilder();
  for (const ring of [...fp.outer, ...fp.inner]) parapet.walls(ring, EAVES, EAVES + 1.4, 1, 1);
  group.add(new THREE.Mesh(roof.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  group.add(new THREE.Mesh(parapet.build(), new THREE.MeshStandardMaterial({ color: 0x9b4632, roughness: 0.9 })));

  // Tower on the Rathausstraße front.
  const tf = anchorFrame('rathausTower');
  const tc = anchorCenter('rathausTower');
  const tower = new THREE.Group();
  tower.position.set(tc.x, 0, tc.y);
  tower.rotation.y = -tf.angle;
  const side = Math.min(tf.length, 15);
  const brick = towerTexture();
  const towerMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9b4632, roughness: 0.85 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(side, 52, side), [towerMat, towerMat, capMat, capMat, towerMat, towerMat]);
  shaft.position.y = 26;
  tower.add(shaft);
  const belfryTex = towerTexture();
  belfryTex.repeat.set(1, 0.5);
  const belfryMat = new THREE.MeshStandardMaterial({ map: belfryTex, roughness: 0.85 });
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(side - 2, 12, side - 2), [belfryMat, belfryMat, capMat, capMat, belfryMat, belfryMat]);
  belfry.position.y = 58;
  tower.add(belfry);
  const balustrade = new THREE.Mesh(new THREE.BoxGeometry(side + 0.6, 1.4, side + 0.6), capMat);
  balustrade.position.y = 52.4;
  const top = new THREE.Mesh(new THREE.BoxGeometry(side - 1, 1.6, side - 1), capMat);
  top.position.y = 64.6;
  tower.add(balustrade, top);
  // Octagonal corner turrets with pointed caps.
  const turretMat = new THREE.MeshStandardMaterial({ color: 0xa94c35, roughness: 0.85 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x4d5559, roughness: 0.6, metalness: 0.2 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 26, 8), turretMat);
    turret.position.set((sx * side) / 2, 53, (sz * side) / 2);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 8), slate);
    cap.position.set((sx * side) / 2, 69, (sz * side) / 2);
    tower.add(turret, cap);
  }
  // Clock faces on all four sides.
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.4, emissive: 0xffe0a0, emissiveMap: clockTexture() });
  registerNight(clockMat, 0.8, 0);
  for (let k = 0; k < 4; k++) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), clockMat);
    const a = (k * Math.PI) / 2;
    face.position.set(Math.sin(a) * (side / 2 + 0.06), 46.5, Math.cos(a) * (side / 2 + 0.06));
    face.rotation.y = a;
    tower.add(face);
  }
  // Flagpole with the Berlin flag (stripes only, simplified).
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 10, 6), slate);
  pole.position.y = 70.4;
  const flagTex = canvasTexture(60, 40, (ctx, w, h) => {
    ctx.fillStyle = '#d42a2a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, h * 0.2, w, h * 0.6);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(w * 0.45, h * 0.5, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  }, true, false);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.x = 1.55;
  const flagPivot = new THREE.Group();
  flagPivot.position.y = 74;
  flagPivot.add(flag);
  tower.add(pole, flagPivot);
  group.add(tower);
  shadowed(group);

  const c = centroid(fp.outer[0]);
  return {
    key: 'rathaus',
    name: 'Rotes Rathaus',
    detail: '74 m · 1869',
    object: group,
    labelAt: new THREE.Vector3(tc.x, 79, tc.y),
    view: { focus: new THREE.Vector3(c.x, 25, c.y), distance: 260, bearing: 20, elevation: 22, street: { from: streetFrom(tc, 15, 95), lookAt: new THREE.Vector3(tc.x, 30, tc.y) } },
    update: (time) => {
      flagPivot.rotation.y = Math.sin(time * 1.3) * 0.25;
    },
  };
}
