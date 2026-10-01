import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionSummary, isSupplyLimited } from "../lib/connection-summary";
import { productionRates } from "../lib/production-rates";

test("connected input shortages limit every output and propagate through downstream recipes", () => {
  const ingredient = (direction: string, amount: number, slot = 0) => ({ direction, amount, slot, consumed: true, chance: 1, itemId: "iron", item: { name: "Iron", kind: "item" } } as Ingredient);
  const machine = (id: string, consumed: number, produced: number) => ({ id, machines: 1, recipe: { durationTicks: 20, ingredients: [ingredient("input", consumed), ingredient("output", produced)] } as Recipe });
  const a = machine("a", 1, 2), b = machine("b", 4, 10), c = machine("c", 10, 6);
  const connect = (source: string, target: string) => ({ source, target, sourceHandle: "output:0", targetHandle: "input:0" });
  const edges = [connect("a", "b"), connect("b", "c")];
  const result = productionRates([a, b, c], edges);
  assert.equal(result.get("a"), 1);
  assert.equal(result.get("b"), 0.5);
  assert.equal(result.get("c"), 0.5);
  const summary = connectionSummary(b.recipe.ingredients[1], b.recipe, 1, c.recipe.ingredients[0], c.recipe, 1, result.get("b"), result.get("c"));
  assert.equal(summary.from, "5 items/s");
  assert.equal(summary.target, "5 items/s");
  assert.deepEqual(summary.fullSupply, { from: "10 items/s", target: "10 items/s" });
  assert.equal(productionRates([a, b, c], []).get("b"), 1);
  assert.equal(productionRates([{ ...a, machines: 2 }, b, c], edges).get("c"), 1);
});

test("suppliers combine per input and the scarcest connected ingredient limits throughput", () => {
  const ingredient = (direction: string, amount: number, slot = 0, consumed = true) => ({ direction, amount, slot, consumed, chance: 1 } as Ingredient);
  const source = (id: string, amount: number) => ({ id, machines: 1, recipe: { durationTicks: 20, ingredients: [ingredient("output", amount)] } as Recipe });
  const target = { id: "t", machines: 1, recipe: { durationTicks: 20, ingredients: [ingredient("input", 10), ingredient("input", 8, 1), ingredient("output", 4)] } as Recipe };
  const nodes = [source("a", 3), source("b", 2), source("c", 2), target];
  const edges = ["a", "b", "c"].map(source => ({ source, target: "t", sourceHandle: "output:0", targetHandle: source === "c" ? "input:1" : "input:0" }));
  assert.equal(productionRates(nodes, edges).get("t"), 0.25);
  assert.equal(productionRates(nodes, edges.map(edge => ({ ...edge, data: { reference: true } }))).get("t"), 1);
  assert.equal(productionRates(nodes.map(node => node.id === "t" ? { ...node, disabledPorts: ["input:1"] } : node), edges).get("t"), 0.5);
  assert.equal(productionRates(nodes.map(node => node.id === "c" ? { ...node, recipe: { ...node.recipe, durationTicks: 0 } } : node), edges).get("t"), 0.5);
});
import {
  blankDiagram,
  diagramSchema,
  itemColor,
  acceptedItemIds,
  createPortColorResolver,
  portsCompatible,
  rate,
  ratio,
  connectionColor,
  connectionColors,
  hasRecipeTiming,
  hasIngredientPort,
  type Ingredient,
  type Recipe,
} from "../lib/model";
const output = {
  direction: "output",
  amount: 2,
  chance: 1,
  consumed: true,
} as Ingredient;
const input = {
  direction: "input",
  amount: 1,
  chance: 1,
  consumed: true,
} as Ingredient;
const producer = { durationTicks: 100 } as Recipe;
const consumer = { durationTicks: 20 } as Recipe;

