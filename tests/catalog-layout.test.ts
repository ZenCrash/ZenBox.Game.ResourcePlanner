import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogTiles } from "../lib/catalog-layout";
import { shapedCraftingSlots } from "../lib/recipe-slots";
import type { Ingredient } from "../lib/model";

test("shaped crafting preserves spatial gaps rather than packing ingredient order", () => {
  const input = (slot: number, x: number | null, y: number | null) =>
    ({ slot, x, y, direction: "input" }) as Ingredient;
  const topLeft = input(0, 25, 6);
  const middleLeft = input(1, 25, 24);
  const bottomRight = input(2, 61, 42);
  const output = { slot: 0, direction: "output" } as Ingredient;
  const result = shapedCraftingSlots([
    bottomRight,
    output,
    topLeft,
    middleLeft,
  ]);
  assert.deepEqual(result.inputs, [
    topLeft,
    null,
    null,
    middleLeft,
    null,
    null,
    null,
    null,
    bottomRight,
  ]);
  assert.equal(result.output, output);
  assert.equal(shapedCraftingSlots([]).inputs.length, 9);
  assert.equal(shapedCraftingSlots([]).output, null);
  assert.equal(shapedCraftingSlots([input(4, null, null)]).inputs[4]?.slot, 4);
});
const items = [
  { id: "a", collapsibleGroupId: "wood" },
  { id: "stone", collapsibleGroupId: null },
  { id: "b", collapsibleGroupId: "wood" },
  { id: "c", collapsibleGroupId: "wood" },
];
test("groups collapse to one item and expand all members at the first item's position", () => {
  const closed = catalogTiles(items, new Set());
  assert.deepEqual(
    closed.map((tile) => tile.id),
    ["a", "stone"],
  );
  assert.equal(closed[0].backgroundId, "c");
  assert.equal(closed[0].count, 3);
  const open = catalogTiles(items, new Set(["wood"]));
  assert.deepEqual(
    open.map((tile) => tile.id),
    ["a", "b", "c", "stone"],
  );
  assert.deepEqual(
    open.slice(0, 3).map((tile) => tile.first),
    [true, false, false],
  );
});
test("search does not hide a matching non-representative member", () => {
  const results = catalogTiles(
    items.filter((item) => item.id === "b"),
    new Set(),
  );
  assert.equal(results[0].id, "b");
  assert.equal(results[0].groupId, null);
});
test("expanded groups can span pages without dropping members", () => {
  const many = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    collapsibleGroupId: "all",
  }));
  const results = catalogTiles(many, new Set(["all"]));
  assert.equal(results.slice(104).length, 46);
  assert.equal(new Set(results.map((tile) => tile.id)).size, 150);
});
