import * as THREE from "three";
import { seeded, mix, smooth } from "../state.js";
import {
  riverX,
  landY,
  roadX,
  eastPathX,
  walkingY,
  BRIDGES,
} from "./terrain.js";
import { MARKET } from "./town.js";
import { joinZFor, evacuationPoint, bridgeExitPoint } from "./routes.js";
import {
  instance,
  setInstance,
  sphere,
  cone,
  box,
  cylinder,
  mesh,
  batchStatic,
} from "./helpers.js";

export function createPopulation(scene, mat, uniforms, buildings) {
  const random = seeded(531),
    group = new THREE.Group();
  scene.add(group);
  const n = 2400,
    people = [];
  const bodies = instance(
    new THREE.CylinderGeometry(0.18, 0.23, 0.55, 6),
    mat.cloth,
    n,
    group,
  );
  const heads = instance(sphere, mat.skin, n, group, false),
    hats = instance(cone, mat.cloth, n, group, false);
  const limbs = instance(box, mat.timber, n * 4, group, false),
    loads = instance(box, mat.timber, n, group, false);
  const lanterns = instance(sphere, mat.lamp, n, group, false);
  for (const moving of [bodies, heads, hats, limbs, loads, lanterns])
    moving.frustumCulled = false;
  const palette = [
    "#715d45",
    "#53636b",
    "#746d46",
    "#995b46",
    "#9a8f70",
    "#424b46",
    "#6f4c46",
  ];
  for (let i = 0; i < n; i++) {
    const role = i % 10;
    const z = random() * 163 - 15;
    let x =
      role < 3
        ? roadX(z) + (random() - 0.5) * 3
        : role === 3
          ? random() > 0.5
            ? eastPathX(z)
            : roadX(z)
          : -91 + random() * 182;
    let pz = z;
    if (role >= 4 && role < 8)
      pz = [20, 55, 88, 140][role - 4] + (random() - 0.5) * 1.4;
    if (role >= 8) {
      const a = random() * Math.PI * 2,
        r = 3 + random() * 14;
      x = MARKET.x + Math.cos(a) * r;
      pz = MARKET.z + Math.sin(a) * r;
    }
    const tint = palette[i % palette.length];
    const refuge = buildings.reduce(
      (closest, b) =>
        Math.hypot(b.x - x, b.z - pz) <
        Math.hypot(closest.x - x, closest.z - pz)
          ? b
          : closest,
      buildings[0],
    );
    people.push({
      x,
      z: pz,
      refuge: { x: refuge.x, z: refuge.z },
      bridge: BRIDGES.find(
        ([bz, width]) =>
          Math.abs(pz - bz) < 1.7 && Math.abs(x - riverX(bz)) < width / 2 + 5,
      )?.[0],
      bank: i % 4 ? -1 : 1,
      homeBank: x > riverX(pz) ? 1 : -1,
      joinZ: joinZFor(
        role >= 4 ? refuge.x : x,
        role >= 4 ? refuge.z : pz,
        i % 4 ? -1 : 1,
      ),
      phase: random() * 6.28,
      speed: 0.3 + random() * 0.6,
      height: i % 3 ? 1.15 : 0.86,
      tint,
      role,
      lane: (random() - 0.5) * 2.4,
      south: (i / n) * 450 + 100,
      dwarf: i % 3 === 0,
    });
    setInstance(bodies, i, 0, -50, 0, 1, 1, 1, 0, tint);
    setInstance(hats, i, 0, -50, 0, 1, 1, 1, 0, i % 8 ? tint : "#a3864b");
  }
  const animals = createAnimals(group, mat, random);
  const birds = createBirds(group, mat, uniforms, random);
  const vignettes = createVignettes(group, mat);
  return {
    update(day, time, budget, camera) {
      const count = budget.people;
      bodies.count =
        heads.count =
        hats.count =
        loads.count =
        lanterns.count =
          count;
      limbs.count = count * 4;
      const close =
        camera.position.distanceTo(new THREE.Vector3(0, 8, 80)) <
        budget.detailDistance + 100;
      limbs.visible = hats.visible = close;
      lanterns.visible = day.evacuation > 0.15;
      for (let i = 0; i < count; i++) {
        const p = people[i],
          walk = time * p.speed,
          evac = day.evacuation;
        let z =
            p.z +
            Math.sin(walk + p.phase) *
              (p.role >= 4 && p.role < 8 ? 0.25 : p.role === 0 ? 10 : 1.8),
          x = p.x + Math.sin(walk * 0.7 + p.phase) * 1.1;
        if (p.role < 3) {
          z = ((p.z + time * p.speed * 1.2 + 20) % 180) - 20;
        }
        if (p.role < 4) {
          z = mix(z, p.z, day.alarm);
          x =
            (p.role === 3 && p.homeBank === 1 ? eastPathX(z) : roadX(z)) +
            p.lane;
        }
        if (p.role >= 4) {
          const shelter = smooth(1.35 + p.speed * 0.15, 2.05, day.value);
          if (p.bridge !== undefined) {
            const exit = bridgeExitPoint(
              x,
              z,
              p.bridge,
              p.refuge.x,
              p.refuge.z,
              shelter,
            );
            x = exit.x;
            z = exit.z;
          } else {
            x = mix(x, p.refuge.x, shelter);
            z = mix(z, p.refuge.z, shelter);
          }
        }
        const south = ((p.south + time * 0.65) % 390) + 190;
        if (evac > 0) {
          const route = evacuationPoint(
            x,
            z,
            p.joinZ,
            south,
            evac,
            p.lane,
            p.bank,
          );
          x = route.x;
          z = route.z;
        }
        const y = walkingY(x, z),
          h = p.height,
          moving = p.role < 2 || day.alarm > 0.3;
        const step = moving
          ? Math.sin(
              time * (day.value > 2 && day.value < 3.3 ? 13 : 6) * p.speed +
                p.phase,
            )
          : Math.sin(time * 0.7 + p.phase) * 0.15;
        const ry =
          evac > 0.5 ? 0 : p.phase + (moving ? Math.sin(walk) * 0.2 : 0);
        const bob = Math.abs(step) * 0.025;
        setInstance(
          bodies,
          i,
          x,
          y + h * 0.59 + bob,
          z,
          p.dwarf ? 1.2 : 0.88,
          h,
          1,
          ry,
        );
        setInstance(heads, i, x, y + h * 0.98 + bob, z, 0.15, 0.17, 0.15, ry);
        setInstance(hats, i, x, y + h * 1.14 + bob, z, 0.18, 0.22, 0.18, ry);
        for (let k = 0; k < 4; k++) {
          const arm = k >= 2,
            side = k % 2 ? 1 : -1,
            dx = side * (arm ? 0.23 : 0.09),
            sy = arm ? 0.32 : 0.4;
          const lx = x + dx * Math.cos(ry),
            lz = z - dx * Math.sin(ry) + step * side * (arm ? -0.08 : 0.12);
          setInstance(
            limbs,
            i * 4 + k,
            lx,
            y + h * (arm ? 0.66 : 0.22),
            lz,
            arm ? 0.08 : 0.1,
            sy * h,
            0.11,
            ry,
          );
        }
        const carrying = i % 7 === 0;
        setInstance(
          loads,
          i,
          x,
          carrying ? y + h * 0.65 : -50,
          z + 0.3,
          0.5,
          0.28,
          0.35,
          ry,
        );
        setInstance(
          lanterns,
          i,
          x + 0.32,
          i % 4 === 0 ? y + 0.72 : -50,
          z + 0.15,
          0.07,
          0.12,
          0.07,
        );
      }
      for (const m of [bodies, heads, hats, limbs, loads, lanterns])
        m.instanceMatrix.needsUpdate = true;
      animals.update(day, time);
      birds.update(day, time);
      vignettes.update(day, time);
    },
  };
}

