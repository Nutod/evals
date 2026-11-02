import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { roofGeometry, batchStatic } from "../src/world/helpers.js";
import {
  riverX,
  riverWidth,
  waterY,
  roadX,
  landY,
  mountainY,
  walkingY,
} from "../src/world/terrain.js";

test("roof slopes face outward and upward, never into the house", () => {
  const geometry = roofGeometry(),
    normals = geometry.attributes.normal;
  for (let i = 6; i < normals.count; i++) assert.ok(normals.getY(i) > 0);
  assert.ok(normals.getZ(0) < 0);
  assert.ok(normals.getZ(3) > 0);
  geometry.dispose();
});

test("static batching preserves different shadow flags", () => {
  const root = new THREE.Group(),
    material = new THREE.MeshBasicMaterial();
  for (const cast of [true, false]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), material);
    m.castShadow = cast;
    root.add(m);
  }
  batchStatic(root);
  assert.equal(root.children.length, 2);
  assert.deepEqual(root.children.map((m) => m.castShadow).sort(), [
    false,
    true,
  ]);
});
test("the persistent river falls below Dale and meets a carved lake bed", () => {
  assert.ok(waterY(100) > waterY(112) + 2);
  assert.ok(landY(riverX(80), 80) < waterY(80));
  assert.ok(landY(35, 900) < 0);
  assert.ok(riverWidth(500) > riverWidth(50));
  assert.ok(mountainY(9, -156) > 200);
  assert.ok(roadX(540) < riverX(540) - 150);
  assert.equal(walkingY(riverX(55), 55), 8.3);
});
