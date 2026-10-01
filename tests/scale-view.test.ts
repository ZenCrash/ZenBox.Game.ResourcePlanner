import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleDiagram, createScaleCalculator } from "../lib/scale-view";
import type { Recipe, Ingredient } from "../lib/model";

const recipe = (id: string, input: number, output: number): Recipe => ({ id, name: id, handler: "Test", durationTicks: 20, euPerTick: 0, layout: "", details: "[]", ingredients: [
  { direction: "input", amount: input, consumed: true, chance: 1, slot: 0, itemId: "iron", alternatives: "[]", item: { id: "iron", kind: "item" } } as Ingredient,
  { direction: "output", amount: output, consumed: true, chance: 1, slot: 0, itemId: "iron", alternatives: "[]", item: { id: "iron", kind: "item" } } as Ingredient,
] });
const node = (id: string, input: number, output: number, scaleAmount?: number) => ({ id, type: "recipe", position: { x: 0, y: 0 }, data: { recipe: recipe(id, input, output), machines: 7, variants: {}, scaleAmount } });
const edge = (source: string, target: string, reference = false) => ({ id: source + target, source, target, sourceHandle: "output:0", targetHandle: "input:0", data: { reference } });

test("scale view changes only the pinned production network and preserves normal data", () => {
  const nodes = [node("a", 1, 2), node("b", 3, 4, 2.5), node("c", 5, 1), node("other", 1, 1)];
  const before = JSON.stringify(nodes);
  const result = scaleDiagram(nodes, [edge("a", "b"), edge("b", "c"), edge("c", "other", true)]);
  assert.deepEqual(Object.fromEntries(result.counts), { a: 3.75, b: 2.5, c: 2 });
  assert.equal(result.failed.size, 0);
  assert.equal(result.scaled.has("other"), false);
  assert.equal(JSON.stringify(nodes), before);
  assert.equal(scaleDiagram(nodes.map(n => ({ ...n, data: { ...n.data, scaleAmount: undefined } })), [edge("a", "b")]).counts.size, 0);
});

test("scale view preserves every fixed amount when constraints conflict", () => {
  const result = scaleDiagram([node("a", 1, 2, 1), node("b", 3, 4, 1)], [edge("a", "b")]);
  assert.deepEqual([...result.failed].sort(), ["a", "b"]);
  assert.deepEqual(Object.fromEntries(result.counts), { a: 1, b: 1 });
  assert.equal(result.scaled.size, 0);
});


test("scale tier changes recompute capacity while preserving the normal tier", () => {
  const machines = [32, 128].map((voltage, i) => ({ id: i ? "MV" : "LV", name: i ? "MV" : "LV", registryId: "machine", metadata: i, mod: "GT", group: "", tooltip: JSON.stringify([`Voltage IN: ${voltage} (${i ? "MV" : "LV"})`]), image: null, kind: "item" }));
  const a = node("a", 1, 2, 1), b = node("b", 2, 1);
  const upgraded = { ...a, data: { ...a.data, machineId: "LV", scaleMachineId: "MV", recipe: { ...a.data.recipe, handler: "Assembler", euPerTick: 30, craftingMachines: machines } } };
  const result = scaleDiagram([upgraded, b], [edge("a", "b")]);
  assert.deepEqual(Object.fromEntries(result.counts), { a: 1, b: 2 });
  assert.equal(upgraded.data.machineId, "LV");
});


test("networks without an exact balance still scale their existing proportions", () => {
  const a = node("a", 1, 2, 3.5), b = node("b", 1, 3);
  const result = scaleDiagram([a, b, node("unrelated", 1, 1)], [edge("a", "b"), edge("b", "a")]);
  assert.deepEqual(Object.fromEntries(result.counts), { a: 3.5, b: 3.5 });
  assert.deepEqual([...result.proportional].sort(), ["a", "b"]);
  assert.equal(result.failed.size, 0);
  assert.equal(a.data.machines, 7);
});


test("tier-only changes preserve throughput without requiring a fixed amount", () => {
  const machines = [32, 128, 512].map((voltage, i) => ({ id: ["LV", "MV", "HV"][i], name: ["LV", "MV", "HV"][i], registryId: "machine", metadata: i, mod: "GT", group: "", tooltip: JSON.stringify([`Voltage IN: ${voltage} (${["LV", "MV", "HV"][i]})`]), image: null, kind: "item" }));
  const original = node("a", 1, 2);
  for (const [tier, expected] of [["MV", 50], ["HV", 25]] as const) {
    const changed = { ...original, data: { ...original.data, machines: 100, machineId: "LV", scaleMachineId: tier, recipe: { ...original.data.recipe, handler: "Assembler", durationTicks: 200, euPerTick: 30, craftingMachines: machines } } };
    const result = scaleDiagram([changed], []);
    assert.equal(result.counts.get("a"), expected);
    assert.equal(result.scaled.has("a"), true);
    assert.equal(changed.data.machines, 100);
  }
});


test("cached scaling reuses results across view switches and geometry edits, but invalidates for production edits", () => {
  let calls = 0;
  const calculate = createScaleCalculator((nodes, edges) => { calls++; return scaleDiagram(nodes, edges); });
  const nodes = [node("a", 1, 2, 2), node("b", 2, 1)];
  const edges = [edge("a", "b")];
  const first = calculate(nodes, edges);
  assert.equal(calculate(nodes, edges), first);
  assert.equal(calculate(nodes.map(n => ({ ...n, position: { x: 100, y: 200 }, data: { ...n.data, portRows: { "input:0": 2 } } })), edges.map(e => ({ ...e, selected: true }))), first);
  assert.equal(calls, 1);
  const changed = nodes.map(n => n.id === "a" ? { ...n, data: { ...n.data, scaleAmount: 3 } } : n);
  assert.equal(calculate(changed, edges).counts.get("b"), 3);
  assert.equal(calls, 2);
  calculate(changed, [edge("a", "b", true)]);
  assert.equal(calls, 3);
});