function createAnimals(parent, mat, random) {
  const count = 74,
    positions = [];
  const body = instance(sphere, mat.timber, count, parent),
    head = instance(box, mat.timber, count, parent),
    legs = instance(box, mat.darkStone, count * 4, parent);
  const packs = instance(box, mat.canvas, count * 2, parent);
  for (const moving of [body, head, legs, packs]) moving.frustumCulled = false;
  for (let i = 0; i < count; i++)
    positions.push({
      z: -15 + (i / count) * 170,
      lane: (random() > 0.5 ? 1 : -1) * (1.4 + random()),
      phase: random() * 6,
    });
  const carts = [];
  for (let i = 0; i < 23; i++) {
    const g = new THREE.Group();
    parent.add(g);
    g.userData.dynamic = true;
    mesh(box, mat.timber, g, [0, 0.6, 0], [1.6, 0.2, 2.1]);
    for (const side of [-1, 1]) {
      mesh(box, mat.timber, g, [side * 0.8, 0.95, 0], [0.1, 0.7, 2.1]);
      for (const z of [-0.65, 0.65]) {
        const wheel = mesh(
          new THREE.TorusGeometry(0.45, 0.06, 5, 12),
          mat.timber,
          g,
          [side * 1, 0.46, z],
        );
        wheel.rotation.y = Math.PI / 2;
      }
    }
    mesh(box, mat.timber, g, [0, 1, 0], [1.2, 0.6, 1.4]);
    carts.push(g);
  }
  return {
    update(day, time) {
      positions.forEach((p, i) => {
        const z = mix(
            ((p.z + time * 0.5 + 20) % 190) - 20,
            125 + (i / count) * 390 + time * 0.4,
            day.evacuation,
          ),
          x = roadX(z) + p.lane,
          y = landY(x, z);
        setInstance(body, i, x, y + 0.9, z, 0.36, 0.44, 0.85);
        setInstance(
          head,
          i,
          x + Math.sin(time * 3 + p.phase) * day.wind * 0.08,
          y + 1.35 + Math.sin(time * 2 + p.phase) * day.wind * 0.06,
          z + 0.65,
          0.26,
          0.65,
          0.3,
        );
        for (let k = 0; k < 4; k++)
          setInstance(
            legs,
            i * 4 + k,
            x + (k % 2 ? 0.25 : -0.25),
            y + 0.4,
            z + (k < 2 ? -0.5 : 0.5) + Math.sin(time * 3 + k + p.phase) * 0.08,
            0.1,
            0.8,
            0.1,
          );
        for (let k = 0; k < 2; k++)
          setInstance(
            packs,
            i * 2 + k,
            x + (k ? -0.39 : 0.39),
            y + 1,
            z,
            0.32,
            0.55,
            0.7,
          );
        if (i < carts.length) carts[i].position.set(x, y, z - 2.4);
      });
      for (const m of [body, head, legs, packs])
        m.instanceMatrix.needsUpdate = true;
    },
  };
}

