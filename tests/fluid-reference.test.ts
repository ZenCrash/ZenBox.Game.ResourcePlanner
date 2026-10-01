import { test } from "node:test";
import assert from "node:assert/strict";
import { blankDiagram, diagramSchema, fluidReferenceCompatible, portsCompatible, resolveDiagramVariants, connectionColors, type Item, type Ingredient, type Recipe } from "../lib/model";
import { fluidReferenceFlow, fluidReferenceInputRates } from "../lib/fluid-reference";
import { perfectMachineCounts, stepMachineRatio } from "../lib/perfect-ratio";
import { summarizeArea, summaryRecipe } from "../lib/area-summary";
import { pasteSelection } from "../lib/editor-clipboard";

const fluid: Item = { id: "fluid:oil", kind: "fluid", name: "Oil", image: null, registryId: "oil", metadata: 0, mod: "test", group: "", tooltip: "[]" };
const cell: Item = { ...fluid, id: "oil-cell", name: "Oil Cell", kind: "item", containedFluidIds: [fluid.id], fluidContents: [{ fluidId: fluid.id, liters: 1000 }] };
const ingredient = (item: Item, direction: string): Ingredient => ({ item, itemId: item.id, direction, slot: 0, amount: item.kind === "fluid" ? 1000 : 1, chance: 1, consumed: true, x: null, y: null, alternatives: "[]" });

test("reference colors convert both directions into liters using real container capacity", () => {
  const recipe = { ...summaryRecipe, durationTicks: 20 };
  for (const [a, b] of [[fluid, cell], [cell, fluid]]) {
    const output = ingredient(a, "output"), input = ingredient(b, "input");
    const balanced = fluidReferenceFlow(output, recipe, 1, input, recipe, 1);
    assert.equal(balanced.color, connectionColors.balanced);
    assert.equal(balanced.supplied, 1000);
    assert.equal(balanced.needed, 1000);
    assert.equal(fluidReferenceFlow(output, recipe, 1, input, recipe, 2).color, connectionColors.shortage);
    assert.equal(fluidReferenceFlow(output, recipe, 2, input, recipe, 1).color, connectionColors.surplus);
  }
  const smallContainer = { ...cell, fluidContents: [{ fluidId: fluid.id, liters: 144 }] };
  assert.equal(fluidReferenceFlow(ingredient(smallContainer, "output"), recipe, 1,
    { ...ingredient(fluid, "input"), amount: 144 }, recipe, 1).color, connectionColors.balanced);
});

test("reference colors include chance, timing and parallel operation without inventing capacity", () => {
  const recipe = { ...summaryRecipe, durationTicks: 20 };
  const output = { ...ingredient(cell, "output"), chance: 0.5 };
  const input = ingredient(fluid, "input");
  assert.equal(fluidReferenceFlow(output, { ...recipe, parallel: 2 }, 1, input, recipe, 1).color, connectionColors.balanced);
  assert.equal(fluidReferenceFlow(output, recipe, 1, input, recipe, 1).color, connectionColors.shortage);
  assert.equal(fluidReferenceFlow(output, { ...recipe, durationTicks: 0 }, 1, input, recipe, 1).color, connectionColors.unrated);
  assert.equal(fluidReferenceFlow(ingredient({ ...cell, fluidContents: undefined }, "output"), recipe, 1, input, recipe, 1).color, connectionColors.unrated);
});

test("info-inclusive ratio actions combine real and converted suppliers in the input's units", () => {
  const recipe = { ...summaryRecipe, durationTicks: 20 };
  const input = { ...ingredient(cell, "input"), amount: 3 };
  const converted = fluidReferenceInputRates(ingredient(fluid, "output"), recipe, input, recipe);
  assert.deepEqual(converted, { supply: 1, demand: 3 });
  assert.deepEqual(perfectMachineCounts("b", [{ source: "a", input: "input:0", ...converted }]), { b: 1, a: 3 });
  const base = perfectMachineCounts("b", [
    { source: "a", input: "input:0", ...converted },
    { source: "c", input: "input:0", supply: 1, demand: 3 },
  ])!;
  assert.deepEqual(base, { b: 2, a: 3, c: 3 });
  assert.deepEqual(stepMachineRatio(base, base, 1), { b: 4, a: 6, c: 6 });
  assert.deepEqual(fluidReferenceInputRates(ingredient(cell, "output"), recipe, ingredient(fluid, "input"), recipe), { supply: 1000, demand: 1000 });
});

