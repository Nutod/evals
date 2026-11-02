import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOURS,
  sampleDay,
  residentHours,
  ignitionAt,
  damageAt,
  budgets,
  seeded,
} from "../src/state.js";

test("five complete states and a noon-first initial state", () => {
  assert.equal(HOURS.length, 5);
  assert.equal(sampleDay(0).trade, 1);
  assert.equal(sampleDay(0).dragon, 0);
  assert.equal(sampleDay(2).alarm, 1);
  assert.equal(sampleDay(3).gate, 1);
  assert.equal(sampleDay(4).evacuation, 1);
  assert.equal(sampleDay(4).dragon, 0);
  assert.equal(sampleDay(4).kitchen, 0);
});
test("continuous finite state values during forward and reverse scrubbing", () => {
  let previous = sampleDay(0);
  for (let i = 0; i <= 4000; i++) {
    const v = i / 1000,
      state = sampleDay(v);
    for (const key of [
      "wind",
      "alarm",
      "evacuation",
      "night",
      "fire",
      "dragon",
      "gate",
      "trade",
    ]) {
      assert.ok(state[key] >= 0 && state[key] <= 1);
      assert.ok(Math.abs(state[key] - previous[key]) < 0.01);
    }
    assert.deepEqual(state, sampleDay(v));
    previous = state;
  }
  assert.deepEqual(sampleDay(0), sampleDay(-100));
  assert.deepEqual(sampleDay(4), sampleDay(100));
});
test("the Gate-side roofs ignite before southern roofs and can unburn", () => {
  const north = ignitionAt(5, -10, 0.2),
    south = ignitionAt(5, 140, 0.2);
  assert.ok(north < south);
  assert.ok(damageAt(2.9, north) > damageAt(2.9, south));
  assert.equal(damageAt(4, south), 1);
  assert.equal(damageAt(0, south), 0);
});
test("only active and adjacent hour pools are resident", () => {
  assert.deepEqual(residentHours(0), [0, 1]);
  assert.deepEqual(residentHours(1), [0, 1, 2]);
  assert.deepEqual(residentHours(2), [1, 2, 3]);
  assert.deepEqual(residentHours(4), [3, 4]);
  assert.deepEqual(residentHours(-1), [0, 1]);
});
test("quality reduces crowds and particles first but keeps complete states", () => {
  for (const quality of ["low", "medium", "high"]) {
    const b = budgets(quality, 0.5);
    assert.ok(b.people > 0);
    assert.ok(b.trees >= 3380);
  }
  assert.ok(budgets("low").people < budgets("high").people);
  assert.ok(budgets("low").particles < budgets("high").particles);
  assert.equal(budgets("high").people, 2400);
  assert.equal(budgets("high", 0).people, 360);
});
test("procedural generation is deterministic", () => {
  const a = seeded(123),
    b = seeded(123);
  for (let i = 0; i < 500; i++) assert.equal(a(), b());
});
