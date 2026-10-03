import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAutoPlans,
  plannerMachine,
  type PlannerOptions,
} from "../lib/auto-planner";
import type { Item, Ingredient, Recipe } from "../lib/model";
import { parsePlannerFilters } from "../lib/planner-filters";
import { summarizePlanner, plannerItemPortState, setPlannerItemDisabled } from "../lib/planner-summary";
import type { PlannedGraph } from "../components/auto-recipe-planner";
import { plannerBalance } from "../lib/planner-balance";
import { rate } from "../lib/model";

test("wizard scales all recipes up to whole balanced machine counts", async () => {
  const producer = recipe("producer", ["raw"], "intermediate");
  producer.durationTicks = 60;
  producer.ingredients.at(-1)!.amount = 2;
  const consumer = recipe("consumer", ["intermediate"], "target");
  const result = await findAutoPlans(options, lookup([producer, consumer]));
  const plan = result.plans[0];
  const balance = plannerBalance(plan);
  assert.deepEqual(balance.machines, [3, 2]);
  assert.equal(balance.targetPerSecond, 2);
  assert.equal(rate(producer.ingredients.at(-1)!, producer, balance.machines[0]), rate(consumer.ingredients[0], consumer, balance.machines[1]));
});

test("EU priority compares cost per target output rather than cost per recipe batch", async () => {
  const small = recipe("small", ["raw"], "target", 2);
  const bulk = recipe("bulk", ["raw"], "target", 6);
  bulk.ingredients.at(-1)!.amount = 4;
  const result = await findAutoPlans({ ...options, priorities: ["eu", "output", "yield", "singleblock"] }, lookup([small, bulk]));
  assert.equal(result.plans[0].steps[0].recipe.id, "bulk");
  assert.equal(result.plans[0].totalEu, 30);
});

test("balanced counts and EU cost account for parallel batches", async () => {
  const producer = recipe("parallel", ["raw"], "intermediate", 8);
  producer.parallel = 4;
  const consumer = recipe("consumer", ["intermediate"], "target", 1);
  const result = await findAutoPlans(options, lookup([producer, consumer]));
  const plan = result.plans[0];
  assert.deepEqual(plannerBalance(plan).machines, [1, 4]);
  assert.equal(plan.totalEu, 60);
});

test("reordered wizard priorities change ranking and skip yield without inputs", async () => {
  const cheap = recipe("cheap", ["raw"], "target", 1);
  const large = recipe("large", ["raw"], "target", 20);
  large.ingredients.at(-1)!.amount = 4;
  const outputFirst = await findAutoPlans({ ...options, inputId: undefined, priorities: ["yield", "output", "eu", "singleblock"] }, lookup([cheap, large]));
  assert.equal(outputFirst.plans[0].steps[0].recipe.id, "large");
  const costFirst = await findAutoPlans({ ...options, priorities: ["eu", "output", "yield", "singleblock"] }, lookup([cheap, large]));
  assert.equal(costFirst.plans[0].steps[0].recipe.id, "cheap");
  cheap.handler = "Industrial Mixer";
  const singleFirst = await findAutoPlans({ ...options, priorities: ["singleblock", "eu", "output", "yield"] }, lookup([cheap, large]));
  assert.equal(singleFirst.plans[0].steps[0].recipe.id, "large");
});

test("priority order persists and rejects duplicate criteria", () => {
  const priorities = ["singleblock", "yield", "output", "eu"];
  assert.deepEqual(parsePlannerFilters({ priorities }).priorities, priorities);
  assert.equal(parsePlannerFilters({ priorities: ["eu", "eu", "yield", "output"] }).priorities, undefined);
});

test("generator fuel and large boiler recipes are excluded from direct and nested wizard routes", async () => {
  for (const handler of ["Combustion Generator Fuels", "Combustion Generator Fue...", "Semifluid Generator Fuels", "Gas Turbine Fuel", "Large Boiler"]) {
    const fuel = { ...recipe("fuel", ["raw"], "fuel-output"), handler };
    assert.equal(plannerMachine(fuel, options), null);
    const direct = await findAutoPlans({ ...options, targetId: "fuel-output", inputId: undefined }, lookup([fuel]));
    assert.equal(direct.plans.length, 0);
    const main = recipe("main", ["raw", "fuel-output"], "target");
    const nested = await findAutoPlans(options, lookup([fuel, main]));
    assert(nested.plans.length > 0);
    assert(nested.plans.every(plan => plan.steps.every(step => step.recipe.id !== "fuel")));
  }
});

