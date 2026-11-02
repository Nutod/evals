import * as THREE from "three";
import { seeded, ignitionAt, smooth, damageAt } from "../state.js";
import { landY, riverX, roadX, eastPathX, BRIDGES } from "./terrain.js";
import {
  mesh,
  instance,
  setInstance,
  box,
  cone,
  sphere,
  cylinder,
  roofGeometry,
  archShape,
  batchStatic,
} from "./helpers.js";

export const MARKET = { x: -37, z: 76 };
const roofColors = [
  "#9b6148",
  "#a66c4c",
  "#775447",
  "#697b75",
  "#536c6d",
  "#89715a",
  "#b47c54",
];

export function clearsBankPaths(b) {
  const halfX =
    (b.w * Math.abs(Math.cos(b.r)) + b.d * Math.abs(Math.sin(b.r))) / 2 + 3;
  const halfZ =
    (b.d * Math.abs(Math.cos(b.r)) + b.w * Math.abs(Math.sin(b.r))) / 2 + 3;
  for (let dz = -halfZ; dz <= halfZ + 0.25; dz += 0.25) {
    const z = b.z + Math.min(dz, halfZ);
    if ([roadX, eastPathX].some((path) => Math.abs(b.x - path(z)) < halfX))
      return false;
  }
  return true;
}

