import * as THREE from 'three';
import { archPath, brickPattern, canvasTexture } from '../../lib/textures';
import { MeshBuilder, orient, rng, type Ring } from '../../lib/geom';
import { registerNight } from '../night';
import { anchorCenter, anchorFrame, frameToWorld, placeOnFrame, shadowed, streetFrom, type Landmark } from './common';

// St. Marienkirche: Gothic brick hall church on a fieldstone base, polygonal east
// choir, and the west tower with Langhans' 1790 copper-clad spire (~90 m).
// Axis and tower position from OSM parts; wall heights and spire stages approximate.
const WALL_H = 17;
const RIDGE_H = 33;
const BAY = 6.5;

function gothicMaps() {
  const W = 128, H = 340; // one bay, full wall height
  const Y = (m: number) => H - (m / WALL_H) * H;
  const lancet = { x: W * 0.3, y: Y(14.2), w: W * 0.4, h: Y(3.4) - Y(14.2) };
  const draw = (ctx: CanvasRenderingContext2D, glow: boolean) => {
    if (glow) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffcf8a';
      archPath(ctx, lancet.x, lancet.y, lancet.w, lancet.h, true);
      ctx.fill();
      return;
    }
    brickPattern(ctx, W, H, '#a5503a', 3);
    // Fieldstone plinth.
    const r = rng(8);
    ctx.fillStyle = '#8c8a84';
    ctx.fillRect(0, Y(3), W, H - Y(3));
    for (let i = 0; i < 70; i++) {
      const v = 110 + r() * 60;
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      ctx.beginPath(); ctx.ellipse(r() * W, Y(3) + r() * (H - Y(3)), 4 + r() * 5, 3 + r() * 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Buttresses at the bay edges.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, 10, H);
    ctx.fillRect(W - 10, 0, 10, H);
    // Lancet window with tracery.
    ctx.fillStyle = '#c9a98a';
    archPath(ctx, lancet.x - 4, lancet.y - 4, lancet.w + 8, lancet.h + 4, true);
    ctx.fill();
    const g = ctx.createLinearGradient(0, lancet.y, 0, lancet.y + lancet.h);
    g.addColorStop(0, '#5e6f7d'); g.addColorStop(1, '#27313a');
    ctx.fillStyle = g;
    archPath(ctx, lancet.x, lancet.y, lancet.w, lancet.h, true);
    ctx.fill();
    ctx.fillStyle = '#c9a98a';
    ctx.fillRect(W / 2 - 1.5, lancet.y + lancet.w * 0.6, 3, lancet.h - lancet.w * 0.6);
    for (let y = lancet.y + lancet.w; y < lancet.y + lancet.h; y += 18) ctx.fillRect(lancet.x, y, lancet.w, 1.5);
  };
  const map = canvasTexture(W, H, (ctx) => draw(ctx, false));
  const glow = canvasTexture(W, H, (ctx) => draw(ctx, true));
  for (const t of [map, glow]) t.wrapT = THREE.ClampToEdgeWrapping;
  return { map, glow };
}

function towerStoneTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d6c09a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,70,45,0.25)';
    for (let y = 0; y < h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.fillStyle = '#3a3f44';
    for (const cx of [w * 0.32, w * 0.68]) { archPath(ctx, cx - 9, h * 0.1, 18, h * 0.3, true); ctx.fill(); }
    ctx.fillStyle = 'rgba(80,60,40,0.3)';
    archPath(ctx, w * 0.2, h * 0.5, w * 0.6, h * 0.4, true); ctx.fill();
  });
}

