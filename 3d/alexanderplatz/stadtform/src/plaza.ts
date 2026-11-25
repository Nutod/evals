import * as T from 'three';
import {
  canvasTexture,
  MeshBuilder,
  osm,
  pointInRing,
  textSign,
  toRing,
  xf,
  type P2,
  type V3,
} from './district';

/** Repeated facade bays on the two buildings facing the square. The dimensions come from each OSM ring. */
function shopBay(departmentStore: boolean) {
  const texture = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = departmentStore ? '#d3c9ad' : '#d6cfc0';
    g.fillRect(0, 0, w, h);
    const floors = departmentStore ? 4 : 6;
    const floorH = (h - 98) / floors;
    for (let i = 0; i < floors; i++) {
      const y = i * floorH + 8;
      const glass = g.createLinearGradient(0, y, 0, y + floorH * 0.68);
      glass.addColorStop(0, '#455864');
      glass.addColorStop(0.45, '#91a2a4');
      glass.addColorStop(1, '#4d6065');
      const margin = departmentStore ? 29 : 3;
      g.fillStyle = glass;
      g.fillRect(margin, y, w - margin * 2, floorH * 0.68);
      g.fillStyle = '#d3d4c8';
      for (let col = 1; col < 4; col++)
        g.fillRect(margin + (col * (w - margin * 2)) / 4, y, 4, floorH * 0.68);
      g.fillStyle = '#9b9b8d';
      g.fillRect(0, y + floorH * 0.68, w, 4);
      g.fillStyle = '#ece6d6';
      g.fillRect(0, y - 4, w, 3);
      if (departmentStore) {
        g.fillStyle = '#b2ab97';
        g.fillRect(12, y - 4, 5, floorH);
        g.fillRect(w - 18, y - 4, 4, floorH);
      }
    }
    g.fillStyle = '#5e6461';
    g.fillRect(0, h - 95, w, 10);
    g.fillStyle = '#616c6a';
    g.fillRect(8, h - 80, w - 16, 77);
    const shop = g.createLinearGradient(0, h - 80, 0, h);
    shop.addColorStop(0, '#536767');
    shop.addColorStop(0.58, '#768383');
    shop.addColorStop(1, '#454d4b');
    g.fillStyle = shop;
    g.fillRect(14, h - 75, w - 28, 69);
    g.fillStyle = '#c0b8a5';
    g.fillRect(126, h - 80, 4, 80);
  });
  return new T.MeshStandardMaterial({ map: texture, roughness: 0.72, side: T.DoubleSide });
}

function frontages(group: T.Group) {
  for (const name of ['Galeria', 'Berolinahaus']) {
    const building = osm.buildings.find((b) => b.n === name);
    if (!building) continue;
    const walls = new MeshBuilder(),
      trim = new MeshBuilder();
    const ring = toRing(building.p),
      h = building.h;
    const store = name === 'Galeria';
    const sign = textSign(store ? 'G A L E R I A' : 'BEROLINAHAUS', {
      bg: store ? '#293b3e' : '#d3ccbb',
      fg: store ? '#f3eed9' : '#414b48',
      px: 96,
      weight: 600,
      pad: 0.16,
    });
    const lettering = new T.MeshStandardMaterial({ map: sign.texture, roughness: 0.68, side: T.DoubleSide });
    for (let i = 0; i < ring.length; i++) {
      const [x, z] = ring[i],
        [qx, qz] = ring[(i + 1) % ring.length];
      const dx = qx - x,
        dz = qz - z,
        len = Math.hypot(dx, dz);
      const nx = dz / len,
        nz = -dx / len;
      const at = (t: number, y: number, offset = 0.17): V3 => [
        x + dx * t + nx * offset,
        y,
        z + dz * t + nz * offset,
      ];
      const bays = Math.max(1, Math.round(len / (store ? 6.2 : 5.1)));
      walls.quad(at(1, 0.12), at(0, 0.12), at(0, h - 0.15), at(1, h - 0.15), 0xffffff, [0, 0, bays, 1]);
      const yaw = Math.atan2(-dz, dx);
      for (const y of [4.8, h - 0.3]) trim.box(len, 0.48, 0.55, xf(...at(0.5, y, 0.24), yaw), 0xbcb7a4);
      if (len > (store ? 72 : 68)) {
        const y = store ? h - 6.2 : h - 2.8,
          half = (store ? 12 : 8) / len;
        const signFace = new MeshBuilder();
        signFace.quad(
          at(0.5 + half, y, 0.56),
          at(0.5 - half, y, 0.56),
          at(0.5 - half, y + (store ? 3.2 : 1.3), 0.56),
          at(0.5 + half, y + (store ? 3.2 : 1.3), 0.56),
          0xffffff,
        );
        group.add(signFace.mesh(lettering, 'receive'));
      }
    }
    group.add(walls.mesh(shopBay(store)), trim.mesh(new T.MeshStandardMaterial({ vertexColors: true })));
  }
}

