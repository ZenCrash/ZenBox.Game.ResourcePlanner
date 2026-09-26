import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionSummary } from "../lib/connection-summary";
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
    "1.5 items/s",
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
    "1.25 items/s",
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
