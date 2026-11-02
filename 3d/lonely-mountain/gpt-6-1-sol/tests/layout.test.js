import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createTown } from "../src/world/town.js";
import { roadX, eastPathX } from "../src/world/terrain.js";

test("every seeded house footprint and walker lane clears the curved bank paths", () => {
  const scene = new THREE.Scene();
  const names = [
    "stone",
    "pale",
    "darkStone",
    "rock",
    "ground",
    "roof",
    "roofDepth",
    "timber",
    "bronze",
    "black",
    "pine",
    "trunk",
    "leaf",
    "barley",
    "canvas",
    "cloth",
    "skin",
    "ember",
    "lamp",
    "walls",
  ];
  const materials = Object.fromEntries(
    names.map((name) => [name, new THREE.MeshStandardMaterial()]),
  );
  const { buildings } = createTown(scene, materials, {
    time: { value: 0 },
    day: { value: 0 },
  });
  assert.ok(
    buildings.length > 250,
    `town must remain dense, got ${buildings.length}`,
  );
  for (const b of buildings) {
    const reach = Math.hypot(b.w, b.d) / 2 + 2.3;
    for (let z = b.z - reach; z <= b.z + reach; z += 0.1)
      for (const path of [roadX, eastPathX]) {
        const dx = path(z) - b.x,
          dz = z - b.z;
        const localX = dx * Math.cos(b.r) - dz * Math.sin(b.r),
          localZ = dx * Math.sin(b.r) + dz * Math.cos(b.r);
        assert.ok(
          Math.abs(localX) > b.w / 2 + 2.2 || Math.abs(localZ) > b.d / 2 + 2.2,
          `house ${b.x},${b.z} intersects a bank path at ${path(z)},${z}`,
        );
      }
  }
  console.log(
    `Checked ${buildings.length} seeded house footprints against both bank paths.`,
  );
});
