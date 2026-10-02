import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRecipeHandlers, neiRecipePriority } from "../lib/recipe-order";

test("truncated combustion category retains its fuel tab order", () => {
  const sequence = ["Large Boiler", "Combustion Generator Fue...", "Semifluid Generator Fuels", "Fluid Canner"];
  assert.deepEqual([...sequence].reverse().sort(compareRecipeHandlers), sequence);
});

for (const sequence of [
  [
    "Large Chemical Reactor",
    "Assembler",
    "Mixer",
    "Distillery",
    "Multiblock Mixer",
    "Fluid Extractor",
    "Large Boiler",
    "Combustion Generator Fuels",
    "Fluid Canner",
  ],
  [
    "Bacterial Vat",
    "Assembler",
    "Distillation Tower",
    "Distillery",
    "Brewery",
    "Fluid Extractor",
    "Large Boiler",
    "Combustion Generator Fuels",
    "Semifluid Generator Fuels",
    "Fluid Canner",
  ],
  ["Smelting", "Carpenter", "Rock Breaker", "Compressor"],
  [
    "Electromagnetic Separator",
    "Smelting",
    "Blasting",
    "Casting Table",
    "Blast Furnace",
    "Bricked Blast Furnace",
    "Fluid Solidifier",
    "Extruder",
    "Infernal Blast Furnace",
    "Alloy Smelter Molding",
    "Alloy Smelter Recycling",
    "Fluid Extractor Recycling",
    "Arc Furnace Recycling",
  ],
  [
    "Shaped Crafting",
    "Shapeless Crafting",
    "SAG Mill",
    "Carpenter",
    "Crucible",
    "Rock Breaker",
    "Extractor",
    "Forge Hammer",
  ],
  [
    "Bacterial Vat",
    "Mixer",
    "Multiblock Mixer",
    "Fermenter",
    "Fluid Extractor",
    "Fluid Extractor Recycling",
    "Bottler",
    "Fluid Canner",
  ],
]) {
  test(`uses NEI priorities then observed ties beginning with ${sequence[0]}`, () => {
    assert.deepEqual(
      [...sequence].reverse().sort(compareRecipeHandlers),
      [...sequence].sort((a, b) => neiRecipePriority(a) - neiRecipePriority(b)),
    );
  });
}
test("NEI priority overrides the former multiblock order", () => {
  assert.deepEqual(
    [
      "Large Chemical Reactor",
      "Compressor",
      "Chemical Reactor",
      "Unknown Machine",
    ].sort(compareRecipeHandlers),
    [
      "Large Chemical Reactor",
      "Chemical Reactor",
      "Compressor",
      "Unknown Machine",
    ],
  );
});

test("NEI priorities cover processing, fuel, recycling and unlisted categories", () => {
  assert.equal(neiRecipePriority("Oil Cracker"), -11);
  assert.equal(neiRecipePriority("Large Chemical Reactor"), -10);
  assert.equal(neiRecipePriority("Chemical Reactor"), -5);
  assert.equal(neiRecipePriority("Electrolyzer"), 30);
  assert.equal(neiRecipePriority("ABS Non-Alloy Recipes"), 40);
  assert.equal(neiRecipePriority("Macerator Recycling"), 40);
  assert.equal(neiRecipePriority("Fluid Canner"), 100);
  assert.equal(neiRecipePriority("Unknown Machine"), 0);
  assert.equal(neiRecipePriority("Combustion Generator Fue..."), 5);
});
