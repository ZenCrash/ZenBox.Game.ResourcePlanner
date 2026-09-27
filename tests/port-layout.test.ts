import { test } from "node:test";
import assert from "node:assert/strict";
import { initialPortRows, previewPortMove } from "../lib/port-layout";
import { nodeSchema } from "../lib/model";

test("ports start on separate grid rows and retain saved placement", () => {
  assert.deepEqual(initialPortRows(["input:0", "input:1", "input:2"]), {
    "input:0": 3,
    "input:1": 5,
    "input:2": 7,
  });
  assert.deepEqual(
    initialPortRows(["input:0", "input:1"], { "input:0": 6, "input:1": 4 }),
    { "input:0": 6, "input:1": 4 },
  );
});
test("hover previews push down from above and up from below without mutating saved rows", () => {
  const original = { a: 3, b: 5, c: 7 };
  assert.deepEqual(previewPortMove(original, "a", 4.8, 1, 10), {
    a: 5,
    b: 6,
    c: 7,
  });
  assert.deepEqual(previewPortMove(original, "a", 5.2, 1, 10), {
    a: 5,
    b: 4,
    c: 7,
  });
  assert.deepEqual(original, { a: 3, b: 5, c: 7 });
  assert.deepEqual(previewPortMove(original, "a", 9, 1, 10), {
    a: 9,
    b: 5,
    c: 7,
  });
  assert.deepEqual(previewPortMove(original, "a", 3, 1, 10), original);
});
test("collision previews shift a chain into a vacancy and respect edge limits", () => {
  const original = { a: 2, b: 4, c: 5, d: 6 };
  const preview = previewPortMove(original, "a", 3.8, 1, 7);
  assert.deepEqual(preview, { a: 4, b: 5, c: 6, d: 7 });
  assert.equal(new Set(Object.values(preview)).size, 4);
  assert.deepEqual(previewPortMove({ a: 1, b: 2, c: 3 }, "a", 2.8, 1, 3), {
    a: 3,
    b: 1,
    c: 2,
  });
  assert.equal(previewPortMove(original, "a", -100, 1, 7).a, 1);
  assert.equal(previewPortMove(original, "a", 100, 1, 7).a, 7);
});
test("committed port rows survive serialization while old diagrams remain valid", () => {
  const base = {
    id: crypto.randomUUID(),
    recipeId: "test",
    position: { x: 0, y: 0 },
    machines: 1,
    variants: {},
  };
  const node = { ...base, portRows: { "input:0": 5, "input:1": 6 }, disabledPorts: ["input:0", "output:1"] };
  assert.deepEqual(nodeSchema.parse(JSON.parse(JSON.stringify(node))), node);
  assert.equal(nodeSchema.parse(base).portRows, undefined);
  assert.equal(nodeSchema.parse(base).disabledPorts, undefined);
  assert.equal(nodeSchema.safeParse({ ...base, disabledPorts: ["invalid"] }).success, false);
});
