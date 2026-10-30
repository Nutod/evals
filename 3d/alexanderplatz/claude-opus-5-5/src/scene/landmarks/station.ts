import * as THREE from 'three';
import { canvasTexture, roundelTexture, signTexture, viaductTexture } from '../../lib/textures';
import { orientedFrame } from '../../lib/geom';
import { registerNight } from '../night';
import { DECK_Y, heavyRailEdges } from '../streets';
import { footprint, frameToWorld, placeOnFrame, shadowed, streetFrom, type Landmark } from './common';

// Stadtbahn station: brick viaduct base, arched hall windows and the glazed
// barrel-vault roof over the elevated platforms. Proportions approximate.
const WALL_TOP = 16;

function hallWallTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9c4f37';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(55,22,12,0.25)';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
      for (let x = (y / 3) % 2 ? 0 : 3; x < w; x += 6) ctx.fillRect(x, y, 1, 3);
    }
    // Two tall round-arched windows per 10 m bay.
    for (const cx of [w * 0.27, w * 0.73]) {
      const ww = w * 0.3, top = h * 0.18;
      ctx.fillStyle = '#c9b9a2';
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2 - 4, h * 0.95); ctx.lineTo(cx - ww / 2 - 4, top + ww / 2);
      ctx.arc(cx, top + ww / 2, ww / 2 + 4, Math.PI, 0); ctx.lineTo(cx + ww / 2 + 4, h * 0.95); ctx.fill();
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, '#6f8796'); g.addColorStop(1, '#25333c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2, h * 0.93); ctx.lineTo(cx - ww / 2, top + ww / 2);
      ctx.arc(cx, top + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(cx + ww / 2, h * 0.93); ctx.fill();
      ctx.fillStyle = 'rgba(220,225,228,0.8)';
      ctx.fillRect(cx - 1, top, 2, h * 0.75);
      for (let y = top + ww / 2; y < h * 0.93; y += 14) ctx.fillRect(cx - ww / 2, y, ww, 2);
    }
    ctx.fillStyle = '#6e3121';
    ctx.fillRect(0, 0, w, 8);
  });
}

function glassTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3e4a50';
    for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += 21) ctx.fillRect(0, y, w, 2);
  });
}

/** Lateral offsets of the elevated tracks inside the hall, clustered per track. */
function trackOffsets(frame: ReturnType<typeof orientedFrame>): number[] {
  const c = Math.cos(frame.angle), s = Math.sin(frame.angle);
  const vs: number[] = [];
  for (const e of heavyRailEdges) for (let i = 0; i < e.p.length; i += 2) {
    const dx = e.p[i] - frame.center.x, dz = e.p[i + 1] - frame.center.y;
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    if (Math.abs(u) < frame.length * 0.3 && Math.abs(v) < frame.width) vs.push(v);
  }
  vs.sort((a, b) => a - b);
  const tracks: number[][] = [];
  for (const v of vs) {
    const last = tracks.at(-1);
    if (last && v - last.at(-1)! < 2) last.push(v); else tracks.push([v]);
  }
  return tracks.map((t) => t.reduce((a, b) => a + b, 0) / t.length);
}