export function createTown(scene, mat, uniforms) {
  const random = seeded(841),
    group = new THREE.Group();
  scene.add(group);
  const buildings = [];
  for (let row = 0; row < 24; row++)
    for (let col = 0; col < 27; col++) {
      const z = -8 + row * 6.8 + (random() - 0.5) * 2.8,
        x = -95 + col * 7.2 + (random() - 0.5) * 3;
      if (
        Math.pow(x / 104, 2) + Math.pow((z - 77) / 103, 2) > 1.08 ||
        Math.abs(x - riverX(z)) < 10 ||
        Math.abs(x - roadX(z)) < 4.8 ||
        Math.abs(x - eastPathX(z)) < 4.8
      )
        continue;
      if (
        Math.hypot((x - MARKET.x) * 1.05, z - MARKET.z) < 18.5 ||
        BRIDGES.some(
          ([s, width]) =>
            Math.abs(z - s) < 3 ||
            (Math.abs(z - s) < 5 && Math.abs(x - riverX(s)) < width / 2 + 7),
        )
      )
        continue;
      if (
        [
          [-37, 15],
          [47, 64],
          [-53, 116],
        ].some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 9)
      )
        continue;
      if (random() < 0.075) continue;
      const w = 3.9 + random() * 2.4,
        d = 3.6 + random() * 2.1,
        h = 3.8 + random() * 4.4;
      const building = {
        x,
        z,
        y: landY(x, z),
        w,
        d,
        h,
        rh: w * (0.4 + random() * 0.12),
        r: (random() - 0.5) * 0.22,
        tint: roofColors[Math.floor(random() * roofColors.length)],
        ignition: ignitionAt(x, z, random()),
      };
      if (clearsBankPaths(building)) buildings.push(building);
    }
  const wallsG = box.clone(),
    roofG = roofGeometry();
  const ignitions = new THREE.InstancedBufferAttribute(
    new Float32Array(buildings.map((b) => b.ignition)),
    1,
  );
  wallsG.setAttribute("aIgnition", ignitions);
  roofG.setAttribute("aIgnition", ignitions);
  const walls = instance(wallsG, mat.walls, buildings.length, group),
    roofs = instance(roofG, mat.roof, buildings.length, group);
  roofs.customDepthMaterial = mat.roofDepth;
  const details = new THREE.Group();
  group.add(details);
  const windowCount = buildings.length * 18;
  const windows = instance(box, mat.black, windowCount, details, false),
    frames = instance(box, mat.timber, windowCount * 2, details, false);
  const courses = instance(box, mat.stone, buildings.length * 5, details);
  const chimneys = instance(box, mat.darkStone, buildings.length * 2, group);
  const pots = instance(cylinder, mat.timber, buildings.length * 2, details);
  const beams = instance(box, mat.timber, buildings.length * 4, details);
  const chimneysData = [],
    detailMatrices = [];
  let wi = 0,
    fi = 0,
    ci = 0,
    bi = 0;
  function point(b, x, y, z) {
    return [
      b.x + x * Math.cos(b.r) + z * Math.sin(b.r),
      b.y + y,
      b.z - x * Math.sin(b.r) + z * Math.cos(b.r),
    ];
  }
  buildings.forEach((b, i) => {
    setInstance(
      walls,
      i,
      b.x,
      b.y + b.h / 2,
      b.z,
      b.w,
      b.h,
      b.d,
      b.r,
      new THREE.Color().setHSL(0.105, 0.16, 0.64 + random() * 0.17),
    );
    setInstance(
      roofs,
      i,
      b.x,
      b.y + b.h,
      b.z,
      b.w + 0.65,
      b.rh,
      b.d + 0.7,
      b.r,
      b.tint,
    );
    for (let k = 0; k < 2; k++) {
      const p = point(
        b,
        b.w * (0.16 + k * 0.15),
        b.h + b.rh * 0.52,
        (k - 0.6) * b.d * 0.5,
      );
      chimneysData.push({ p, b, i: i * 2 + k });
      setInstance(chimneys, i * 2 + k, ...p, 0.55, 2, 0.6, b.r);
      setInstance(pots, i * 2 + k, p[0], p[1] + 1.1, p[2], 0.2, 0.7, 0.2, b.r);
    }
    for (let k = 0; k < 5; k++) {
      const p = point(
        b,
        0,
        k === 0 ? 0.25 : k === 4 ? b.h - 0.15 : (b.h * k) / 4,
        0,
      );
      setInstance(
        courses,
        ci++,
        ...p,
        b.w + 0.12,
        k === 0 ? 0.5 : 0.13,
        b.d + 0.12,
        b.r,
      );
    }
    for (let side = 0; side < 2; side++)
      for (let floor = 0; floor < 3; floor++)
        for (let col = 0; col < 3; col++) {
          const px = (col - 1) * b.w * 0.29,
            py = 1.1 + (floor * (b.h - 1.6)) / 2,
            pz = (side ? -1 : 1) * (b.d / 2 + 0.024),
            p = point(b, px, py, pz);
          setInstance(windows, wi++, ...p, 0.57, 0.9, 0.055, b.r);
          setInstance(
            frames,
            fi++,
            p[0],
            p[1] - 0.48,
            p[2],
            0.82,
            0.1,
            0.19,
            b.r,
          );
          setInstance(
            frames,
            fi++,
            p[0],
            p[1] + 0.03,
            p[2] + 0.035,
            0.045,
            0.91,
            0.1,
            b.r,
          );
        }
    for (let side = 0; side < 2; side++)
      for (let k = 0; k < 2; k++) {
        const p = point(
          b,
          (k ? -1 : 1) * b.w * 0.46,
          b.h * 0.5,
          (side ? -1 : 1) * (b.d / 2 + 0.06),
        );
        setInstance(beams, bi++, ...p, 0.14, b.h, 0.14, b.r);
      }
  });
  windows.count = wi;
  frames.count = fi;

  const terrace = instance(box, mat.stone, 42, group);
  for (let i = 0; i < 42; i++) {
    const side = i % 2 ? 1 : -1,
      z = -5 + Math.floor(i / 2) * 8,
      x = riverX(z) + side * 7.8;
    setInstance(
      terrace,
      i,
      x,
      4.7,
      z,
      2.1,
      Math.max(2, landY(x, z) - 2),
      7.9,
      0.03 * Math.cos(z),
    );
  }
  for (const [z, width, y] of BRIDGES)
    buildBridge(group, mat, riverX(z), z, width, y);
  const bells = [];
  for (const [x, z, h] of [
    [-37, 15, 25],
    [47, 64, 30],
    [-53, 116, 22],
  ])
    bells.push(buildTower(group, mat, x, z, h));
  const gate = buildGate(group, mat);
  const market = createMarket(group, mat, uniforms, random);

  const props = new THREE.Group();
  details.add(props);
  const barrels = instance(cylinder, mat.timber, 320, props),
    hoops = instance(cylinder, mat.bronze, 640, props, false),
    crates = instance(box, mat.timber, 420, props);
  for (let i = 0; i < 320; i++) {
    const b = buildings[i % buildings.length],
      x = b.x + b.w * 0.6,
      z = b.z + random() * 2,
      y = landY(x, z),
      s = 0.3 + random() * 0.16;
    setInstance(barrels, i, x, y + 0.5, z, s, 0.95, s);
    for (let k = 0; k < 2; k++)
      setInstance(
        hoops,
        i * 2 + k,
        x,
        y + 0.25 + k * 0.5,
        z,
        s + 0.015,
        0.055,
        s + 0.015,
      );
  }
  for (let i = 0; i < 420; i++) {
    const b = buildings[i % buildings.length],
      x = b.x - b.w * 0.58,
      z = b.z + (random() - 0.5) * 2;
    setInstance(
      crates,
      i,
      x,
      landY(x, z) + 0.3,
      z,
      0.5 + random() * 0.4,
      0.6,
      0.55,
      random(),
    );
  }
  const laundry = instance(box, mat.canvas, 180, details, false);
  for (let i = 0; i < 180; i++) {
    const b = buildings[i % buildings.length];
    setInstance(
      laundry,
      i,
      b.x + b.w * 0.5 + 0.8,
      b.y + b.h * 0.55,
      b.z,
      0.65,
      0.7,
      0.04,
      random(),
      ["#d8c9a7", "#6a8191", "#a76b56"][i % 3],
    );
  }

  batchStatic(group);
  return {
    buildings,
    market,
    gate,
    update(day, time, budget, camera) {
      const distance = camera.position.distanceTo(new THREE.Vector3(0, 8, 70));
      details.visible = distance < budget.detailDistance + 200;
      props.visible = distance < budget.detailDistance + 20;
      pots.visible = distance < budget.detailDistance + 100;
      bells.forEach((bell, i) => {
        bell.rotation.z =
          Math.sin(time * (day.alarm > 0.5 ? 7 : 1.7) + i) *
          (day.night > 0.5 ? 0 : 0.12 + day.alarm * 0.6);
      });
      gate.doors.forEach((d, i) => {
        d.rotation.y = (i ? -1 : 1) * (1 - day.gate) * 1.35;
      });
      gate.glow.material.opacity = 0.002 + day.fire * 0.8 + day.night * 0.5;
      gate.light.intensity = 35 + day.fire * 1100 + day.night * 700;
      market.update(day, time);
      chimneysData.forEach(({ p, b, i }) => {
        const burn = damageAt(day.value, b.ignition);
        setInstance(
          chimneys,
          i,
          p[0],
          p[1] - burn * 0.6,
          p[2],
          0.55,
          2 - burn * 0.6,
          0.6,
          b.r,
        );
      });
      chimneys.instanceMatrix.needsUpdate = true;
      laundry.visible = day.value < 2.8;
    },
  };
}

