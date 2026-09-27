import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRecipeHandlers } from "../lib/recipe-order";

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
  test(`preserves observed sequence beginning with ${sequence[0]}`, () => {
    assert.deepEqual(
      [...sequence].reverse().sort(compareRecipeHandlers),
      sequence,
    );
  });
}
test("keeps multiblock variants after their base machine", () => {
  assert.deepEqual(
    [
      "Large Chemical Reactor",
      "Compressor",
      "Chemical Reactor",
      "Unknown Machine",
    ].sort(compareRecipeHandlers),
    [
      "Compressor",
      "Chemical Reactor",
      "Large Chemical Reactor",
      "Unknown Machine",
    ],
  );
});
