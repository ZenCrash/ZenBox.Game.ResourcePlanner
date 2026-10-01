import test from "node:test";
import assert from "node:assert/strict";
import { AreaSummaryCache } from "../lib/area-summary-cache";
import { summaryRecipe, type SummaryRecipe } from "../lib/area-summary";

test("moving and resizing reuse totals until membership or configuration changes", () => {
  const cache = new AreaSummaryCache();
  const node: SummaryRecipe = { position: { x: 20, y: 20 }, width: 100, height: 100, recipe: summaryRecipe, machines: 1, variants: {} };
  const area = { position: { x: 0, y: 0 }, width: 500, height: 500 };
  const original = cache.get("group", area, [node]);
  assert.equal(cache.get("group", { ...area, width: 600 }, [{ ...node, position: { x: 40, y: 30 } }]), original);
  const increased = cache.get("group", area, [{ ...node, machines: 2 }]);
  assert.notEqual(increased, original);
  assert.equal(increased.machineCount, 2);
  const outside = cache.get("group", { ...area, width: 50 }, [node]);
  assert.equal(outside.recipeCount, 0);
  cache.retain(new Set());
  assert.notEqual(cache.get("group", { ...area, width: 50 }, [node]), outside);
});


test("group interaction freezes totals until release even when bounds or member counts change", () => {
  const cache = new AreaSummaryCache();
  const node: SummaryRecipe = { position: { x: 20, y: 20 }, width: 100, height: 100, recipe: summaryRecipe, machines: 1, variants: {} };
  const area = { position: { x: 0, y: 0 }, width: 500, height: 500 };
  const original = cache.get("group", area, [node]);
  const moved = { ...area, position: { x: 1000, y: 1000 } };
  assert.equal(cache.get("group", moved, [node], true), original);
  assert.equal(cache.get("group", { ...area, width: 50 }, [node], true), original);
  assert.equal(cache.get("group", area, [{ ...node, machines: 10 }], true), original);
  assert.equal(cache.get("group", moved, [node], false).recipeCount, 0);
  assert.equal(cache.get("group", area, [{ ...node, machines: 10 }], false).machineCount, 10);
});


test("supply changes invalidate cached summaries and still freeze during interaction", () => {
  const cache = new AreaSummaryCache();
  const area = { position: { x: 0, y: 0 }, width: 500, height: 500 };
  const node: SummaryRecipe = { position: { x: 20, y: 20 }, width: 100, height: 100, recipe: summaryRecipe, machines: 1, variants: {}, utilization: 1 };
  const original = cache.get("group", area, [node]);
  const limited = { ...node, utilization: 0.25 };
  assert.equal(cache.get("group", area, [limited], true), original);
  const updated = cache.get("group", area, [limited]);
  assert.notEqual(updated, original);
  assert.equal(cache.get("group", area, [{ ...limited }]), updated);
});
