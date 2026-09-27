import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAutoPlans,
  plannerMachine,
  type PlannerOptions,
} from "../lib/auto-planner";
import type { Item, Ingredient, Recipe } from "../lib/model";
import { parsePlannerFilters } from "../lib/planner-filters";

test("draining oil and filling diesel through an empty bucket is not a fuel conversion", async () => {
  const drain = recipe("drain", ["oil-bucket"], "bucket");
  drain.handler = "Fluid Canner";
  const oil = ingredient("oil", "output", 1000, 1);
  oil.item.kind = "fluid";
  drain.ingredients.push(oil);
  const fill = recipe("fill", ["bucket", "diesel"], "diesel-bucket");
  fill.handler = "Fluid Canner";
  fill.ingredients[1].item.kind = "fluid";
  fill.ingredients[1].amount = 1000;
  const result = await findAutoPlans(
    { ...options, targetId: "diesel-bucket", inputId: "oil-bucket" },
    lookup([drain, fill]),
  );
  assert.equal(result.plans.length, 0);
  const processing = recipe("refine", ["oil"], "diesel", 5);
  processing.ingredients[0].item.kind = "fluid";
  processing.ingredients[0].amount = 1000;
  processing.ingredients[1].item.kind = "fluid";
  processing.ingredients[1].amount = 1000;
  const valid = await findAutoPlans(
    { ...options, targetId: "diesel-bucket", inputId: "oil-bucket" },
    lookup([drain, fill, processing]),
  );
  assert(valid.plans.length > 0);
  assert(
    valid.plans.every((plan) =>
      plan.steps.some((step) => step.recipe.id === "refine"),
    ),
  );
  assert(
    valid.plans.every(
      (plan) => !plan.supplies.some((supply) => supply.item.id === "diesel"),
    ),
  );
  const packaging = await findAutoPlans(
    { ...options, targetId: "bucket", inputId: "oil-bucket" },
    lookup([drain]),
  );
  assert.equal(packaging.plans.length, 1);
});

test("a route cannot rely on an external supply of its desired target", async () => {
  const r = recipe("fake", ["raw", "target"], "target");
  r.ingredients.at(-1)!.amount = 2;
  assert.equal((await findAutoPlans(options, lookup([r]))).plans.length, 0);
});
test("known empty packaging cannot connect unrelated processes of other recipe types", async () => {
  const drain = recipe("reaction-a", ["raw"], "empty-cell");
  const fill = recipe("reaction-b", ["empty-cell", "external-fuel"], "target");
  const result = await findAutoPlans(
    { ...options, packagingItemIds: ["empty-cell"] },
    lookup([drain, fill]),
  );
  assert.equal(result.plans.length, 0);
});

const item = (id: string): Item => ({
  id,
  name: id,
  registryId: id,
  metadata: 0,
  mod: "test",
  group: "",
  tooltip: "[]",
  kind: "item",
  image: null,
});
const ingredient = (
  id: string,
  direction: string,
  amount = 1,
  slot = 0,
): Ingredient => ({
  itemId: id,
  item: item(id),
  direction,
  amount,
  slot,
  chance: 1,
  consumed: true,
  x: null,
  y: null,
  alternatives: "[]",
});
const recipe = (
  id: string,
  inputs: string[],
  output: string,
  eu = 1,
): Recipe => ({
  id,
  name: id,
  handler: "Mixer",
  euPerTick: eu,
  durationTicks: 20,
  layout: "{}",
  details: "[]",
  ingredients: [
    ...inputs.map((id, index) => ingredient(id, "input", 1, index)),
    ingredient(output, "output"),
  ],
});
const options: PlannerOptions = {
  targetId: "target",
  inputId: "raw",
  priority: "eu",
  allowMultiblocks: true,
  maxTier: 14,
  maxSteps: 10,
  maxSuggestions: 10,
  excludedRecipes: [],
  excludedPlans: [],
};
const lookup = (recipes: Recipe[]) => async (id: string) =>
  recipes.filter((recipe) =>
    recipe.ingredients.some((i) => i.direction === "output" && i.itemId === id),
  );

