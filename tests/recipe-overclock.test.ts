import { test } from "node:test";
import assert from "node:assert/strict";
import { overclockRecipe } from "../lib/recipe-overclock";
import { recipePowerInfo } from "../lib/recipe-power";
import { rate, type Recipe, type Item, type Ingredient } from "../lib/model";
import { connectionSummary } from "../lib/connection-summary";
import { summarizeArea } from "../lib/area-summary";

const machine = (tier: string, voltage: number): Item => ({
  id: tier,
  name: tier,
  registryId: tier,
  metadata: 0,
  mod: "GT",
  group: "",
  tooltip: JSON.stringify([`Voltage IN: ${voltage} (${tier})`]),
  image: null,
  kind: "item",
});
const lv = machine("LV", 32),
  mv = machine("MV", 128),
  hv = machine("HV", 512);
const ingredient: Ingredient = {
  itemId: "item",
  item: { ...lv, id: "item", name: "Item" },
  direction: "output",
  slot: 0,
  amount: 2,
  chance: 1,
  consumed: true,
  alternatives: "[]",
  x: null,
  y: null,
};
const base: Recipe = {
  id: "test",
  name: "Recipe",
  handler: "Assembler",
  durationTicks: 200,
  euPerTick: 30,
  layout: "{}",
  details: '["Voltage: 30 EU/t (LV)","Amperage: 1 A","Other detail"]',
  ingredients: [ingredient],
  craftingMachines: [lv, mv, hv],
};
test("higher tiers change time, power, totals and rates without mutating the baseline", () => {
  const before = JSON.stringify(base);
  const recipe = overclockRecipe(base, "MV");
  assert.equal(recipe.durationTicks, 100);
  assert.equal(recipe.euPerTick, 120);
  assert.equal(recipe.durationTicks * recipe.euPerTick, 12000);
  assert.equal(rate(ingredient, recipe), 0.4);
  assert.match(recipePowerInfo(recipe).voltage!, /120 EU\/t \(MV\)/);
  assert.deepEqual(recipePowerInfo(recipe).details, ["Other detail"]);
  assert.equal(overclockRecipe(base, "HV").durationTicks, 50);
  assert.equal(overclockRecipe(base, "HV").euPerTick, 480);
  assert.equal(JSON.stringify(base), before);
  assert.equal(overclockRecipe(base, "LV"), base);
  assert.equal(overclockRecipe(base), base);
});
test("connections and summaries use the same overclocked rates and energy", () => {
  const recipe = overclockRecipe(base, "MV");
  const input = { ...ingredient, direction: "input" };
  const connection = connectionSummary(ingredient, recipe, 2, input, base, 1);
  assert.equal(connection.from, "0.8 items/s");
  assert.equal(connection.target, "0.2 items/s");
  const summary = summarizeArea(
    { position: { x: 0, y: 0 }, width: 500, height: 500 },
    [
      {
        position: { x: 10, y: 10 },
        width: 300,
        height: 200,
        recipe: base,
        machines: 2,
        variants: {},
        machineId: "MV",
      },
    ],
  );
  assert.equal(summary.euPerTick, 240);
  assert.equal(summary.totalEu, 24000);
  assert.equal(summary.machines[0].tier, "MV");
});
test("ULV recipes do not gain a free LV overclock, and duration stays at least one tick", () => {
  const low = { ...base, euPerTick: 4, details: "[]" };
  assert.equal(overclockRecipe(low, "LV"), low);
  assert.equal(overclockRecipe(low, "MV").euPerTick, 16);
  assert.equal(
    overclockRecipe({ ...base, durationTicks: 3 }, "HV").durationTicks,
    1,
  );
});
test("manual recipes and unconfigured multiblocks retain their baseline", () => {
  const manual = { ...base, durationTicks: 0 };
  assert.equal(overclockRecipe(manual, "HV"), manual);
  const multi = { ...lv, id: "multi", name: "Multiblock", tooltip: "[]" };
  const recipe = { ...base, craftingMachines: [multi] };
  assert.equal(overclockRecipe(recipe, "multi"), recipe);
});
