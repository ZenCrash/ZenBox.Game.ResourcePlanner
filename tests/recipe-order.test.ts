import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRecipeHandlers } from "../lib/recipe-order";

for (const sequence of [
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
test("keeps unranked multiblock variants after their base machine", () => {
  assert.deepEqual(
    [
      "Large Chemical Reactor",
      "Compressor",
      "Chemical Reactor",
      "Unknown Machine",
    ].sort(compareRecipeHandlers),
    [
      "Chemical Reactor",
      "Large Chemical Reactor",
      "Compressor",
      "Unknown Machine",
    ],
  );
});