function createBirds(parent, mat, uniforms, random) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, -0.5, 0.12, -0.12, -0.15, 0, 0.12, 0, 0, 0, 0.15, 0, 0.12, 0.5,
        0.12, -0.12,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  const birdMat = mat.black.clone();
  birdMat.side = THREE.DoubleSide;
  birdMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.vertexShader =
      `uniform float uTime;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.y+=sin(uTime*8.+instanceMatrix[3].x)*abs(position.x)*.65;",
      );
  };
  const flock = instance(geometry, birdMat, 330, parent, false),
    data = Array.from({ length: 330 }, () => ({
      a: random() * 6.28,
      r: random() * 180,
      y: 18 + random() * 60,
      speed: 0.5 + random(),
    }));
  flock.frustumCulled = false;
  return {
    update(day, time) {
      data.forEach((b, i) => {
        const fly = smooth(0.4, 1.5, day.value),
          z = mix(
            -80 + Math.sin(b.a + time * 0.07) * b.r,
            ((time * b.speed * 5 + i * 7) % 700) - 250,
            fly,
          );
        const x = mix(
          Math.cos(b.a + time * 0.07) * b.r,
          Math.sin(b.a) * 85 + Math.sin(time * 0.4 + i) * 3,
          fly,
        );
        setInstance(
          flock,
          i,
          x,
          b.y + Math.sin(time * 0.4 + b.a) * 3,
          z,
          0.7,
          0.7,
          0.7,
          fly > 0.5 ? 0 : b.a + time * 0.07,
        );
      });
      flock.instanceMatrix.needsUpdate = true;
      flock.visible = day.value < 3.2;
    },
  };
}

function createVignettes(parent, mat) {
  const g = new THREE.Group();
  parent.add(g);
  function person(x, z, dwarf, tint) {
    const p = new THREE.Group();
    p.position.set(x, landY(x, z), z);
    g.add(p);
    const cloth = mat.cloth.clone();
    cloth.color.set(tint);
    const h = dwarf ? 0.9 : 1.25;
    mesh(new THREE.CylinderGeometry(0.18, 0.27, h * 0.6, 8), cloth, p, [
      0,
      h * 0.55,
      0,
    ]);
    mesh(sphere, mat.skin, p, [0, h, 0], [0.17, 0.2, 0.17]);
    for (const s of [-1, 1]) {
      mesh(box, mat.timber, p, [s * 0.11, 0.2, 0], [0.11, 0.4, 0.13]);
      mesh(box, cloth, p, [s * 0.25, h * 0.66, 0], [0.1, 0.4, 0.12]);
    }
    if (dwarf) {
      const beard = mesh(
        cone,
        mat.stone,
        p,
        [0, h * 0.8, 0.15],
        [0.15, 0.4, 0.1],
      );
      beard.rotation.z = Math.PI;
    }
    return p;
  }
  person(MARKET.x - 4.5, MARKET.z - 3, true, "#5a7477");
  person(MARKET.x - 3.4, MARKET.z - 3, false, "#927852");
  mesh(
    box,
    mat.timber,
    g,
    [MARKET.x - 4, landY(MARKET.x - 4, MARKET.z - 3) + 0.6, MARKET.z - 3],
    [0.8, 0.4, 0.45],
  );
  const sentry = person(-9, -22, true, "#766b49");
  const chain = mesh(
    new THREE.TorusGeometry(0.2, 0.035, 4, 8),
    mat.bronze,
    sentry,
    [0, 1, 0.3],
  );
  chain.userData.dynamic = true;
  const king = person(-10, 185, true, "#806951");
  king.userData.dynamic = true;
  mesh(
    new THREE.CylinderGeometry(0.19, 0.17, 0.13, 8, 1, true),
    mat.bronze,
    king,
    [0, 1.1, 0],
  );
  for (let i = 0; i < 5; i++)
    mesh(
      cone,
      mat.bronze,
      king,
      [Math.sin((i / 5) * 6.28) * 0.17, 1.23, Math.cos((i / 5) * 6.28) * 0.17],
      [0.04, 0.2, 0.04],
    );
  mesh(box, mat.timber, king, [0.3, 0.6, 0.1], [0.05, 1.3, 0.05]);
  const cradle = new THREE.Group();
  cradle.userData.dynamic = true;
  g.add(cradle);
  mesh(box, mat.timber, cradle, [0, 0.8, 0], [0.75, 0.4, 0.4]);
  mesh(sphere, mat.canvas, cradle, [0, 0.94, 0], [0.29, 0.13, 0.15]);
  for (const side of [-1, 1]) {
    const adult = person(0, 0, false, side < 0 ? "#79694f" : "#6a7976");
    cradle.add(adult);
    adult.position.set(side * 0.62, 0, 0);
  }
  const smith = person(MARKET.x + 6, MARKET.z + 2, true, "#5c5645");
  const hammer = new THREE.Group();
  smith.add(hammer);
  hammer.position.set(0.3, 0.9, 0.12);
  hammer.userData.dynamic = true;
  mesh(box, mat.timber, hammer, [0, 0.3, 0], [0.05, 0.6, 0.05]);
  mesh(box, mat.darkStone, hammer, [0, 0.6, 0], [0.28, 0.15, 0.14]);
  const sy = landY(MARKET.x + 6, MARKET.z + 2);
  mesh(
    box,
    mat.darkStone,
    g,
    [MARKET.x + 6.3, sy + 0.45, MARKET.z + 2.7],
    [0.8, 0.9, 0.6],
  );
  mesh(
    box,
    mat.bronze,
    g,
    [MARKET.x + 6.3, sy + 0.95, MARKET.z + 2.7],
    [1.1, 0.15, 0.4],
  );
  mesh(
    box,
    mat.ember,
    g,
    [MARKET.x + 7.6, sy + 0.65, MARKET.z + 2.6],
    [0.8, 0.2, 0.7],
  );
  const child = person(MARKET.x - 9, MARKET.z + 1, false, "#a27655");
  child.scale.setScalar(0.65);
  const releasedBird = new THREE.Group();
  g.add(releasedBird);
  releasedBird.userData.dynamic = true;
  mesh(sphere, mat.bronze, releasedBird, [0, 0, 0], [0.16, 0.1, 0.22]);
  const releasedWings = [-1, 1].map((side) =>
    mesh(box, mat.bronze, releasedBird, [side * 0.23, 0, 0], [0.4, 0.025, 0.2]),
  );
  const harp = new THREE.Group();
  g.add(harp);
  harp.position.set(MARKET.x + 3, sy, MARKET.z - 4);
  mesh(box, mat.timber, harp, [0, 0.6, 0], [0.08, 1.2, 0.12]);
  const diagonal = mesh(
    box,
    mat.timber,
    harp,
    [0.35, 0.65, 0],
    [0.07, 1.45, 0.1],
  );
  diagonal.rotation.z = -0.5;
  for (let i = 0; i < 8; i++)
    mesh(
      box,
      mat.bronze,
      harp,
      [0.08 + i * 0.065, 0.6, 0],
      [0.009, 0.8 - i * 0.06, 0.01],
    );
  person(MARKET.x + 3.7, MARKET.z - 4, false, "#75815b");
  batchStatic(g);
  return {
    update(day, time) {
      king.visible = day.evacuation > 0.7;
      const z = 590 + Math.sin(time * 0.1) * 2;
      king.position.set(roadX(z), landY(roadX(z), z), z);
      king.rotation.y = Math.sin(time * 0.3) > 0.8 ? Math.PI * 0.8 : 0;
      chain.rotation.x = Math.sin(time * 4) * day.alarm;
      hammer.rotation.x =
        -0.8 + Math.max(0, Math.sin(time * 5)) * 1.3 * day.trade;
      const release = smooth(0.65, 1.3, day.value);
      releasedBird.visible = day.value < 1.7;
      releasedBird.position.set(
        MARKET.x - 9 + Math.sin(time * 2) * release,
        sy + 0.8 + release * 13,
        MARKET.z + 1 + release * 90,
      );
      releasedWings.forEach((wing, i) => {
        wing.rotation.z = Math.sin(time * 14) * 0.7 * (i ? 1 : -1);
      });
      cradle.visible = day.value > 2.4 && day.value < 3.5;
      cradle.position.set(riverX(88) + Math.sin(time * 0.2) * 9, 8.1, 88);
    },
  };
}