test("preview summary covers every node and disables matching ports and connections", () => {
  const graph: PlannedGraph = {
    nodes: [recipe("a", ["raw"], "intermediate"), recipe("b", ["intermediate"], "target")].map((r, index) => ({
      id: r.id, type: "recipe", position: { x: index * -2000, y: index * 5000 },
      data: { recipe: r, machines: 1, variants: {} },
    })),
    edges: [{ id: "connection", source: "a", target: "b", sourceHandle: "output:0", targetHandle: "input:0" }],
    ignoredItems: ["raw"],
  };
  const summary = summarizePlanner(graph);
  assert.equal(summary.recipeCount, 2);
  assert.equal(summary.euPerTick, 2);
  assert.equal(summary.totalEu, 40);
  assert.deepEqual(summary.inputs.map(row => row.item.id), ["raw"]);
  assert.deepEqual(plannerItemPortState(graph, "intermediate"), { hasEnabled: true, hasDisabled: false });
  const disabled = setPlannerItemDisabled(graph, "intermediate", true);
  assert.equal(disabled.edges.length, 0);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(disabled.ignoredItems, ["raw"]);
  assert.deepEqual(summarizePlanner(disabled).disabled.map(row => row.item.id), ["intermediate"]);
  assert.deepEqual(plannerItemPortState(disabled, "intermediate"), { hasEnabled: false, hasDisabled: true });
  const enabled = setPlannerItemDisabled(disabled, "intermediate", false);
  assert.equal(summarizePlanner(enabled).disabled.length, 0);
  assert.equal(enabled.edges.length, 0);
});

test("singleblocks break otherwise equal planner ties without overriding EU cost", async () => {
  const multi = recipe("a-multi", ["raw"], "target", 1);
  multi.handler = "Industrial Mixer";
  const single = recipe("z-single", ["raw"], "target", 1);
  for (const priority of ["eu", "yield", "output"] as const) {
    const tied = await findAutoPlans({ ...options, priority }, lookup([multi, single]));
    assert.equal(tied.plans[0].steps[0].recipe.id, "z-single");
    const expensiveSingle = { ...single, euPerTick: 2 };
    const cost = await findAutoPlans({ ...options, priority }, lookup([multi, expensiveSingle]));
    assert.equal(cost.plans[0].steps[0].recipe.id, "a-multi");
  }
});

test("equally efficient machine choices prefer a singleblock", () => {
  const r = recipe("machine-choice", ["raw"], "target");
  r.craftingMachines = [
    { ...item("a-controller"), name: "Industrial Mixer Controller" },
    { ...item("z-single"), name: "Simple Mixer", registryId: "minecraft:mixer" },
  ];
  assert.equal(plannerMachine(r, options)?.machineId, "z-single");
});

test("container filling cannot stand alone or begin main or nested routes", async () => {
  for (const handler of ["Fluid Canner", "Bottler", "Other container filler"]) {
    const fill = recipe("fill", ["gas", "empty-cell"], "gas-cell");
    fill.handler = handler;
    fill.ingredients[0].item.kind = "fluid";
    fill.ingredients.at(-1)!.item.containedFluidIds = ["gas"];
    const consume = recipe("consume", ["gas-cell"], "target");
    for (const inputIds of [[], ["gas"]]) {
      const standalone = await findAutoPlans({ ...options, inputId: undefined, inputIds, targetId: "gas-cell", exactTarget: true }, lookup([fill]));
      assert.equal(standalone.plans.length, 0, handler);
    }
    const route = await findAutoPlans({ ...options, inputId: "gas" }, lookup([fill, consume]));
    assert.equal(route.plans.length, 0, handler);
    const produce = recipe("produce", ["raw"], "gas");
    produce.ingredients.at(-1)!.item.kind = "fluid";
    const valid = await findAutoPlans({ ...options, targetId: "gas-cell", exactTarget: true }, lookup([produce, fill]));
    assert(valid.plans.some(plan => plan.steps.map(step => step.recipe.id).join() === "produce,fill"), handler);
    const main = recipe("main", ["raw", "gas-cell"], "target");
    const nested = await findAutoPlans({ ...options, inputId: undefined, inputIds: ["raw", "gas"] }, lookup([main, fill]));
    assert(nested.plans.length > 0);
    assert(nested.plans.every(plan => plan.steps.every(step => step.recipe.id !== "fill")), handler);
  }
});