function buildBridge(parent, mat, x, z, width, y) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, y);
  s.lineTo(width / 2, y);
  s.lineTo(width / 2, 0);
  s.lineTo(width * 0.31, 0);
  s.quadraticCurveTo(width * 0.27, y * 0.78, 0, y * 0.78);
  s.quadraticCurveTo(-width * 0.27, y * 0.78, -width * 0.31, 0);
  s.lineTo(-width / 2, 0);
  const arch = mesh(
    new THREE.ExtrudeGeometry(s, {
      depth: 3.3,
      bevelEnabled: false,
      curveSegments: 16,
    }),
    mat.pale,
    parent,
    [x, 0, z - 1.65],
  );
  for (const side of [-1, 1]) {
    mesh(
      box,
      mat.stone,
      parent,
      [x, y + 0.55, z + side * 1.8],
      [width + 1, 0.9, 0.5],
    );
    for (let i = 0; i < 19; i++)
      mesh(
        box,
        mat.pale,
        parent,
        [x - width / 2 + (i * width) / 18, y + 1.1, z + side * 1.8],
        [0.45, 0.45, 0.65],
      );
  }
  return arch;
}

function buildTower(parent, mat, x, z, h) {
  const g = new THREE.Group();
  g.position.set(x, landY(x, z), z);
  parent.add(g);
  mesh(box, mat.pale, g, [0, h * 0.42, 0], [5.3, h * 0.84, 5.3]);
  for (let i = 0; i < 5; i++)
    mesh(box, mat.stone, g, [0, i * h * 0.17 + 0.4, 0], [5.6, 0.3, 5.6]);
  for (let side = 0; side < 4; side++) {
    const r = (side * Math.PI) / 2;
    for (let k = 0; k < 3; k++) {
      const w = mesh(
        new THREE.ShapeGeometry(archShape(0.8, 2.2)),
        mat.black,
        g,
        [Math.sin(r) * 2.66, 3 + k * h * 0.17, Math.cos(r) * 2.66],
      );
      w.rotation.y = r;
    }
  }
  for (const xx of [-2, 2])
    for (const zz of [-2, 2]) {
      mesh(box, mat.pale, g, [xx, h - 2, zz], [0.75, 5.4, 0.75]);
      mesh(
        cone,
        mat.roof.clone(),
        g,
        [xx, h + 1.5, zz],
        [0.9, 2.5, 0.9],
      ).material.color.set("#5f7470");
    }
  mesh(box, mat.stone, g, [0, h + 0.4, 0], [5.3, 0.7, 5.3]);
  const cap = mesh(new THREE.ConeGeometry(4, 5.4, 4), mat.darkStone, g, [
    0,
    h + 3.4,
    0,
  ]);
  cap.rotation.y = Math.PI / 4;
  mesh(cylinder, mat.bronze, g, [0, h + 6.7, 0], [0.06, 1.4, 0.06]);
  const bell = new THREE.Group();
  bell.position.set(0, h - 0.5, 0);
  g.add(bell);
  bell.userData.dynamic = true;
  const profile = [
    new THREE.Vector2(0, 0.6),
    new THREE.Vector2(0.3, 0.6),
    new THREE.Vector2(0.5, 0.3),
    new THREE.Vector2(0.65, -0.6),
    new THREE.Vector2(1, -1.05),
    new THREE.Vector2(1.05, -1.2),
    new THREE.Vector2(0.85, -1.3),
  ];
  mesh(new THREE.LatheGeometry(profile, 16), mat.bronze, bell);
  mesh(sphere, mat.bronze, bell, [0, -1.25, 0], [0.19, 0.26, 0.19]);
  return bell;
}

