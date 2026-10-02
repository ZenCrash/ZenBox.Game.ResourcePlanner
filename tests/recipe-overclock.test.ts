import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overclockRecipe,
  recipeMachineBaseline,
  recipeComparison,
} from "../lib/recipe-overclock";
import { recipePowerInfo } from "../lib/recipe-power";
import { isMachineUpgrade } from "../lib/machine-selection";
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
const furnace = {
  ...lv,
  id: "minecraft:furnace",
  name: "Furnace",
  tooltip: "[]",
};
const electricLV = { ...lv, id: "gregtech:gt.blockmachines:261" };
const electricMV = { ...mv, id: "gregtech:gt.blockmachines:262" };
const smelting = {
  ...base,
  handler: "Smelting",
  euPerTick: 0,
  durationTicks: 0,
  details: "[]",
  craftingMachines: [furnace, electricLV, electricMV],
};
test("smelting has fuel-furnace time and machine-specific electric energy and rates", () => {
  assert.equal(isMachineUpgrade(smelting, furnace.id), false);
  assert.equal(isMachineUpgrade(smelting, electricLV.id), false);
  assert.equal(isMachineUpgrade(smelting, electricMV.id), true);
  const mvMinimum = { ...base, euPerTick: 120, details: "[]" };
  assert.equal(isMachineUpgrade(mvMinimum, "MV"), false);
  assert.equal(isMachineUpgrade(mvMinimum, "HV"), true);
  const comparison = recipeComparison(smelting, electricMV.id);
  assert.equal(comparison.referenceRecipe.euPerTick, 4);
  assert.equal(comparison.referenceRecipe.durationTicks, 128);
  assert.equal(comparison.isDefaultMachine, false);
  assert.equal(recipeComparison(smelting, electricLV.id).isDefaultMachine, true);
  assert.equal(recipeComparison(smelting, furnace.id).referenceRecipe.euPerTick, 0);
  assert.equal(overclockRecipe(smelting).durationTicks, 200);
  assert.equal(overclockRecipe(smelting).euPerTick, 0);
  const electric = overclockRecipe(smelting, electricLV.id);
  assert.equal(electric.durationTicks, 128);
  assert.equal(electric.euPerTick, 4);
  assert.equal(electric.durationTicks * electric.euPerTick, 512);
  const upgraded = overclockRecipe(smelting, electricMV.id);
  assert.equal(upgraded.durationTicks, 64);
  assert.equal(upgraded.euPerTick, 16);
  assert.equal(rate(ingredient, upgraded), rate(ingredient, electric) * 2);
  assert.equal(
    recipeMachineBaseline(smelting, electricMV.id).durationTicks,
    128,
  );
  assert.equal(smelting.durationTicks, 0);
});
test("steam and iron furnaces use verified time without displaying electric power", () => {
  for (const [id, ticks] of [
    ["IC2:blockMachine:1", 160],
    ["gregtech:gt.blockmachines:103", 256],
    ["gregtech:gt.blockmachines:104", 128],
    ["Natura:NetherFurnace", 200],
  ] as const) {
    const recipe = overclockRecipe({
      ...smelting,
      craftingMachines: [{ ...furnace, id }],
    });
    assert.equal(recipe.durationTicks, ticks);
    assert.equal(recipe.euPerTick, 0);
  }
});
test("unconfigured smelting multiblocks do not inherit vanilla furnace timing", () => {
  const recipe = overclockRecipe({
    ...smelting,
    craftingMachines: [{ ...furnace, id: "gregtech:gt.blockmachines:1003" }],
  });
  assert.equal(recipe.durationTicks, 0);
  assert.doesNotMatch(recipe.details, /Machine-specific timing/);
});
test("Steam Oven models nine parallel smelts, upfront steam, and batch restart time", () => {
  const recipe = overclockRecipe({ ...smelting, craftingMachines: [{ ...furnace, id: "Railcraft:machine.alpha:3" }] });
  assert.equal(recipe.durationTicks, 256);
  assert.equal(recipe.cycleDurationTicks, 272);
  assert.equal(recipe.parallel, 9);
  assert.equal(recipe.steamPerBatch, 8000);
  assert.equal(recipe.steamPerTick, 8000 / 272);
  assert.equal(rate(ingredient, recipe), ingredient.amount * 20 / 272 * 9);
  assert.equal(rate(ingredient, recipe, 2), ingredient.amount * 20 / 272 * 2 * 9);
});
test("steam furnaces and ordinary steam machines expose liters rather than EU", () => {
  for (const [id, steam, ticks] of [["gregtech:gt.blockmachines:103", 8, 256], ["gregtech:gt.blockmachines:104", 16, 128]] as const) {
    const recipe = overclockRecipe({ ...smelting, craftingMachines: [{ ...furnace, id }] });
    assert.equal(recipe.steamPerTick, steam);
    assert.equal(recipe.steamPerTick! * recipe.durationTicks, 2048);
    assert.equal(recipe.durationTicks, ticks);
  }
  for (const [id, steam, ticks] of [["gregtech:gt.blockmachines:106", 60, 400], ["gregtech:gt.blockmachines:107", 120, 200]] as const) {
    const recipe = overclockRecipe({ ...base, handler: "Macerator", craftingMachines: [{ ...furnace, id }] });
    assert.equal(recipe.steamPerTick, steam);
    assert.equal(recipe.durationTicks, ticks);
    assert.equal(recipe.euPerTick, 0);
    assert.equal(recipePowerInfo(recipe).voltage, undefined);
  }
});
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
  assert.equal(connection.from, `${(0.8).toLocaleString()} items/s`);
  assert.equal(connection.target, `${(0.2).toLocaleString()} items/s`);
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