test("banned machines are replaced with eligible alternatives, and banning all rejects the recipe", () => {
  const r = recipe("machines", ["raw"], "target");
  r.craftingMachines = [
    { ...item("lv"), name: "LV Machine" },
    { ...item("mv"), name: "MV Machine" },
  ];
  assert.equal(
    plannerMachine(r, { ...options, bannedMachineIds: ["lv"] })?.machineId,
    "mv",
  );
  assert.equal(
    plannerMachine(r, { ...options, bannedMachineIds: ["lv", "mv"] }),
    null,
  );
  assert.equal(
    plannerMachine(r, { ...options, bannedMachineIds: ["lv"], maxTier: 1 }),
    null,
  );
});
test("fluid and filled targets both participate with capacity-normalized costs", async () => {
  const fluid = recipe("fluid", ["raw"], "fuel", 2);
  fluid.ingredients.at(-1)!.amount = 2000;
  const cell = recipe("cell", ["raw"], "fuel-cell", 5);
  cell.ingredients.at(-1)!.amount = 2;
  const oneLiter = await findAutoPlans(
    {
      ...options,
      targetId: "fuel",
      targetAmounts: { fuel: 1, "fuel-cell": 0.001 },
    },
    lookup([fluid, cell]),
  );
  assert.equal(oneLiter.plans.length, 2);
  assert.equal(oneLiter.plans[0].totalEu, 0.02);
  assert.equal(oneLiter.plans[1].totalEu, 0.05);
  const oneCell = await findAutoPlans(
    {
      ...options,
      targetId: "fuel-cell",
      targetAmounts: { fuel: 1000, "fuel-cell": 1 },
    },
    lookup([fluid, cell]),
  );
  assert.equal(oneCell.plans[0].totalEu, 20);
  assert.equal(oneCell.plans[1].totalEu, 50);
});
test("source fluids and cells normalize all consumed source slots", async () => {
  const r = recipe("both", ["fuel", "fuel-cell"], "target");
  r.ingredients[0].amount = 500;
  const liters = await findAutoPlans(
    {
      ...options,
      inputId: "fuel",
      inputFactors: { fuel: 1, "fuel-cell": 1000 },
    },
    lookup([r]),
  );
  assert(liters.plans.length > 0);
  assert(
    liters.plans.every(
      (plan) => plan.inputAmount === 1500 && !plan.supplies.length,
    ),
  );
  const cells = await findAutoPlans(
    {
      ...options,
      inputId: "fuel-cell",
      inputFactors: { fuel: 0.001, "fuel-cell": 1 },
    },
    lookup([r]),
  );
  assert(cells.plans.every((plan) => plan.inputAmount === 1.5));
});
test("recipe types constrain every step of the route", async () => {
  const a = recipe("a", ["raw"], "middle"),
    b = { ...recipe("b", ["middle"], "target"), handler: "Assembler" };
  assert.equal(
    (
      await findAutoPlans(
        { ...options, recipeTypes: ["Assembler"] },
        lookup([a, b]),
      )
    ).plans.length,
    0,
  );
  assert.equal(
    (
      await findAutoPlans(
        { ...options, recipeTypes: ["Assembler", "Mixer"] },
        lookup([a, b]),
      )
    ).plans.length,
    1,
  );
});
test("stored planner filters roundtrip but exclusions and invalid limits do not persist", () => {
  const parsed = parsePlannerFilters({
    target: item("target"),
    input: item("raw"),
    priority: "yield",
    bannedMachineIds: ["lv"],
    recipeTypes: ["Mixer"],
    maxSteps: "8",
    maxSuggestions: "101",
    maxTier: 100,
    excludedRecipes: ["a"],
    excludedPlans: ["b"],
  });
  assert.equal(parsed.target?.id, "target");
  assert.deepEqual(parsed.bannedMachineIds, ["lv"]);
  assert.deepEqual(parsed.recipeTypes, ["Mixer"]);
  assert.equal(parsed.maxSteps, "8");
  assert.equal(parsed.maxSuggestions, "10");
  assert.equal(parsed.maxTier, 1);
  assert(!("excludedRecipes" in parsed));
  assert(!("excludedPlans" in parsed));
  assert.equal(parsePlannerFilters(null).maxSteps, "10");
});

