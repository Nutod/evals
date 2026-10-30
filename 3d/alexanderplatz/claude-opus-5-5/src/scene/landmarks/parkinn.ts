import * as THREE from 'three';
import { canvasTexture, signTexture } from '../../lib/textures';
import { MeshBuilder, rng } from '../../lib/geom';
import { registerNight } from '../night';
import { anchorFrame, footprint, placeOnFrame, shadowed, streetFrom, type Landmark } from './common';

// Hotel tower (1970, 37 storeys, 125 m roof) on a four-storey retail podium.
// Tower footprint and podium outline from OSM; facade rhythm approximated.
const PODIUM_H = 15;
const ROOF_H = 125;
const FLOORS = 37;
const BAYS = 12;

function towerFacade(longSide: boolean) {
  const floors = 8;
  const W = 768, H = 512;
  const cw = W / BAYS, ch = H / floors;
  const r = rng(longSide ? 12 : 13);
  const lit: boolean[] = [];
  const draw = (ctx: CanvasRenderingContext2D, glow: boolean) => {
    ctx.fillStyle = glow ? '#000' : '#d9dcdd';
    ctx.fillRect(0, 0, W, H);
    for (let f = 0; f < floors; f++) for (let b = 0; b < BAYS; b++) {
      const i = f * BAYS + b;
      if (!glow) lit[i] = r() < 0.4;
      const x = b * cw, y = f * ch;
      if (glow) {
        if (!lit[i]) continue;
        ctx.fillStyle = (i * 7) % 5 === 0 ? '#a9c8ff' : '#ffd9a6';
      } else {
        const g = ctx.createLinearGradient(0, y, 0, y + ch);
        g.addColorStop(0, '#4a6476');
        g.addColorStop(1, '#22313b');
        ctx.fillStyle = g;
      }
      ctx.fillRect(x + cw * 0.14, y + ch * 0.18, cw * 0.72, ch * 0.58);
    }
    if (!glow) {
      // Vertical aluminium fins between bays give the tower its pinstripe look.
      ctx.fillStyle = '#f2f3f1';
      for (let b = 0; b <= BAYS; b++) ctx.fillRect(b * cw - 4, 0, 8, H);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let b = 0; b <= BAYS; b++) ctx.fillRect(b * cw + 4, 0, 3, H);
    }
  };
  return {
    map: canvasTexture(W, H, (ctx) => draw(ctx, false)),
    glow: canvasTexture(W, H, (ctx) => draw(ctx, true)),
  };
}

function podiumFacade() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#eceeed';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d3c45';
    ctx.fillRect(0, h * 0.62, w, h * 0.3); // shop glazing
    ctx.fillStyle = '#c8cdd0';
    for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h * 0.6); // cladding joints
    ctx.fillStyle = '#7c8a92';
    ctx.fillRect(0, h * 0.25, w, 6);
  });
}

export function buildParkInn(): Landmark {
  const group = new THREE.Group();
  group.name = 'parkinn';

  // Podium: OSM outline extruded.
  const fp = footprint('parkinn');
  const podium = new MeshBuilder();
  podium.walls(fp.outer[0], 0, PODIUM_H, 24, PODIUM_H);
  const podiumRoof = new MeshBuilder();
  podiumRoof.color.set(0xb0b2b0);
  podiumRoof.polygon(fp.outer[0], [], PODIUM_H, 6);
  const podiumMat = new THREE.MeshStandardMaterial({ map: podiumFacade(), roughness: 0.6, emissive: 0xffd8a8 });
  registerNight(podiumMat, 0.25, 0);
  group.add(new THREE.Mesh(podium.build(), podiumMat));
  group.add(new THREE.Mesh(podiumRoof.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  // Tower slab aligned to its OSM part.
  const frame = anchorFrame('parkinnTower');
  const tower = new THREE.Group();
  placeOnFrame(tower, frame);
  const L = frame.length, W = frame.width;
  const towerH = ROOF_H - PODIUM_H;
  const floorsInTile = 8;
  const long = towerFacade(true);
  const short = towerFacade(false);
  for (const t of [long.map, long.glow]) t.repeat.set(Math.round(L / 3.9) / BAYS, FLOORS / floorsInTile);
  for (const t of [short.map, short.glow]) t.repeat.set(Math.round(W / 3.9) / BAYS, FLOORS / floorsInTile);
  const longMat = new THREE.MeshStandardMaterial({ map: long.map, emissiveMap: long.glow, emissive: 0xffffff, roughness: 0.35, metalness: 0.4 });
  const shortMat = new THREE.MeshStandardMaterial({ map: short.map, emissiveMap: short.glow, emissive: 0xffffff, roughness: 0.35, metalness: 0.4 });
  registerNight(longMat, 1.1, 0);
  registerNight(shortMat, 1.1, 0);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9da3a6, roughness: 0.6, metalness: 0.3 });
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L, towerH, W), [shortMat, shortMat, capMat, capMat, longMat, longMat]);
  slab.position.y = PODIUM_H + towerH / 2;
  tower.add(slab);

  // Crown: plant floors, roof edge and the rooftop sign.
  const crown = new THREE.Mesh(new THREE.BoxGeometry(L * 0.72, 7, W * 0.7), new THREE.MeshStandardMaterial({ color: 0x7f878b, roughness: 0.5, metalness: 0.4 }));
  crown.position.y = ROOF_H + 3.5;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 1.2, W + 0.6), capMat);
  edge.position.y = ROOF_H;
  tower.add(crown, edge);

  const sign = signTexture('PARK INN', { bg: '#1c2226', fg: '#ffffff', height: 128, font: '800 84px system-ui, Helvetica, Arial, sans-serif' });
  const signMat = new THREE.MeshStandardMaterial({ map: sign.texture, emissiveMap: sign.texture, emissive: 0xffffff, roughness: 0.5 });
  registerNight(signMat, 1.6, 0.15);
  const signH = 5.5;
  for (const side of [1, -1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(signH * sign.aspect, signH), signMat);
    panel.position.set(0, ROOF_H + 3.5, side * (W * 0.35 + 0.05));
    panel.rotation.y = side > 0 ? 0 : Math.PI;
    tower.add(panel);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 22, 6), capMat);
  antenna.position.set(L * 0.25, ROOF_H + 7 + 11, 0);
  tower.add(antenna);
  group.add(tower);
  shadowed(group);

  const c = frame.center;
  return {
    key: 'parkinn',
    name: 'Park Inn',
    detail: '125 m · 1970',
    object: group,
    labelAt: new THREE.Vector3(c.x, ROOF_H + 14, c.y),
    view: { focus: new THREE.Vector3(c.x, 60, c.y), distance: 300, bearing: 150, elevation: 16, street: { from: streetFrom(c, 160, 170), lookAt: new THREE.Vector3(c.x, 70, c.y) } },
  };
}
