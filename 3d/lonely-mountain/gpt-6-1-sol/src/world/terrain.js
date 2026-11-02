import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded, smooth, mix } from "../state.js";
import {
  mesh,
  instance,
  setInstance,
  ribbon,
  box,
  cone,
  cylinder,
} from "./helpers.js";
import { makeWater } from "../materials.js";

export const BRIDGES = [
  [20, 26, 9.1],
  [55, 25, 8.3],
  [88, 24, 8],
  [112, 29, 6.9],
  [140, 28, 5.3],
];
export function walkingY(x, z) {
  const bridge = BRIDGES.find(
    ([bz, width]) =>
      Math.abs(z - bz) < 4.7 && Math.abs(x - riverX(bz)) < width / 2 + 5,
  );
  const ground = landY(x, z);
  if (!bridge) return ground;
  const [bz, width, deck] = bridge;
  return mix(
    ground,
    deck,
    smooth(width / 2 + 5, width / 2, Math.abs(x - riverX(bz))) *
      smooth(4.7, 1.65, Math.abs(z - bz)),
  );
}

export function cameraGroundY(x, z) {
  const passage = Math.abs(x) < 6.5 && z > -43 && z < -24;
  const ground = landY(x, z),
    rock = mountainY(x, z);
  return passage
    ? ground
    : mix(ground, Math.max(ground, rock), smooth(6, 8.2, rock));
}

export function riverX(z) {
  return (
    Math.sin((z + 25) * 0.021) * mix(9, 22, smooth(110, 190, z)) +
    Math.sin(z * 0.048) * 2
  );
}
export function riverWidth(z) {
  const channel = mix(2.3, 4.4, smooth(-15, 0, z));
  return mix(
    channel,
    6.5 + Math.min(8, Math.max(0, z - 160) * 0.018),
    smooth(145, 190, z),
  );
}
export function waterY(z) {
  return z < 104 ? 6.3 - (z + 25) * 0.012 : 1.3 - Math.max(0, z - 120) * 0.001;
}
export function landY(x, z) {
  const lakeDistance = Math.hypot((x - 35) / 455, (z - 900) / 245);
  if (lakeDistance < 1) return -2 + smooth(0.9, 1, lakeDistance) * 2;
  const bank = Math.abs(x - riverX(z));
  const terraces =
    3.3 + Math.max(0, 110 - z) * 0.043 + Math.max(0, Math.abs(x) - 23) * 0.047;
  const hill =
    Math.sin(x * 0.014 + 0.8) * Math.cos(z * 0.018) * 2 +
    Math.sin(x * 0.043 + z * 0.013) * 0.6;
  const rural = smooth(105, 210, Math.abs(x)) + smooth(160, 250, z);
  const y = mix(terraces, 1.5 + hill, Math.min(1, rural));
  return mix(
    waterY(z) - 2.5,
    y,
    smooth(riverWidth(z), riverWidth(z) + 4, bank),
  );
}
function hash(x, y) {
  return (((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1) + 1) % 1;
}
function noise(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), sx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
    sy,
  );
}
export function mountainY(x, z) {
  const xx = x - 9,
    zz = z + 156,
    r = Math.hypot(xx / 132, zz / 143),
    angle = Math.atan2(zz, xx);
  const ridge =
    1 +
    Math.sin(angle * 9 + r * 3) * 0.14 +
    Math.sin(angle * 17 - r * 5) * 0.055;
  const peak = Math.pow(Math.max(0, 1 - r / ridge), 1.38) * 224;
  const shoulder1 =
    Math.max(0, 1 - Math.hypot((x + 97) / 104, (z + 148) / 101)) * 100;
  const shoulder2 =
    Math.max(0, 1 - Math.hypot((x + 157) / 78, (z + 190) / 94)) * 85;
  const east =
    Math.max(0, 1 - Math.hypot((x - 110) / 97, (z + 170) / 118)) * 110;
  const base = Math.max(peak, shoulder1, shoulder2, east);
  const crags =
    (noise(x * 0.12, z * 0.12) - 0.5) * 19 +
    (noise(x * 0.042, z * 0.042) - 0.5) * 25 +
    (noise(x * 0.4, z * 0.4) - 0.5) * 3.4;
  return 5 + base + crags * smooth(0, 25, base);
}