function buildGate(parent, mat) {
  const g = new THREE.Group();
  g.position.set(0, 9, -35);
  parent.add(g);
  const cliffMaterial = mat.rock.clone();
  cliffMaterial.vertexColors = false;
  cliffMaterial.color.set("#8b9082");
  const cliff = mesh(
    new THREE.IcosahedronGeometry(1, 1),
    cliffMaterial,
    g,
    [0, 17, -22],
    [35, 29, 15],
  );
  cliff.rotation.z = 0.1;
  mesh(new THREE.ShapeGeometry(archShape(15, 30)), mat.black, g, [0, 0, -6]);
  mesh(box, mat.darkStone, g, [0, -0.2, -0.7], [14, 0.4, 12]);
  for (let i = 0; i < 4; i++)
    for (const side of [-1, 1]) {
      mesh(
        box,
        mat.darkStone,
        g,
        [side * (5.8 - i * 0.3), 12, 3.7 - i * 2.5],
        [0.7, 24, 0.7],
      );
      mesh(
        box,
        mat.stone,
        g,
        [side * (5.8 - i * 0.3), 23, 3.7 - i * 2.5],
        [1.5, 0.5, 1.5],
      );
      mesh(
        sphere,
        mat.lamp,
        g,
        [side * (5.4 - i * 0.3), 9, 3.8 - i * 2.5],
        [0.12, 0.28, 0.12],
      );
    }
  const outline = archShape(20, 35),
    hole = new THREE.Path(archShape(15, 30).getPoints());
  outline.holes.push(hole);
  mesh(
    new THREE.ExtrudeGeometry(outline, {
      depth: 3,
      bevelEnabled: true,
      bevelSize: 0.22,
      bevelThickness: 0.2,
      bevelSegments: 1,
    }),
    mat.darkStone,
    g,
    [0, 0, 4.2],
  );
  for (const side of [-1, 1]) {
    mesh(box, mat.stone, g, [side * 11.5, 16, 1], [4, 33, 5]);
    mesh(box, mat.darkStone, g, [side * 11.5, 34, 1], [6, 2, 7]);
    for (let i = 0; i < 8; i++)
      mesh(
        box,
        mat.bronze,
        g,
        [side * 11.5, i * 3.5 + 3, 3.53],
        [2.5, 0.1, 0.08],
      );
    for (let i = 0; i < 9; i++) {
      const rune = mesh(
        box,
        mat.darkStone,
        g,
        [side * 11.5, 4 + i * 3.1, 3.56],
        [0.8, 0.8, 0.045],
      );
      rune.rotation.z = Math.PI / 4;
    }
    const statue = new THREE.Group();
    statue.position.set(side * 14, 0, 4);
    g.add(statue);
    mesh(box, mat.darkStone, statue, [0, 12.5, 0], [4.7, 12, 3.6]);
    mesh(box, mat.stone, statue, [0, 3.8, 0], [6.1, 7.5, 5.5]);
    mesh(
      new THREE.IcosahedronGeometry(1, 1),
      mat.stone,
      statue,
      [0, 22, 0.1],
      [3.1, 3.6, 2.4],
    );
    mesh(cone, mat.darkStone, statue, [0, 25.5, 0], [3.6, 4.2, 3]);
    const beard = mesh(cone, mat.stone, statue, [0, 16.6, 2], [2.4, 7, 1.2]);
    beard.rotation.z = Math.PI;
    for (let i = 0; i < 7; i++) {
      const braid = mesh(
        cone,
        mat.darkStone,
        statue,
        [(i - 3) * 0.55, 17, 2.9],
        [0.2, 6.1 - Math.abs(i - 3) * 0.6, 0.17],
      );
      braid.rotation.z = Math.PI;
    }
    for (const s of [-1, 1]) {
      mesh(box, mat.black, statue, [s * 0.8, 22.4, 2.3], [0.65, 0.18, 0.1]);
      mesh(box, mat.stone, statue, [s * 0.8, 23, 2.3], [1.1, 0.5, 0.4]);
    }
    for (const s of [-1, 1]) {
      mesh(box, mat.darkStone, statue, [s * 3, 13, 0], [1.8, 10, 2.1]);
      mesh(box, mat.stone, statue, [s * 1.8, 5, 1], [2.1, 8, 2.8]);
    }
    mesh(box, mat.bronze, statue, [side * 3, 12, 3], [0.45, 22, 0.5]);
    const axe = mesh(
      box,
      mat.darkStone,
      statue,
      [side * 3, 22, 3],
      [5, 3.3, 0.6],
    );
    axe.rotation.z = side * 0.4;
  }
  const doors = [];
  for (let side = 0; side < 2; side++) {
    const d = new THREE.Group();
    d.position.set(side ? 7.5 : -7.5, 0, 4.4);
    g.add(d);
    d.userData.dynamic = true;
    const sign = side ? -1 : 1;
    mesh(box, mat.bronze, d, [sign * 3.65, 12, 0], [7.3, 24, 0.6]);
    for (let k = 0; k < 7; k++)
      mesh(
        box,
        mat.darkStone,
        d,
        [sign * 3.65, k * 3.3 + 1, 0.35],
        [7, 0.25, 0.2],
      );
    for (let k = 0; k < 3; k++) {
      const ornament = mesh(
        box,
        mat.stone,
        d,
        [sign * 3.65, k * 7 + 5, 0.5],
        [3.5, 3.5, 0.1],
      );
      ornament.rotation.z = Math.PI / 4;
    }
    doors.push(d);
  }
  for (let i = 0; i < 7; i++) {
    mesh(
      box,
      mat.darkStone,
      g,
      [0, i * 0.45, 4.16 + i * 0.012],
      [12 - i, 0.4, 0.08],
    );
    for (const s of [-1, 1])
      mesh(
        sphere,
        mat.lamp,
        g,
        [s * (6 - i * 0.65), 6 + i * 0.4, 4.25 + i * 0.012],
        [0.12, 0.27, 0.08],
      );
  }
  const glow = mesh(
    new THREE.ShapeGeometry(archShape(14.5, 29)),
    new THREE.MeshBasicMaterial({
      color: "#ff791b",
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    g,
    [0, 0, 7.4],
  );
  glow.userData.dynamic = true;
  const light = new THREE.PointLight("#ff7c24", 0, 95, 1.4);
  light.position.set(0, 16, 12);
  g.add(light);
  for (let i = 0; i < 10; i++)
    mesh(
      box,
      mat.stone,
      g,
      [0, -i * 0.25, 5 + i * 1.5],
      [30 + i * 0.5, 0.35, 1.6],
    );
  return { doors, glow, light };
}

function createMarket(parent, mat, uniforms, random) {
  const group = new THREE.Group();
  parent.add(group);
  const y = landY(MARKET.x, MARKET.z);
  const paving = mesh(
    new THREE.CylinderGeometry(19, 19.3, 0.3, 48),
    mat.stone,
    group,
    [MARKET.x, y + 0.05, MARKET.z],
  );
  mesh(
    cylinder,
    mat.pale,
    group,
    [MARKET.x, y + 0.7, MARKET.z],
    [2.3, 1.3, 2.3],
  );
  mesh(
    cylinder,
    mat.darkStone,
    group,
    [MARKET.x, y + 2, MARKET.z],
    [0.35, 2.8, 0.35],
  );
  mesh(
    sphere,
    mat.bronze,
    group,
    [MARKET.x, y + 3.6, MARKET.z],
    [0.65, 0.65, 0.65],
  );
  const roofs = [],
    stallData = [],
    colors = ["#a44e3e", "#526d74", "#b49a50", "#73845e"];
  const produce = instance(sphere, mat.cloth, 1350, group, false);
  let pi = 0;
  for (let i = 0; i < 36; i++) {
    const angle = (i / 18) * Math.PI * 2,
      radius = i < 18 ? 14.5 : 8.8,
      x = MARKET.x + Math.cos(angle) * radius,
      z = MARKET.z + Math.sin(angle) * radius,
      sy = y + 0.1;
    const stall = new THREE.Group();
    stall.position.set(x, sy, z);
    stall.rotation.y = -angle;
    group.add(stall);
    mesh(box, mat.timber, stall, [0, 0.9, 0], [2.6, 0.25, 1.6]);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        mesh(
          box,
          mat.timber,
          stall,
          [sx * 1.35, 1.5, sz * 0.85],
          [0.08, 3.2, 0.08],
        );
    const canvas = new THREE.PlaneGeometry(3.2, 2.5, 12, 8);
    canvas.rotateX(-Math.PI / 2);
    const cm = mat.canvas.clone();
    cm.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.time;
      shader.uniforms.uDay = uniforms.day;
      shader.vertexShader =
        `uniform float uTime; uniform float uDay; varying vec2 vCanvas;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvCanvas=uv; transformed.y += abs(position.x)*-.15 + sin(position.x*3. + uTime*(2.+uDay))* (.04+smoothstep(.2,1.1,uDay)*.2)*(abs(position.x)*.6); transformed.x+=smoothstep(1.8,2.8,uDay)*sin(position.z*7.+uTime*5.)*.3;`,
        );
      shader.fragmentShader =
        `uniform float uDay; varying vec2 vCanvas;\n${shader.fragmentShader}`.replace(
          "#include <color_fragment>",
          `#include <color_fragment>\nfloat stripe=step(.5,fract(vCanvas.x*7.)); diffuseColor.rgb*=mix(vec3(1.),vec3(${new THREE.Color(colors[i % 4]).toArray().join(",")}),stripe); if(uDay>2.25 && vCanvas.x > 1.-smoothstep(2.25,3.,uDay)) discard; diffuseColor.rgb*=1.-smoothstep(2.5,3.1,uDay)*.9;`,
        );
    };
    cm.customProgramCacheKey = () => `striped-canvas-${i % 4}`;
    const roof = mesh(canvas, cm, stall, [0, 3, 0]);
    roofs.push(roof);
    stallData.push(stall);
    const depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.DoubleSide,
    });
    depth.onBeforeCompile = (shader) => {
      cm.onBeforeCompile(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(uDay>2.25 && vCanvas.x>1.-smoothstep(2.25,3.,uDay)) discard;",
      );
    };
    roof.customDepthMaterial = depth;
    roof.userData.dynamic = true;
    for (let j = 0; j < 36; j++) {
      const px = x + (random() - 0.5) * 1.9,
        pz = z + (random() - 0.5);
      setInstance(
        produce,
        pi++,
        px,
        sy + 1.1 + random() * 0.2,
        pz,
        0.1,
        0.12,
        0.1,
        0,
        ["#b5a36a", "#bf6b38", "#6d823d", "#b9a67c"][i % 4],
      );
    }
  }
  produce.count = pi;
  const toy = new THREE.Group();
  toy.position.set(MARKET.x - 6, y + 0.25, MARKET.z + 4);
  group.add(toy);
  toy.userData.dynamic = true;
  mesh(box, mat.timber, toy, [0, 0.6, 0], [0.7, 0.3, 0.25]);
  mesh(box, mat.timber, toy, [0.3, 0.8, 0], [0.15, 0.5, 0.2]);
  for (let k = 0; k < 4; k++)
    mesh(
      sphere,
      mat.bronze,
      toy,
      [(k % 2 ? 1 : -1) * 0.2, 0.25, (k < 2 ? 1 : -1) * 0.2],
      [0.12, 0.12, 0.08],
    );
  const bird = new THREE.Group();
  bird.position.set(MARKET.x - 5, y + 1.7, MARKET.z + 3);
  group.add(bird);
  bird.userData.dynamic = true;
  mesh(sphere, mat.bronze, bird, [0, 0, 0], [0.2, 0.16, 0.35]);
  const wings = [-1, 1].map((side) =>
    mesh(box, mat.bronze, bird, [side * 0.3, 0, 0], [0.5, 0.025, 0.25]),
  );
  return {
    update(day, time) {
      produce.visible = day.value < 2.9;
      toy.position.z =
        MARKET.z +
        4 +
        Math.sin(time * 0.8) * (day.value > 1.7 && day.value < 2.8 ? 2 : 0.2);
      bird.position.y = y + 1.7 + Math.sin(time) * 0.15;
      wings.forEach((w, i) => {
        w.rotation.z = Math.sin(time * 13) * 0.65 * (i ? -1 : 1);
      });
    },
  };
}