test("full-supply details appear only for limited, rated, consumed ingredients", () => {
  const item = { name: "Iron", kind: "item" } as Ingredient["item"];
  const result = connectionSummary({ ...output, item }, producer, 5, { ...input, item }, consumer, 3, 0, 1);
  assert.equal(result.from, "0 items/s");
  assert.deepEqual(result.fullSupply, { from: "2 items/s", target: "3 items/s" });
  assert.equal(connectionSummary({ ...output, item }, producer, 5, { ...input, item }, consumer, 3).fullSupply, undefined);
  assert.equal(isSupplyLimited(output, producer, 1 - 1e-12), false);
  assert.equal(isSupplyLimited({ ...input, consumed: false }, consumer, 0.5), false);
  assert.equal(isSupplyLimited(output, { ...producer, durationTicks: 0 }, 0.5), false);
});

test("connection summary separates machine ratio from actual from/target rates", () => {
  const item = { name: "§aIron Dust", kind: "item" } as Ingredient["item"];
  assert.deepEqual(
    connectionSummary(
      { ...output, item },
      producer,
      5,
      { ...input, item },
      consumer,
      3,
    ),
    {
      item: "Iron Dust",
      ratio: "5 : 2",
      from: "2 items/s",
      target: "3 items/s",
    },
  );
  const fluid = { ...item, kind: "fluid" };
  const summary = connectionSummary(
    { ...output, item: fluid },
    { durationTicks: 0 } as Recipe,
    1,
    { ...input, item: fluid },
    consumer,
    2,
  );
  assert.equal(summary.from, "Unspecified");
  assert.equal(summary.target, "2 mB/s");
  assert.equal(summary.ratio, "Unrated");
  assert.equal(
    connectionSummary(
      { ...output, item },
      producer,
      3.75,
      { ...input, item },
      consumer,
      1.25,
    ).from,
    `${(1.5).toLocaleString(undefined, { maximumFractionDigits: 3 })} items/s`,
  );
  assert.equal(
    connectionSummary(
      { ...output, item },
      producer,
      0,
      { ...input, item },
      consumer,
      1.25,
    ).target,
    `${(1.25).toLocaleString(undefined, { maximumFractionDigits: 3 })} items/s`,
  );
});
test("programmed circuit inputs have no ports while ordinary circuit ingredients retain theirs", () => {
  const programmed = {
    ...input,
    item: { registryId: "gregtech:gt.integrated_circuit" },
  } as Ingredient;
  assert.equal(hasIngredientPort(programmed), false);
  assert.equal(hasIngredientPort({ ...programmed, direction: "output" }), true);
  assert.equal(
    hasIngredientPort({
      ...programmed,
      item: { ...programmed.item, registryId: "gregtech:gt.metaitem.01" },
    }),
    true,
  );
});
test("machine ratios account for duration and stack amount", () => {
  assert.equal(ratio(output, producer, input, consumer), "5 : 2");
  assert.equal(rate(output, producer, 5), 2);
  assert.equal(rate(input, consumer, 2), 2);
});
test("chance outputs use expected rate and zero machines stay zero", () => {
  assert.equal(rate({ ...output, chance: 0.25 }, producer, 10), 1);
  assert.equal(rate(output, producer, 0), 0);
});

test("connection colors compare production and consumption with actual machine counts", () => {
  assert.equal(
    connectionColor(output, producer, 1, input, consumer, 1),
    connectionColors.shortage,
  );
  assert.equal(
    connectionColor(output, producer, 5, input, consumer, 2),
    connectionColors.balanced,
  );
  assert.equal(
    connectionColor(output, producer, 6, input, consumer, 2),
    connectionColors.surplus,
  );
  assert.equal(
    connectionColor(output, producer, 0, input, consumer, 1),
    connectionColors.shortage,
  );
  assert.equal(
    connectionColor(output, producer, 0, input, consumer, 0),
    connectionColors.balanced,
  );
  assert.equal(
    connectionColor(
      { ...output, chance: 0.5 },
      producer,
      5,
      input,
      consumer,
      2,
    ),
    connectionColors.shortage,
  );
});

test("missing or invalid timing on either end always makes the connection gray", () => {
  for (const durationTicks of [0, -1, NaN, Infinity, undefined]) {
    const missing = { durationTicks } as Recipe;
    assert.equal(hasRecipeTiming(missing), false);
    assert.equal(
      connectionColor(output, missing, 0, input, consumer, 0),
      connectionColors.unrated,
    );
    assert.equal(
      connectionColor(output, producer, 10, input, missing, 1),
      connectionColors.unrated,
    );
  }
});