export function createTerrain(scene, materials, uniforms) {
  const random = seeded(103),
    group = new THREE.Group();
  scene.add(group);
  const plain = mesh(
    new THREE.PlaneGeometry(7000, 7000),
    new THREE.MeshBasicMaterial({ color: "#aabfc0" }),
    group,
    [0, -7, 0],
  );
  plain.rotation.x = -Math.PI / 2;
  plain.castShadow = false;
  const ground = new THREE.PlaneGeometry(1900, 2300, 270, 330);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, 0, 180);
  const gp = ground.attributes.position,
    gc = [],
    c = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i),
      z = gp.getZ(i),
      n = noise(x * 0.035, z * 0.035);
    gp.setY(i, landY(x, z));
    c.set("#657d41")
      .lerp(new THREE.Color("#a5aa69"), n * 0.75)
      .multiplyScalar(0.92 + noise(x * 0.2, z * 0.2) * 0.15);
    const town =
      (1 - smooth(100, 135, Math.abs(x))) *
      (1 - smooth(150, 185, z)) *
      smooth(-70, -30, z);
    c.lerp(new THREE.Color("#8d906a"), town * 0.6);
    gc.push(c.r, c.g, c.b);
  }
  ground.setAttribute("color", new THREE.Float32BufferAttribute(gc, 3));
  ground.computeVertexNormals();
  mesh(ground, materials.ground, group).castShadow = false;

  const mountain = new THREE.PlaneGeometry(485, 365, 300, 250);
  mountain.rotateX(-Math.PI / 2);
  mountain.translate(-14, 0, -160);
  const p = mountain.attributes.position,
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      h = mountainY(x, z);
    p.setY(i, h < 8 ? landY(x, z) - 1 : h);
    const n = noise(x * 0.14, z * 0.14),
      moss = 1 - smooth(18, 85, h);
    c.set("#747f7c").lerp(new THREE.Color("#b6b7a6"), n * 0.75);
    c.lerp(new THREE.Color("#596d43"), moss * 0.65);
    const snow = smooth(146 + noise(x * 0.09, z * 0.09) * 32, 192, h);
    c.lerp(new THREE.Color("#e4e5d8"), snow * 0.9);
    colors.push(c.r, c.g, c.b);
  }
  const oldIndices = mountain.index.array,
    clipped = [];
  for (let i = 0; i < oldIndices.length; i += 3) {
    const triangle = [oldIndices[i], oldIndices[i + 1], oldIndices[i + 2]];
    const gateOpening = triangle.every(
      (j) =>
        Math.abs(p.getX(j)) < 8.1 &&
        p.getZ(j) > -49 &&
        p.getZ(j) < -24 &&
        p.getY(j) < 43,
    );
    if (
      !gateOpening &&
      triangle.some((j) => mountainY(p.getX(j), p.getZ(j)) > 8.2)
    )
      clipped.push(...triangle);
  }
  mountain.setIndex(clipped);
  mountain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  mountain.computeVertexNormals();
  const mountainMesh = mesh(mountain, materials.rock, group);
  mountainMesh.castShadow = true;

  const rockGeos = [];
  for (let i = 0; i < 500; i++) {
    const x = (random() - 0.5) * 320,
      z = -50 - random() * 230,
      y = mountainY(x, z);
    if (y < 20) continue;
    const g = new THREE.IcosahedronGeometry(1, 0);
    const s = 1 + random() * 5;
    g.scale(s * 0.8, s * (1 + random() * 2), s);
    g.rotateY(random() * 6);
    g.translate(x, y - s * 0.5, z);
    const a = new Float32Array(g.attributes.position.count * 3);
    c.set("#a7a68f");
    for (let j = 0; j < a.length; j += 3) {
      a[j] = c.r;
      a[j + 1] = c.g;
      a[j + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    rockGeos.push(g);
  }
  if (rockGeos.length) mesh(mergeGeometries(rockGeos), materials.rock, group);

  const water = makeWater(uniforms),
    riverPoints = [],
    widths = [];
  for (let z = -40; z <= 750; z += 1.5) {
    riverPoints.push([riverX(z), waterY(z), z]);
    widths.push(riverWidth(z));
  }
  ribbon(riverPoints, widths, water, group).castShadow = false;
  const lake = mesh(
    new THREE.CircleGeometry(260, 72),
    water,
    group,
    [35, 0.2, 900],
  );
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(1.8, 1, 1);

  const roadPoints = [];
  for (let z = -27; z <= 590; z += 2) {
    const x = roadX(z);
    roadPoints.push([x, landY(x, z) + 0.12, z]);
  }
  const road = ribbon(roadPoints, 2.2, materials.stone, group);
  road.castShadow = false;
  const bankPoints = [];
  for (let z = -15; z <= 590; z += 2) {
    const x = eastPathX(z);
    bankPoints.push([x, landY(x, z) + 0.12, z]);
  }
  ribbon(bankPoints, 1.1, materials.stone, group).castShadow = false;
  for (const [z] of BRIDGES) {
    const pts = [];
    for (let x = -99; x <= 98; x += 2) pts.push([x, walkingY(x, z) + 0.13, z]);
    ribbon(pts, 1.5, materials.stone, group).castShadow = false;
  }

  const treePositions = [];
  for (let i = 0; i < 9000 && treePositions.length < 5200; i++) {
    const x = (random() - 0.5) * 820,
      z = -380 + random() * 970;
    if (
      (z > -30 && z < 190 && Math.abs(x) < 135) ||
      Math.abs(x - riverX(z)) < riverWidth(z) + 12 ||
      Math.abs(x - roadX(z)) < 7
    )
      continue;
    const y = z < -30 && Math.abs(x) < 230 ? mountainY(x, z) : landY(x, z);
    if (y > 116 || y < 2) continue;
    treePositions.push({
      x,
      y,
      z,
      s: 1.8 + random() * 4.4,
      tint: new THREE.Color().setHSL(
        0.28 + random() * 0.045,
        0.28 + random() * 0.13,
        0.12 + random() * 0.08,
      ),
    });
  }
  const trunks = instance(
    cylinder,
    materials.trunk,
    treePositions.length,
    group,
    false,
  );
  const pineGeometry = mergeGeometries(
    [0, 1, 2].map((i) => {
      const g = new THREE.ConeGeometry(1 - i * 0.22, 1.9 - i * 0.18, 7);
      g.translate(0, 1.2 + i * 0.65, 0);
      return g;
    }),
  );
  const pines = instance(
    pineGeometry,
    materials.pine,
    treePositions.length,
    group,
  );
  treePositions.forEach((t, i) => {
    setInstance(
      trunks,
      i,
      t.x,
      t.y + t.s,
      t.z,
      0.12 * t.s,
      t.s * 2,
      0.12 * t.s,
    );
    setInstance(
      pines,
      i,
      t.x,
      t.y,
      t.z,
      t.s * 0.65,
      t.s,
      t.s * 0.65,
      random() * 6,
      t.tint,
    );
  });
  const sprays = [];
  for (let level = 0; level < 7; level++)
    for (let branch = 0; branch < 5; branch++) {
      const a = (branch / 5) * Math.PI * 2 + level * 1.7,
        radius = (1 - level / 8) * 0.7;
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(radius * 0.85, 0.23, radius * 0.5);
      g.rotateY(-a);
      g.translate(
        Math.cos(a) * radius * 0.5,
        0.75 + level * 0.33,
        Math.sin(a) * radius * 0.5,
      );
      sprays.push(g);
    }
  const top = new THREE.ConeGeometry(0.25, 1, 7).toNonIndexed();
  top.translate(0, 3, 0);
  sprays.push(top);
  const detailedPines = instance(
    mergeGeometries(sprays),
    materials.pine,
    1100,
    group,
  );
  detailedPines.frustumCulled = false;
  detailedPines.count = 0;
  let lastTreePosition = new THREE.Vector3(Infinity, 0, 0),
    lastTreeBudget = -1;
  materials.pine.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uDay = uniforms.day;
    shader.vertexShader =
      `uniform float uTime; uniform float uDay;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.x += sin(uTime*1.7 + instanceMatrix[3].x*.2) * pow(max(position.y,0.)*.23,2.) * (0.08+smoothstep(.3,1.2,uDay)*.3);",
      );
  };
  const windDepth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  windDepth.onBeforeCompile = materials.pine.onBeforeCompile;
  pines.customDepthMaterial = detailedPines.customDepthMaterial = windDepth;

  const boulders = instance(
    new THREE.IcosahedronGeometry(1, 0),
    materials.darkStone,
    1300,
    group,
  );
  for (let i = 0; i < 1300; i++) {
    const z = -15 + random() * 460,
      side = random() > 0.5 ? 1 : -1,
      x = riverX(z) + side * (riverWidth(z) + random() * 4);
    const s = 0.2 + random() * 0.7;
    setInstance(
      boulders,
      i,
      x,
      landY(x, z) + 0.1,
      z,
      s * 1.5,
      s,
      s,
      random() * 6,
    );
  }
  const fieldGroup = new THREE.Group();
  group.add(fieldGroup);
  const stalks = instance(cone, materials.barley, 19000, fieldGroup, false);
  for (let i = 0; i < 19000; i++) {
    const field = i % 4,
      x = (field < 2 ? -1 : 1) * (135 + random() * 68),
      z = (field % 2 ? 110 : -2) + random() * 66;
    setInstance(
      stalks,
      i,
      x,
      landY(x, z) + 0.5,
      z,
      0.13,
      0.9 + random() * 0.5,
      0.13,
      random() * 6,
      new THREE.Color().setHSL(0.13, 0.25, 0.43 + random() * 0.12),
    );
  }
  materials.barley.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uDay = uniforms.day;
    shader.vertexShader =
      `uniform float uTime; uniform float uDay;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.x+= (sin(uTime*2.5+instanceMatrix[3].x*.4+instanceMatrix[3].z*.3)*.15+smoothstep(.3,1.1,uDay)*.3) * (position.y+.5);",
      );
  };

  const foam = instance(
    box,
    new THREE.MeshBasicMaterial({
      color: "#c9e1cb",
      transparent: true,
      opacity: 0.65,
    }),
    230,
    group,
    false,
  );
  const foamData = Array.from({ length: 230 }, () => ({
    x: (random() - 0.5) * 7,
    z: random() * 10,
    s: 0.08 + random() * 0.18,
  }));
  return {
    river: water,
    treeCount: treePositions.length,
    update(day, time, budget, camera) {
      plain.material.color.copy(scene.fog.color);
      pines.count = trunks.count = Math.min(treePositions.length, budget.trees);
      if (
        camera.position.distanceToSquared(lastTreePosition) > 225 ||
        lastTreeBudget !== budget.trees
      ) {
        const nearest = treePositions
          .slice(0, pines.count)
          .map((t, i) => ({
            t,
            i,
            distance: Math.hypot(
              t.x - camera.position.x,
              t.y - camera.position.y,
              t.z - camera.position.z,
            ),
          }))
          .filter((t) => t.distance < budget.detailDistance + 100)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 1100);
        treePositions.forEach((t, i) => {
          if (i < pines.count)
            setInstance(
              pines,
              i,
              t.x,
              t.y,
              t.z,
              t.s * 0.65,
              t.s,
              t.s * 0.65,
              i * 1.71,
              t.tint,
            );
        });
        nearest.forEach(({ t, i }, j) => {
          setInstance(pines, i, t.x, -200, t.z, 0, 0, 0);
          setInstance(
            detailedPines,
            j,
            t.x,
            t.y,
            t.z,
            t.s,
            t.s,
            t.s,
            i * 1.71,
            t.tint,
          );
        });
        detailedPines.count = nearest.length;
        detailedPines.instanceMatrix.needsUpdate =
          pines.instanceMatrix.needsUpdate = true;
        if (detailedPines.instanceColor)
          detailedPines.instanceColor.needsUpdate = true;
        if (pines.instanceColor) pines.instanceColor.needsUpdate = true;
        lastTreePosition.copy(camera.position);
        lastTreeBudget = budget.trees;
      }
      fieldGroup.visible =
        camera.position.distanceTo(new THREE.Vector3(0, 5, 75)) <
        budget.detailDistance + 280;
      foam.material.opacity = 0.65 * (1 - day.night * 0.8);
      foamData.forEach((f, i) => {
        const t = (time * 2.8 + f.z) % 10;
        setInstance(
          foam,
          i,
          riverX(105) + f.x,
          4.7 - t * 0.43,
          104 + t * 0.55,
          f.s,
          0.15 + f.s * 2,
          f.s * 1.5,
        );
      });
      foam.instanceMatrix.needsUpdate = true;
    },
  };
}
export function roadX(z) {
  return (
    riverX(z) -
    bankOffset(z, 12 + Math.sin(z * 0.025) * 4) -
    smooth(155, 540, z) * 175
  );
}

function bankOffset(z, base) {
  base = Math.max(base, riverWidth(z) + 6);
  let extra = 0;
  for (const [bz, width] of BRIDGES)
    extra = Math.max(
      extra,
      smooth(14, 6, Math.abs(z - bz)) * Math.max(0, width / 2 + 8 - base),
    );
  return base + extra;
}

export function eastPathX(z) {
  return riverX(z) + bankOffset(z, 13);
}