test("most output ranks batch output first and total EU cost second without an input", async () => {
  const small = recipe("small", ["ore"], "target", 1);
  const large = recipe("large", ["ore"], "target", 20);
  large.ingredients.at(-1)!.amount = 4;
  const cheaperLarge = recipe("cheaper-large", ["ore"], "target", 10);
  cheaperLarge.ingredients.at(-1)!.amount = 4;
  const result = await findAutoPlans(
    { ...options, inputId: undefined, priority: "output" }, lookup([small, large, cheaperLarge]),
  );
  assert.deepEqual(result.plans.map(plan => plan.steps[0].recipe.id), ["cheaper-large", "large", "small"]);
  assert.equal(result.plans[0].outputPerBatch, 4);
  assert.equal(parsePlannerFilters({ priority: "output" }).priority, "output");
});

test("yield ties prioritize total EU cost", async () => {
  const cheap = recipe("cheap", ["raw"], "target", 1);
  const costly = recipe("costly", ["raw"], "target", 10);
  const result = await findAutoPlans({ ...options, priority: "yield" }, lookup([cheap, costly]));
  assert.equal(result.plans[0].steps[0].recipe.id, "cheap");
});

test("multiple selected inputs supply separate branches without external requirements", async () => {
  const recipes = [
    recipe("left", ["raw-a"], "intermediate-a"),
    recipe("right", ["raw-b"], "intermediate-b"),
    recipe("combine", ["intermediate-a", "intermediate-b"], "target"),
  ];
  const result = await findAutoPlans(
    { ...options, inputId: undefined, inputIds: ["raw-a", "raw-b"] },
    lookup(recipes),
  );
  const complete = result.plans.find(plan => plan.supplies.length === 0);
  assert(complete);
  assert.deepEqual(new Set(complete.steps.map(step => step.recipe.id)), new Set(["left", "right", "combine"]));
  assert.equal(complete.inputAmount, 2);
});

test("selected auxiliary inputs count toward combined yield without being external supplies", async () => {
  const result = await findAutoPlans(
    { ...options, inputId: undefined, inputIds: ["raw-a", "raw-b"], priority: "yield" },
    lookup([recipe("combine", ["raw-a", "raw-b"], "target")]),
  );
  assert(result.plans.length > 0);
  for (const plan of result.plans) {
    assert.equal(plan.inputAmount, 2);
    assert.equal(plan.supplies.length, 0);
  }
});

test("planner filters retain multiple inputs", () => {
  const inputs = [item("raw-a"), item("raw-b")];
  assert.deepEqual(parsePlannerFilters({ inputs }).inputs, inputs);
});

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


test("all target forms are checked before following a promising deep route", async () => {
  const visited: string[] = [];
  const candidates = [recipe("fluid-route", ["intermediate"], "fuel"), recipe("cell-route", ["raw"], "fuel-cell")];
  await findAutoPlans({ ...options, targetId: "fuel", targetAmounts: { fuel: 1, "fuel-cell": 0.001 }, nearInputIds: ["intermediate"] }, async id => {
    visited.push(id);
    return lookup(candidates)(id);
  }, () => visited.length >= 2);
  assert.deepEqual(visited.slice(0, 2), ["fuel", "fuel-cell"]);
});

test("initial searches match both source and target forms in either direction", async () => {
  const recipes = [recipe("cell-input", ["raw-cell"], "fuel"), recipe("fluid-input", ["raw-fluid"], "fuel-cell")];
  for (const inputId of ["raw-fluid", "raw-cell"]) for (const targetId of ["fuel", "fuel-cell"]) {
    const result = await findAutoPlans({ ...options, inputId, targetId,
      inputFactors: inputId === "raw-cell" ? { "raw-cell": 1, "raw-fluid": 0.001 } : { "raw-fluid": 1, "raw-cell": 1000 },
      targetAmounts: targetId === "fuel-cell" ? { "fuel-cell": 1, fuel: 1000 } : { fuel: 1, "fuel-cell": 0.001 },
    }, lookup(recipes));
    assert.deepEqual(new Set(result.plans.map(plan => plan.steps[0].recipe.id)), new Set(["cell-input", "fluid-input"]));
  }
});