test("balance tolerates arithmetic noise without hiding tiny production shortages", () => {
  const onePerSecond = { ...output, amount: 1 };
  assert.equal(
    connectionColor(onePerSecond, consumer, 0.1 + 0.2, input, consumer, 0.3),
    connectionColors.balanced,
  );
  assert.equal(
    connectionColor(onePerSecond, consumer, 1e-12, input, consumer, 2e-12),
    connectionColors.shortage,
  );
});
test("reusable tools and untimed recipes do not create infinite rates", () => {
  assert.equal(rate({ ...input, consumed: false }, consumer), 0);
  assert.equal(rate(output, { ...producer, durationTicks: 0 }), 0);
  assert.equal(
    ratio(output, producer, { ...input, consumed: false }, consumer),
    "Unrated",
  );
});
test("matching stack identities receive stable colors", () => {
  assert.equal(itemColor("gregtech:meta:1"), itemColor("gregtech:meta:1"));
  assert.notEqual(itemColor("gregtech:meta:1"), itemColor("gregtech:meta:2"));
});

const ingredient = (
  itemId: string,
  direction = "input",
  alternatives: string[] = [],
): Ingredient => ({
  ...input,
  itemId,
  direction,
  alternatives: JSON.stringify(alternatives),
});

test("connections accept only substitutions declared by the receiving recipe", () => {
  const receiving = ingredient("mod:a", "input", ["mod:b"]);
  assert.ok(portsCompatible(ingredient("mod:b", "output"), receiving));
  assert.ok(!portsCompatible(ingredient("mod:c", "output"), receiving));
  assert.ok(
    !portsCompatible(ingredient("mod:b", "output"), ingredient("mod:a")),
  );
  assert.ok(
    !portsCompatible(
      ingredient("mod:b", "output", ["mod:a"]),
      ingredient("mod:a"),
    ),
  );
  assert.ok(!portsCompatible(receiving, ingredient("mod:a", "output")));
  assert.ok(
    !portsCompatible(ingredient("mod:a#different-nbt", "output"), receiving),
  );
});

test("alternative colors are order independent but do not grant transitive compatibility", () => {
  const ab = ingredient("mod:a", "input", ["mod:b"]);
  const bc = ingredient("mod:b", "input", ["mod:c"]);
  const recipes = [{ ingredients: [ab] }, { ingredients: [bc] }];
  const color = createPortColorResolver(recipes);
  const reversed = createPortColorResolver([...recipes].reverse());
  for (const id of ["mod:a", "mod:b", "mod:c"]) {
    assert.equal(color(id), color("mod:a"));
    assert.equal(color(id), reversed(id));
  }
  assert.equal(color("unrelated:item"), itemColor("unrelated:item"));
  assert.ok(!portsCompatible(ingredient("mod:c", "output"), ab));
});

test("malformed alternatives fall back to exact identity", () => {
  assert.deepEqual(
    acceptedItemIds({ ...ingredient("a"), alternatives: "broken" }),
    ["a"],
  );
  assert.deepEqual(
    acceptedItemIds({
      ...ingredient("a"),
      alternatives: '["b",null,5,"", "b"]',
    }),
    ["a", "b"],
  );
  assert.deepEqual(acceptedItemIds(ingredient("a", "output", ["b"])), ["a"]);
});

test("overflowed GTNH runtime durations remain unrated", () => {
  const invalid = { ...producer, durationTicks: -2147483569 };
  assert.equal(rate(output, invalid, 10), 0);
  assert.equal(ratio(output, invalid, input, consumer), "Unrated");
});
test("diagram format rejects incompatible versions and invalid quantities", () => {
  assert.ok(diagramSchema.safeParse(blankDiagram()).success);
  assert.ok(
    !diagramSchema.safeParse({ ...blankDiagram(), version: "2.7.4" }).success,
  );
  assert.ok(
    !diagramSchema.safeParse({
      ...blankDiagram(),
      nodes: [
        {
          id: crypto.randomUUID(),
          recipeId: "r",
          position: { x: 0, y: 0 },
          machines: -1,
        },
      ],
    }).success,
  );
});