test("reference matching works in both directions without making cells production substitutes", () => {
  for (const [a, b] of [[fluid, cell], [cell, fluid]]) {
    assert(fluidReferenceCompatible(ingredient(a, "output"), ingredient(b, "input")));
    assert(!portsCompatible(ingredient(a, "output"), ingredient(b, "input")));
  }
  for (const other of [{ ...cell, containedFluidIds: [] }, { ...cell, containedFluidIds: ["fluid:water"] }, fluid]) {
    assert(!fluidReferenceCompatible(ingredient(fluid, "output"), ingredient(other, "input")));
  }
});

test("saved references preserve variants, survive copy, and do not cancel area resources", () => {
  const producer: Recipe = { ...summaryRecipe, id: "producer", durationTicks: 20, ingredients: [ingredient(fluid, "output")] };
  const consumer: Recipe = { ...summaryRecipe, id: "consumer", durationTicks: 20, ingredients: [ingredient(cell, "input")] };
  const source = crypto.randomUUID(), target = crypto.randomUUID();
  const document = diagramSchema.parse({ ...blankDiagram(), nodes: [
    { id: source, recipeId: producer.id, machines: 1, position: { x: 0, y: 0 } },
    { id: target, recipeId: consumer.id, machines: 1, position: { x: 200, y: 0 }, variants: { "input:0": cell.id } },
  ], edges: [{ id: crypto.randomUUID(), source, target, sourceHandle: "output:0", targetHandle: "input:0", reference: true }] });
  const resolved = resolveDiagramVariants(document, [producer, consumer]);
  assert.equal(resolved.nodes[1].variants["input:0"], cell.id);
  assert.equal(diagramSchema.parse(JSON.parse(JSON.stringify(resolved))).edges[0].reference, true);
  const copied = pasteSelection({ nodes: resolved.nodes.map((node) => ({ ...node, data: {} })), edges: resolved.edges.map((edge) => ({ ...edge, data: { reference: edge.reference } })) }, { x: 500, y: 500 }, () => crypto.randomUUID());
  assert.equal(copied.edges[0].data.reference, true);
  const summary = summarizeArea({ position: { x: 0, y: 0 }, width: 1000, height: 1000 }, resolved.nodes.map((node, index) => ({ ...node, width: 100, height: 100, recipe: [producer, consumer][index] })));
  assert.equal(summary.inputs.find((entry) => entry.item.id === cell.id)?.rate, 1);
  assert.equal(summary.outputs.find((entry) => entry.item.id === fluid.id)?.rate, 1000);
  assert.throws(() => resolveDiagramVariants({ ...document, edges: document.edges.map((edge) => ({ ...edge, reference: false })) }, [producer, consumer]));
  assert.throws(() => resolveDiagramVariants(document, [producer, { ...consumer, ingredients: [ingredient({ ...cell, containedFluidIds: [] }, "input")] }]));
});


test("whole-network ratios include container conversions and info-only branches", async () => {
  const { connectedMachines, networkMachineCounts } = await import("../lib/network-ratio");
  const recipe = { ...summaryRecipe, durationTicks: 20 };
  const converted = fluidReferenceInputRates({ ...ingredient(fluid, "output"), amount: 2000 }, recipe, { ...ingredient(cell, "input"), amount: 3 }, recipe)!;
  const edges = [{ source: "a", target: "b", data: { reference: true } }, { source: "b", target: "c" }, { source: "unrelated", target: "other" }];
  const ids = connectedMachines("b", edges, true);
  assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
  assert.deepEqual([...connectedMachines("b", edges)].sort(), ["b", "c"]);
  const base = networkMachineCounts([{ source: "a", target: "b", input: "0", ...converted }, { source: "b", target: "c", input: "0", supply: 4, demand: 5 }])!;
  assert.deepEqual(base, { a: 15, b: 10, c: 8 });
  assert.deepEqual(stepMachineRatio(base, base, -1), { a: 1, b: 1, c: 1 });
  assert.deepEqual(stepMachineRatio(base, base, 1), { a: 30, b: 20, c: 16 });
});
