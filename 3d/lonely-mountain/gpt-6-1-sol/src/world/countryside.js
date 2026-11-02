import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded, smooth } from "../state.js";
import { landY, riverX, riverWidth, roadX } from "./terrain.js";
import {
  instance,
  setInstance,
  sphere,
  cylinder,
  box,
  ribbon,
  mesh,
  batchStatic,
} from "./helpers.js";

export function createCountryside(scene, mat, uniforms) {
  const random = seeded(1289),
    group = new THREE.Group();
  scene.add(group);
  const fieldMaterial = new THREE.MeshStandardMaterial({
    color: "#b5a26b",
    roughness: 1,
  });
  for (let field = 0; field < 8; field++) {
    const side = field % 2 ? -1 : 1,
      x0 = side * (130 + Math.floor(field / 4) * 85),
      z0 = (Math.floor(field / 2) % 2) * 110 - 10;
    const pts = [];
    for (let z = z0; z <= z0 + 67; z += 2)
      pts.push([x0, landY(x0, z) + 0.1, z]);
    const fm = fieldMaterial.clone();
    fm.color.set(["#9e965e", "#79834b", "#aa9c63", "#929657"][field % 4]);
    ribbon(pts, 32, fm, group).castShadow = false;
    for (const sideX of [-1, 1]) {
      const edge = x0 + sideX * 33;
      for (let i = 0; i < 16; i++)
        mesh(
          box,
          mat.darkStone,
          group,
          [edge, landY(edge, z0 + i * 4.2) + 0.4, z0 + i * 4.2],
          [0.7, 0.8, 4],
        );
    }
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.18, 0, 0, 0.18, 0, 0, 0.07, 0.8, 0.05, 0, 0, -0.18, 0, 0, 0.18,
        -0.05, 0.65, 0.07,
      ],
      3,
    ),
  );
  grassGeometry.computeVertexNormals();
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    roughness: 1,
  });
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.time;
    shader.uniforms.uDay = uniforms.day;
    shader.vertexShader =
      `uniform float uTime; uniform float uDay;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.x+=position.y*position.y*(sin(uTime*1.8+instanceMatrix[3].x*.8)*.14+smoothstep(.3,1.3,uDay)*.32);",
      );
  };
  const grass = instance(grassGeometry, grassMaterial, 32000, group, false);
  let gi = 0;
  for (let i = 0; i < 44000 && gi < 32000; i++) {
    const z = -20 + random() * 600,
      x = (random() - 0.5) * 600;
    if (
      (z < 170 && Math.abs(x) < 110) ||
      Math.abs(x - riverX(z)) < riverWidth(z) + 3 ||
      Math.abs(x - roadX(z)) < 3
    )
      continue;
    const s = 0.3 + random() * 0.7;
    setInstance(
      grass,
      gi++,
      x,
      landY(x, z),
      z,
      s,
      s,
      s,
      random() * 6,
      new THREE.Color().setHSL(
        0.19 + random() * 0.055,
        0.24,
        0.27 + random() * 0.13,
      ),
    );
  }
  grass.count = gi;
  const flowers = instance(sphere, mat.cloth, 2600, group, false);
  for (let i = 0; i < 2600; i++) {
    const x = 100 + random() * 140,
      z = 160 + random() * 170;
    setInstance(
      flowers,
      i,
      x,
      landY(x, z) + 0.3,
      z,
      0.055,
      0.04,
      0.055,
      0,
      i % 5 ? "#d3d0a4" : "#a38c5f",
    );
  }
  const treeGeo = mergeGeometries(
    Array.from({ length: 7 }, (_, i) => {
      const g = new THREE.IcosahedronGeometry(1, 1),
        a = (i / 7) * Math.PI * 2;
      g.scale(1.5, 1.35, 1.5);
      g.translate(Math.cos(a) * 0.9, 3 + (i % 3) * 0.5, Math.sin(a) * 0.9);
      return g;
    }),
  );
  const trees = instance(
    treeGeo,
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      flatShading: true,
    }),
    300,
    group,
  );
  const trunks = instance(cylinder, mat.trunk, 300, group);
  for (let i = 0; i < 300; i++) {
    let z = -10 + random() * 510,
      x = (random() - 0.5) * 550;
    if (i < 90) {
      z = 170 + random() * 390;
      x = riverX(z) + (i % 2 ? -1 : 1) * (15 + random() * 15);
    }
    if (z < 170 && Math.abs(x) < 115) x += x > 0 ? 135 : -135;
    const y = landY(x, z),
      s = 0.8 + random() * 0.8;
    setInstance(
      trees,
      i,
      x,
      y,
      z,
      s,
      s,
      s,
      random() * 6,
      new THREE.Color().setHSL(
        0.2 + random() * 0.07,
        0.25,
        0.26 + random() * 0.09,
      ),
    );
    setInstance(trunks, i, x, y + s * 1.5, z, 0.18 * s, 3 * s, 0.18 * s);
  }
  const shrubs = instance(
    new THREE.IcosahedronGeometry(1, 1),
    mat.leaf,
    1200,
    group,
    false,
  );
  for (let i = 0; i < 1200; i++) {
    const z = random() * 560,
      x = riverX(z) + (i % 2 ? -1 : 1) * (riverWidth(z) + 5 + random() * 2);
    setInstance(
      shrubs,
      i,
      x,
      landY(x, z) + 0.45,
      z,
      0.5 + random() * 0.5,
      0.5,
      0.6,
    );
  }
  const waterRocks = instance(
    new THREE.IcosahedronGeometry(1, 1),
    mat.stone,
    380,
    group,
  );
  for (let i = 0; i < 380; i++) {
    const z = 120 + random() * 440,
      x = riverX(z) + (random() - 0.5) * riverWidth(z) * 2;
    setInstance(
      waterRocks,
      i,
      x,
      0.85,
      z,
      0.35 + random(),
      0.25 + random() * 0.45,
      0.4 + random(),
    );
  }
  batchStatic(group);
  return {
    update(day, time, budget, camera) {
      grass.visible = flowers.visible =
        camera.position.y < 310 && budget.detailDistance > 100;
    },
  };
}
