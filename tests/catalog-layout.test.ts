import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogTiles } from "../lib/catalog-layout";
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
