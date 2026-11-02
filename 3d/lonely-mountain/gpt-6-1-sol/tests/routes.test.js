import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIDGES,
  cameraGroundY,
  mountainY,
  landY,
  riverX,
  riverWidth,
  waterY,
  walkingY,
  roadX,
  eastPathX,
} from "../src/world/terrain.js";
import {
  joinZFor,
  evacuationPoint,
  bridgeExitPoint,
} from "../src/world/routes.js";

test("camera clears the mountain foot south of the old z cutoff", () => {
  for (const x of [-60, -30, 25, 60])
    for (const z of [-39, -25, -10, 0]) {
      assert.ok(
        cameraGroundY(x, z) >= Math.max(landY(x, z), mountainY(x, z)) ||
          mountainY(x, z) < 8.2,
      );
    }
  assert.equal(cameraGroundY(0, -32), landY(0, -32));
});

test("bridge walkers stay on decks through their entire idle sway", () => {
  for (const [z, , deck] of BRIDGES)
    for (let i = -95; i <= 95; i++)
      assert.ok(Math.abs(walkingY(riverX(z), z + i / 100) - deck) < 1e-9);
});

test("bridge approaches are graded and bank roads avoid abutments", () => {
  for (const [z, width] of BRIDGES) {
    let previous = walkingY(riverX(z) - width / 2 - 6, z);
    for (
      let x = riverX(z) - width / 2 - 6;
      x <= riverX(z) + width / 2 + 6;
      x += 0.02
    ) {
      const height = walkingY(x, z);
      assert.ok(Math.abs(height - previous) < 0.08);
      previous = height;
    }
    for (let dz = -6; dz <= 6; dz += 0.02)
      for (const side of [-1.2, 0, 1.2])
        for (const path of [roadX, eastPathX]) {
          const x = path(z + dz) + side;
          assert.ok(Math.abs(walkingY(x, z + dz) - landY(x, z + dz)) < 0.05);
        }
  }
});

test("evacuees cross water only on a bridge, then follow their bank south", () => {
  for (const bank of [-1, 1]) {
    const x = bank === -1 ? 45 : -45,
      z = 64,
      join = joinZFor(x, z, bank);
    assert.equal(join, 55);
    for (let i = 0; i <= 1000; i++) {
      const p = evacuationPoint(x, z, join, 440, i / 1000, 0.5, bank);
      if (Math.abs(p.x - riverX(p.z)) < riverWidth(p.z) + 0.2) {
        assert.equal(p.z, join);
        assert.ok(walkingY(p.x, p.z) > waterY(p.z) + 1);
      }
    }
    for (const boundary of [0.12, 0.24, 0.5]) {
      const a = evacuationPoint(x, z, join, 440, boundary - 1e-7, 0.5, bank),
        b = evacuationPoint(x, z, join, 440, boundary + 1e-7, 0.5, bank);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.001);
    }
    const end = evacuationPoint(x, z, join, 440, 1, 0.5, bank);
    assert.equal(end.z, 440);
    assert.equal(end.x, (bank === 1 ? eastPathX(440) : roadX(440)) + 0.5);
  }
  assert.ok(Math.abs(riverX(120.0001) - riverX(119.9999)) < 0.001);
});

test("deck height blends through longitudinal edges and the river widens continuously", () => {
  for (const [z] of BRIDGES) {
    const x = riverX(z) + 10;
    let previous = walkingY(x, z - 6);
    for (let dz = -6; dz <= 6; dz += 0.01) {
      const height = walkingY(x, z + dz);
      assert.ok(Math.abs(height - previous) < 0.08);
      previous = height;
    }
  }
  const before = walkingY(roadX(159.9999999), 159.9999999),
    after = walkingY(roadX(160.0000001), 160.0000001);
  assert.ok(Math.abs(before - after) < 1e-6);
  for (let z = 0; z <= 590; z += 0.5)
    for (const path of [roadX, eastPathX])
      assert.ok(Math.abs(path(z) - riverX(z)) >= riverWidth(z) + 6 - 1e-8);
});

test("sheltering walkers leave a bridge along its deck before heading to a doorway", () => {
  for (const [z] of BRIDGES)
    for (const side of [-1, 1]) {
      const x = riverX(z) + side * 2,
        targetZ = z + 9,
        targetX = riverX(targetZ) + side * 25;
      for (let i = 0; i <= 1000; i++) {
        const p = bridgeExitPoint(x, z + 0.7, z, targetX, targetZ, i / 1000);
        if (Math.abs(p.x - riverX(p.z)) < riverWidth(p.z) + 0.2)
          assert.ok(Math.abs(p.z - z) < 1.65);
        if (i === 1000) {
          assert.equal(p.x, targetX);
          assert.equal(p.z, targetZ);
        }
      }
    }
});