/** Lattice crane and site cabins, positioned in the mapped construction yard. */
function construction(group: T.Group, blocked: (x: number, z: number) => boolean) {
  const yard = osm.areas.find((a) => a.n === 'Alexander Tower');
  if (!yard) return;
  const ring = toRing(yard.p);
  let spot: P2 | undefined;
  for (const [x, z] of ring) {
    const p: P2 = [x * 0.78 + 256 * 0.22, z * 0.78 + 105 * 0.22];
    if (pointInRing(...p, ring) && !blocked(...p)) {
      spot = p;
      break;
    }
  }
  if (!spot) return;
  const beams = new MeshBuilder(),
    gold = 0xd9a537,
    iron = 0x5d625c;
  const rodGeometry = new T.BoxGeometry(1, 1, 1);
  const up = new T.Vector3(0, 1, 0);
  function rod(a: V3, b: V3, w: number, color = gold) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b);
    const d = end.clone().sub(start),
      q = new T.Quaternion().setFromUnitVectors(up, d.clone().normalize());
    beams.add(
      rodGeometry,
      new T.Matrix4().compose(start.lerp(end, 0.5), q, new T.Vector3(w, d.length(), w)),
      color,
    );
  }
  const H = 76;
  for (const i of [-1, 1]) {
    for (const j of [-1, 1]) rod([i, 1, j], [i, H, j], 0.23);
    for (let y = 2; y < H - 3; y += 4) {
      rod([i, y, -1], [i, y + 4, 1], 0.15);
      rod([-1, y, i], [1, y + 4, i], 0.15);
      rod([i, y, -1], [i, y, 1], 0.14);
      rod([-1, y, i], [1, y, i], 0.14);
    }
    rod([-12, H, i], [43, H, i], 0.24);
  }
  rod([-12, H + 2.8, 0], [43, H + 2.8, 0], 0.24);
  for (let x = -12; x < 42; x += 3) for (const side of [-1, 1]) rod([x, H, side], [x + 3, H + 2.8, 0], 0.17);
  rod([0, H, 0], [0, H + 9, 0], 0.45);
  rod([-11, H + 2.8, 0], [0, H + 9, 0], 0.13, iron);
  rod([0, H + 9, 0], [32, H + 2.8, 0], 0.13, iron);
  rod([28, H, 0], [28, H - 25, 0], 0.09, iron);
  beams.box(0.65, 0.65, 1, xf(28, H - 25, 0), iron);
  beams.box(3, 2.3, 2.7, xf(-10, H + 1.2, 0), 0x989780);
  beams.box(2.2, 2, 2.4, xf(1, H - 1.1, 1.2), 0xdacdad);
  beams.box(1.8, 1.22, 0.12, xf(1, H - 0.95, 2.43), 0x455960);
  beams.box(5, 1.3, 5, xf(0, 0.7, 0), 0xb7b0a1);
  const mesh = beams.mesh(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  mesh.position.set(spot[0], 0, spot[1]);
  mesh.rotation.y = -0.34;
  group.add(mesh);
}

export function detailPlaza(group: T.Group, blocked: (x: number, z: number) => boolean) {
  frontages(group);
  construction(group, blocked);
}