export function buildMarienkirche(): Landmark {
  const nave = anchorFrame('marienNave');
  const towerCenter = anchorCenter('marienTower');
  const tower = anchorFrame('marienTower');
  // Orient local +x from the tower (west) towards the choir (east).
  const dx = towerCenter.x - nave.center.x, dz = towerCenter.y - nave.center.y;
  const towerU = dx * Math.cos(nave.angle) + dz * Math.sin(nave.angle);
  const frame = { center: nave.center, angle: towerU > 0 ? nave.angle + Math.PI : nave.angle };
  const group = new THREE.Group();
  group.name = 'marienkirche';
  placeOnFrame(group, frame);

  const tu = -Math.abs(towerU);
  const towerSide = Math.min(tower.length, 14);
  const x0 = tu + towerSide / 2 - 0.5;
  const x1 = nave.length / 2 - 4;
  const halfW = Math.min(nave.width, 26) / 2;
  const apseR = halfW;

  // Hall + polygonal apse as one ring.
  const ring: Ring = [new THREE.Vector2(x0, -halfW), new THREE.Vector2(x1, -halfW)];
  const apse: THREE.Vector2[] = [];
  for (let k = 1; k < 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * Math.PI;
    apse.push(new THREE.Vector2(x1 + Math.cos(a) * apseR * 0.75, Math.sin(a) * apseR));
  }
  ring.push(...apse, new THREE.Vector2(x1, halfW), new THREE.Vector2(x0, halfW));
  const maps = gothicMaps();
  const walls = new MeshBuilder();
  walls.walls(orient(ring), 0, WALL_H, BAY, WALL_H);
  const wallMat = new THREE.MeshStandardMaterial({ map: maps.map, emissiveMap: maps.glow, emissive: 0xffffff, roughness: 0.9 });
  registerNight(wallMat, 0.7, 0);
  group.add(new THREE.Mesh(walls.build(), wallMat));

  // Steep roof: gabled over the hall, hipped round the apse.
  const roof = new MeshBuilder();
  const top = (x: number) => new THREE.Vector3(x, RIDGE_H, 0);
  const eave = (p: THREE.Vector2) => new THREE.Vector3(p.x, WALL_H, p.y);
  roof.quad(eave(ring[0]), eave(ring[1]), top(x1), top(x0), undefined, new THREE.Vector3(0, 1, -1));
  roof.quad(eave(ring.at(-1)!), eave(ring.at(-2)!), top(x1), top(x0), undefined, new THREE.Vector3(0, 1, 1));
  const apseRing = [ring[1], ...apse, ring.at(-2)!];
  for (let k = 0; k < apseRing.length - 1; k++) {
    const mid = apseRing[k].clone().add(apseRing[k + 1]).multiplyScalar(0.5).sub(new THREE.Vector2(x1, 0));
    roof.tri(eave(apseRing[k]), eave(apseRing[k + 1]), top(x1), undefined, undefined, undefined, new THREE.Vector3(mid.x, 1, mid.y));
  }
  const westGable = new MeshBuilder();
  westGable.tri(eave(ring[0]), eave(ring.at(-1)!), top(x0), undefined, undefined, undefined, new THREE.Vector3(-1, 0, 0));
  group.add(new THREE.Mesh(roof.build(), new THREE.MeshStandardMaterial({ color: 0x7d3b2e, roughness: 0.8 })));
  group.add(new THREE.Mesh(westGable.build(), new THREE.MeshStandardMaterial({ color: 0x9c4a36, roughness: 0.9 })));

  // West tower: fieldstone base, sandstone-clad upper storeys, copper lantern and spire.
  const tw = new THREE.Group();
  tw.position.x = tu;
  const stone = towerStoneTexture();
  stone.repeat.set(1, 2);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.85 });
  const baseTex = canvasTexture(64, 64, (ctx, w, h) => brickPattern(ctx, w, h, '#8f8b84', 6, 'rgba(40,40,40,0.25)'));
  const lower = new THREE.Mesh(new THREE.BoxGeometry(towerSide, 15, towerSide), new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.95 }));
  lower.position.y = 7.5;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(towerSide - 0.6, 35, towerSide - 0.6), stoneMat);
  upper.position.y = 32.5;
  tw.add(lower, upper);
  const copper = new THREE.MeshStandardMaterial({ color: 0x6f9e88, roughness: 0.55, metalness: 0.45 });
  const copperDark = new THREE.MeshStandardMaterial({ color: 0x4f7a68, roughness: 0.6, metalness: 0.4 });
  const lantern1 = new THREE.Mesh(new THREE.CylinderGeometry(towerSide * 0.42, towerSide * 0.48, 8, 8), copper);
  lantern1.position.y = 54;
  const lantern2 = new THREE.Mesh(new THREE.CylinderGeometry(towerSide * 0.3, towerSide * 0.36, 7, 8), copperDark);
  lantern2.position.y = 61.5;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(towerSide * 0.3, 25, 8), copper);
  spire.position.y = 77.5;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 }));
  finial.position.y = 90.3;
  tw.add(lantern1, lantern2, spire, finial);
  // Neo-Gothic pinnacles on the tower corners.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 9, 6), copper);
    pin.position.set((sx * towerSide) / 2 - sx * 0.8, 54.5, (sz * towerSide) / 2 - sz * 0.8);
    tw.add(pin);
  }
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(towerSide + 0.6, 1, towerSide + 0.6), copperDark);
  ledge.position.y = 50.2;
  tw.add(ledge);
  group.add(tw);
  shadowed(group);

  const tc = frameToWorld(frame, tu, 0);
  const mid = frameToWorld(frame, (x0 + x1) / 2, 0);
  return {
    key: 'marienkirche',
    name: 'Marienkirche',
    detail: '90 m · c. 1270',
    object: group,
    labelAt: new THREE.Vector3(tc.x, 100, tc.y),
    view: { focus: new THREE.Vector3(mid.x, 22, mid.y), distance: 190, bearing: 200, elevation: 20, street: { from: streetFrom(tc, 250, 80), lookAt: new THREE.Vector3(tc.x, 40, tc.y) } },
  };
}