test("costs include all conversion steps and output probabilities", async () => {
  const a = recipe("a", ["raw"], "middle", 2);
  a.ingredients.at(-1)!.amount = 2;
  const b = recipe("b", ["middle"], "target", 3);
  b.ingredients.at(-1)!.chance = 0.5;
  const result = await findAutoPlans(options, lookup([a, b]));
  assert.equal(result.plans[0].totalEu, 160);
  assert.equal(result.plans[0].inputAmount, 1);
  assert.equal(result.plans[0].links.length, 1);
});
test("branches replace external ingredients and include their energy and source costs", async () => {
  const recipes = [
    recipe("a", ["raw"], "middle"),
    recipe("b", ["middle", "extra"], "target"),
    recipe("c", ["raw"], "extra", 2),
  ];
  const result = await findAutoPlans(options, lookup(recipes));
  const plan = result.plans[0];
  assert.equal(plan.supplies.length, 0);
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.links.length, 2);
  assert.equal(plan.totalEu, 80);
  assert.equal(plan.inputAmount, 2);
});
test("external dependency count takes precedence over EU, then cost ranks alternatives", async () => {
  const result = await findAutoPlans(
    options,
    lookup([
      recipe("cheap", ["raw", "external"], "target", 1),
      recipe("complete", ["raw"], "target", 5),
    ]),
  );
  assert.equal(result.plans[0].steps[0].recipe.id, "complete");
});
test("discarded recipes and plans reveal the next candidate", async () => {
  const recipes = [
    recipe("a", ["raw"], "target", 1),
    recipe("b", ["raw"], "target", 2),
  ];
  const first = await findAutoPlans(
    { ...options, maxSuggestions: 1 },
    lookup(recipes),
  );
  const next = await findAutoPlans(
    { ...options, maxSuggestions: 1, excludedPlans: [first.plans[0].key] },
    lookup(recipes),
  );
  assert.equal(next.plans[0].steps[0].recipe.id, "b");
  const excluded = await findAutoPlans(
    { ...options, excludedRecipes: ["a"] },
    lookup(recipes),
  );
  assert.equal(excluded.plans[0].steps[0].recipe.id, "b");
});
test("step limits, cycles and tier restrictions are respected", async () => {
  const recipes = [
    recipe("a", ["raw"], "middle"),
    recipe("b", ["middle"], "target"),
    recipe("cycle", ["target"], "middle"),
  ];
  assert.equal(
    (await findAutoPlans({ ...options, maxSteps: 1 }, lookup(recipes))).plans
      .length,
    0,
  );
  assert.equal(
    (await findAutoPlans(options, lookup(recipes))).plans[0].steps.length,
    2,
  );
  assert.equal(
    plannerMachine(recipe("hv", ["raw"], "target", 512), {
      ...options,
      maxTier: 1,
    }),
    null,
  );
  assert.equal(
    plannerMachine(
      { ...recipes[0], handler: "Multiblock Mixer" },
      { ...options, allowMultiblocks: false },
    ),
    null,
  );
});
test("yield priority uses input per target and ignores unconsumed molds", async () => {
  const a = recipe("a", ["raw", "mold"], "target", 10);
  a.ingredients[1].consumed = false;
  a.ingredients.at(-1)!.amount = 4;
  const result = await findAutoPlans(
    { ...options, priority: "yield" },
    lookup([a, recipe("b", ["raw"], "target", 1)]),
  );
  assert.equal(result.plans[0].steps[0].recipe.id, "a");
  assert.equal(result.plans[0].inputAmount, 0.25);
  assert.equal(result.plans[0].supplies.length, 0);
});
test("existing byproducts satisfy auxiliary inputs without adding a cyclic edge", async () => {
  const a = recipe("a", ["raw"], "middle");
  a.ingredients.push(ingredient("extra", "output", 1, 1));
  const result = await findAutoPlans(
    options,
    lookup([a, recipe("b", ["middle", "extra"], "target")]),
  );
  assert.equal(result.plans[0].supplies.length, 0);
  assert.equal(result.plans[0].steps.length, 2);
  assert.equal(result.plans[0].links.length, 2);
});
test("alternative input selections retain the chosen variant and interruption is reported", async () => {
  const a = recipe("a", ["other"], "target");
  a.ingredients[0].alternatives = JSON.stringify(["raw"]);
  a.ingredients[0].alternativeItems = [item("raw")];
  const result = await findAutoPlans(options, lookup([a]));
  assert.equal(result.plans[0].steps[0].variants["input:0"], "raw");
  assert.equal(
    (await findAutoPlans(options, lookup([a]), () => true)).limited,
    true,
  );
});