export function buildStation(): Landmark {
  const fp = footprint('station');
  const frame = orientedFrame(fp.outer[0]);
  const L = frame.length * 0.92;
  const tracks = trackOffsets(frame);
  // Hall spans the tracks with a few metres to spare.
  const vMin = Math.min(...tracks, -10), vMax = Math.max(...tracks, 10);
  const W = vMax - vMin + 12;
  const zMid = (vMin + vMax) / 2;
  const group = new THREE.Group();
  group.name = 'station';
  placeOnFrame(group, frame);
  const body = new THREE.Group();
  body.position.z = zMid;
  group.add(body);

  // Base: brick arches at street level.
  const arch = viaductTexture();
  arch.wrapT = THREE.ClampToEdgeWrapping;
  arch.repeat.set(L / 15, 1);
  const archEnd = arch.clone();
  archEnd.repeat.set(W / 15, 1);
  archEnd.needsUpdate = true;
  const archMat = new THREE.MeshStandardMaterial({ map: arch, roughness: 0.9 });
  const archEndMat = new THREE.MeshStandardMaterial({ map: archEnd, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5b4a42, roughness: 0.9 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6f6a63, roughness: 1 });
  // Slightly below the viaduct deck so the ballast and rails show through.
  const base = new THREE.Mesh(new THREE.BoxGeometry(L, DECK_Y - 0.1, W), [archEndMat, archEndMat, deckMat, deckMat, archMat, archMat]);
  base.position.y = (DECK_Y - 0.1) / 2;
  body.add(base);

  // Upper hall walls with arched windows (open box: long sides only plus end piers).
  const hall = hallWallTexture();
  hall.repeat.set(L / 10, 1);
  hall.wrapT = THREE.ClampToEdgeWrapping;
  const hallMat = new THREE.MeshStandardMaterial({ map: hall, roughness: 0.85, emissive: 0xffdcae, emissiveMap: hall });
  registerNight(hallMat, 0.25, 0);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, WALL_TOP - DECK_Y), hallMat);
    wall.position.set(0, (DECK_Y + WALL_TOP) / 2, side * W / 2);
    wall.rotation.y = side > 0 ? 0 : Math.PI;
    body.add(wall);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.8, 1.2), roofMat);
    cornice.position.set(0, WALL_TOP, side * W / 2);
    body.add(cornice);
  }
  // Inner faces so the walls read from inside the hall.
  const inner = new THREE.MeshStandardMaterial({ color: 0x8a4a35, roughness: 0.9, side: THREE.BackSide });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, WALL_TOP - DECK_Y), inner);
    wall.position.set(0, (DECK_Y + WALL_TOP) / 2, side * (W / 2 - 0.05));
    wall.rotation.y = side > 0 ? 0 : Math.PI;
    body.add(wall);
  }

  // Glazed barrel vault with steel ribs.
  const rise = W * 0.32;
  const glassTex = glassTexture();
  glassTex.repeat.set(L / 6, 6);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc0cc, map: glassTex, transparent: true, opacity: 0.5, roughness: 0.08, metalness: 0.3,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4,
  });
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, L, 40, 1, true, 0, Math.PI), glass);
  vault.rotation.z = Math.PI / 2;
  vault.scale.set(rise / (W / 2), 1, 1);
  vault.position.y = WALL_TOP;
  vault.renderOrder = 2;
  body.add(vault);
  const steel = new THREE.MeshStandardMaterial({ color: 0x55636a, roughness: 0.5, metalness: 0.6 });
  const ribGeo = new THREE.TorusGeometry(W / 2, 0.22, 5, 32, Math.PI);
  for (let x = -L / 2; x <= L / 2 + 0.01; x += L / Math.round(L / 7.5)) {
    const rib = new THREE.Mesh(ribGeo, steel);
    rib.rotation.y = Math.PI / 2;
    rib.scale.set(1, rise / (W / 2), 1);
    rib.position.set(x, WALL_TOP, 0);
    body.add(rib);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6, 1.4), steel);
  ridge.position.y = WALL_TOP + rise;
  body.add(ridge);

  // Glazed end lunettes and the upper end walls.
  const lunetteTex = glassTexture();
  lunetteTex.repeat.set(W / 4, 3);
  const lunetteMat = new THREE.MeshStandardMaterial({ color: 0x86a6b3, map: lunetteTex, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide, emissive: 0xffe2b8 });
  registerNight(lunetteMat, 0.35, 0);
  for (const side of [-1, 1]) {
    const lunette = new THREE.Mesh(new THREE.CircleGeometry(W / 2, 32, 0, Math.PI), lunetteMat);
    lunette.scale.y = rise / (W / 2);
    lunette.position.set(side * L / 2, WALL_TOP, 0);
    lunette.rotation.y = side * Math.PI / 2;
    body.add(lunette);
    const endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, WALL_TOP - DECK_Y), lunetteMat);
    endWall.position.set(side * L / 2, (DECK_Y + WALL_TOP) / 2, 0);
    endWall.rotation.y = side * Math.PI / 2;
    body.add(endWall);
  }

  // Island platforms in the gaps between tracks.
  const platformMat = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3e5a4c, roughness: 0.6, metalness: 0.3 });
  for (let i = 0; i < tracks.length - 1; i++) {
    const gap = tracks[i + 1] - tracks[i];
    if (gap < 6 || gap > 16) continue;
    const width = gap - 3.3;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, 0.95, width), platformMat);
    platform.position.set(0, DECK_Y + 0.48, (tracks[i] + tracks[i + 1]) / 2 - zMid);
    body.add(platform);
    for (let x = -L * 0.4; x <= L * 0.4; x += 18) {
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 1.2), canopyMat);
      kiosk.position.set(x, DECK_Y + 2.25, platform.position.z);
      body.add(kiosk);
    }
  }

  // Station name boards with S-Bahn and U-Bahn roundels on both long sides.
  const name = signTexture('Alexanderplatz', { bg: '#0f3d2e', fg: '#ffffff', height: 128 });
  const nameMat = new THREE.MeshStandardMaterial({ map: name.texture, emissiveMap: name.texture, emissive: 0xffffff, roughness: 0.6 });
  registerNight(nameMat, 1.3, 0.1);
  const sMat = new THREE.MeshStandardMaterial({ map: roundelTexture('S'), transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: roundelTexture('S') });
  const uMat = new THREE.MeshStandardMaterial({ map: roundelTexture('U'), transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: roundelTexture('U') });
  registerNight(sMat, 1, 0.05);
  registerNight(uMat, 1, 0.05);
  const boardH = 2.2;
  for (const side of [-1, 1]) {
    for (const x of [-L * 0.22, L * 0.22]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(boardH * name.aspect, boardH), nameMat);
      board.position.set(x, DECK_Y + 2.2, side * (W / 2 + 0.08));
      board.rotation.y = side > 0 ? 0 : Math.PI;
      body.add(board);
      for (const [k, mat] of [[0, sMat], [1, uMat]] as const) {
        const roundel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), mat);
        const off = (boardH * name.aspect) / 2 + 1.8 + k * 3;
        roundel.position.set(x + (side > 0 ? off : -off), DECK_Y + 2.2, side * (W / 2 + 0.08));
        roundel.rotation.y = board.rotation.y;
        body.add(roundel);
      }
    }
  }
  shadowed(group);
  vault.castShadow = false;
  vault.receiveShadow = false;

  const c = frameToWorld(frame, 0, zMid);
  return {
    key: 'station',
    name: 'Bahnhof Alexanderplatz',
    detail: 'S+U · 1882',
    object: group,
    labelAt: new THREE.Vector3(c.x, WALL_TOP + rise + 3, c.y),
    view: { focus: new THREE.Vector3(c.x, 12, c.y), distance: 210, bearing: 45, elevation: 24, street: { from: streetFrom(c, 60, 75), lookAt: new THREE.Vector3(c.x, 14, c.y) } },
  };
}