test("making both fuel ingredients outranks buying one even when filling introduces empty cells", async () => {
  const heavy = recipe("heavy", ["raw", "hydrogen"], "heavy-fuel");
  const light = recipe("light", ["raw", "hydrogen"], "light-fuel");
  const fill = recipe("fill-light", ["light-fuel", "empty-cell"], "light-cell");
  fill.handler = "Fluid Canner";
  fill.ingredients[0].item.kind = "fluid";
  const mixer = recipe("diesel", ["heavy-fuel", "light-cell"], "target");
  for (const priority of ["eu", "yield"] as const) {
    const result = await findAutoPlans({ ...options, priority, maxSuggestions: 1, packagingItemIds: ["empty-cell"] }, lookup([heavy, light, fill, mixer]));
    const plan = result.plans[0];
    assert.deepEqual(new Set(plan.steps.map(step => step.recipe.id)), new Set(["heavy", "light", "fill-light", "diesel"]));
    assert.deepEqual(new Set(plan.supplies.map(supply => supply.item.id)), new Set(["hydrogen", "empty-cell"]));
    const mixerIndex = plan.steps.findIndex(step => step.recipe.id === "diesel");
    assert.equal(plan.links.filter(link => link.target === mixerIndex).length, 2);
    assert.equal(plan.inputAmount, 2);
    assert.equal(plan.totalEu, 80);
  }
});


test("byproduct recovery closes a hydrogen loop only when every recovery input is supplied", async () => {
  const process = recipe("process", ["raw", "hydrogen"], "target");
  process.ingredients.push(ingredient("sulfide", "output", 1, 1), ingredient("empty-cell", "output", 1, 2));
  const recovery = recipe("electrolyzer", ["sulfide", "empty-cell"], "hydrogen", 2);
  for (const outputAmount of [0.5, 1, 2]) {
    recovery.ingredients.at(-1)!.amount = outputAmount;
    const result = await findAutoPlans({ ...options, packagingItemIds: ["empty-cell"] }, lookup([process, recovery]));
    const plan = result.plans[0];
    if (outputAmount < 1) {
      assert(plan.supplies.some(s => s.item.id === "hydrogen"));
      assert.equal(plan.steps.length, 1);
    } else {
      assert.equal(plan.supplies.length, 0);
      assert.equal(plan.steps.length, 2);
      assert.equal(plan.links.length, 3);
      assert.equal(plan.steps[1].cycles, 1 / outputAmount);
      assert.equal(plan.totalEu, 20 + 40 / outputAmount);
      assert.equal(plan.inputAmount, 1);
    }
  }
  recovery.ingredients.at(-1)!.amount = 1;
  for (const overrides of [{ maxSteps: 1 }, { excludedRecipes: ["electrolyzer"] }, { maxTier: 0 }]) {
    const blockedRecovery = { ...recovery, euPerTick: 120 };
    const result = await findAutoPlans({ ...options, ...overrides }, lookup([process, blockedRecovery]));
    assert(result.plans[0].supplies.some(s => s.item.id === "hydrogen"));
  }
});

test("recovery does not turn an empty container into missing fuel through an incomplete bottler export", async () => {
  const process = recipe("process", ["raw", "fuel-cell"], "target");
  process.ingredients.push(ingredient("empty-cell", "output", 1, 1));
  const bottler = { ...recipe("bottler", ["empty-cell"], "fuel-cell"), handler: "Bottler" };
  const result = await findAutoPlans(options, lookup([process, bottler]));
  assert(result.plans.every(p => p.supplies.some(s => s.item.id === "fuel-cell")));
});

test("recovery cannot spend byproducts already used by another input", async () => {
  const process = recipe("process", ["raw"], "middle");
  process.ingredients.push(ingredient("byproduct", "output", 1, 1));
  const consumer = recipe("consumer", ["middle", "byproduct", "extra"], "target");
  const recovery = recipe("recovery", ["byproduct"], "extra");
  const result = await findAutoPlans(options, lookup([process, consumer, recovery]));
  assert(result.plans[0].supplies.some(s => s.item.id === "extra"));
});

test("preview placement supports recycling feedback without recursion loops", async () => {
  const { plannerColumns } = await import("../lib/planner-columns");
  const links = [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 2, target: 1 }, { source: 1, target: 3 }];
  const columns = plannerColumns(4, links);
  assert.equal(columns.size, 4);
  assert([...columns.values()].every(n => Number.isFinite(n) && n >= 0));
  assert.equal(links.length, 4);
});
