import { test } from "node:test";
import assert from "node:assert/strict";
import { hiddenOverviewItems, type OverviewItem } from "../lib/overview-overlap";
const item = (id: string, order: number, x = 0): OverviewItem => ({ id, itemId: "hydrogen", position: { x, y: 0 }, order, selected: false });
test("only the rear identical item is hidden; selection brings an item forward", () => {
  assert.deepEqual([...hiddenOverviewItems([item("a", 0), item("b", 1)])], ["a"]);
  assert.deepEqual([...hiddenOverviewItems([{ ...item("a", 0), selected: true }, item("b", 1)])], ["b"]);
});
test("separated and different items stay visible", () => {
  assert.equal(hiddenOverviewItems([item("a", 0), item("b", 1, 80)]).size, 0);
  assert.equal(hiddenOverviewItems([item("a", 0), { ...item("b", 1), itemId: "oxygen" }]).size, 0);
});
test("hidden copies do not hide other non-overlapping images", () => {
  assert.deepEqual([...hiddenOverviewItems([item("a", 0, 0), item("b", 1, 60), item("c", 2, 120)])], ["b"]);
});