test("preview branches preserve existing graph and connect the exact input slot", async () => {
  const { appendPlannerBranch } = await import("../lib/planner-branch");
  const node = (id: string, r: Recipe, x = 0) => ({ id, type: "recipe" as const, position: { x, y: 0 }, data: { recipe: r, machines: 1, variants: {} } });
  const original = { nodes: [node("same-id", recipe("consumer", ["other", "target"], "final"), 860)], edges: [] };
  const branch = { nodes: [node("same-id", recipe("producer", ["raw"], "target"))], edges: [] };
  const merged = appendPlannerBranch(original, branch, "same-id", 1, "new-");
  assert.equal(merged.nodes.length, 2);
  assert.equal(new Set(merged.nodes.map(n => n.id)).size, 2);
  assert.equal(merged.nodes[0], original.nodes[0]);
  assert.equal(original.edges.length, 0);
  assert.equal(merged.edges[0].targetHandle, "input:1");
  assert.equal(merged.edges[0].source, "new-same-id");
  assert(merged.nodes[1].position.y > merged.nodes[0].position.y);
  assert.throws(() => appendPlannerBranch(original, { nodes: [node("bad", recipe("bad", ["raw"], "wrong"))], edges: [] }, "same-id", 1, "bad-"), /compatible output/);
});

test("preview branch rejects fluid/container substitutions", async () => {
  const { appendPlannerBranch } = await import("../lib/planner-branch");
  const consumer = recipe("consumer", ["cell"], "final");
  consumer.ingredients[0].item.containedFluidIds = ["fuel"];
  const producer = recipe("producer", ["raw"], "fuel");
  producer.ingredients[1].item.kind = "fluid";
  const node = (id: string, r: Recipe) => ({ id, type: "recipe" as const, position: { x: 0, y: 0 }, data: { recipe: r, machines: 1, variants: {} } });
  assert.throws(() => appendPlannerBranch({ nodes: [node("target", consumer)], edges: [] }, { nodes: [node("source", producer)], edges: [] }, "target", 0, "branch-"), /compatible output/);
});

test("exact target suggestions keep cell and fluid outputs separate in both directions", async () => {
  const recipes = [recipe("fluid-maker", ["raw"], "fluid"), recipe("cell-maker", ["raw"], "cell")];
  recipes[0].ingredients[1].item.kind = "fluid";
  for (const targetId of ["fluid", "cell"]) {
    const result = await findAutoPlans({ ...options, targetId, exactTarget: true, targetAmounts: { fluid: 1000, cell: 1 } }, lookup(recipes));
    assert.equal(result.plans.length, 1);
    const step = result.plans[0].steps[0];
    assert.equal(step.recipe.ingredients.find(i => i.direction === "output" && i.slot === step.outputSlot)?.itemId, targetId);
  }
});
