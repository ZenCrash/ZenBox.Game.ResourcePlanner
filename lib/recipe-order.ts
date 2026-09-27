import { canonicalRecipeHandler } from "./recipe-handlers";

// Priorities inferred from observed in-game tab sequences, with gaps for future
// observations. The relative order between separate observed sequences is provisional.
export const RECIPE_TAB_PRIORITIES: Readonly<Record<string, number>> = {
  "Shaped Crafting": 100,
  "Shapeless Crafting": 200,
  "SAG Mill": 300,
  "Electromagnetic Separator": 350,
  Smelting: 375,
  Carpenter: 400,
  Crucible: 500,
  "Rock Breaker": 600,
  Compressor: 650,
  Extractor: 700,
  "Forge Hammer": 800,
  "Bacterial Vat": 1000,
  "Chemical Reactor": 1040,
  "Large Chemical Reactor": 1041,
  Assembler: 1050,
  "Distillation Tower": 1060,
  Mixer: 1065,
  Distillery: 1070,
  Brewery: 1080,
  "Multiblock Mixer": 1101,
  Fermenter: 1200,
  "Fluid Extractor": 1300,
  "Large Boiler": 1400,
  "Combustion Generator Fuels": 1500,
  "Semifluid Generator Fuels": 1600,
  "Fluid Extractor Recycling": 2800,
  Bottler: 3000,
  "Fluid Canner": 3100,
  Blasting: 1900,
  "Casting Table": 2000,
  "Blast Furnace": 2100,
  "Bricked Blast Furnace": 2200,
  "Fluid Solidifier": 2300,
  Extruder: 2400,
  "Infernal Blast Furnace": 2500,
  "Alloy Smelter Molding": 2600,
  "Alloy Smelter Recycling": 2700,
  "Arc Furnace Recycling": 2900,
};

function tabOrder(handler: string) {
  handler = canonicalRecipeHandler(handler);
  const base = handler.replace(/^(?:Large|Multiblock) /, "");
  const variant = base === handler ? 0 : 1;
  return {
    priority:
      RECIPE_TAB_PRIORITIES[handler] ??
      (RECIPE_TAB_PRIORITIES[base] !== undefined
        ? RECIPE_TAB_PRIORITIES[base] + variant
        : 10000),
    base,
    variant,
  };
}

export function compareRecipeHandlers(a: string, b: string) {
  const left = tabOrder(a),
    right = tabOrder(b);
  return (
    left.priority - right.priority ||
    left.base.localeCompare(right.base) ||
    left.variant - right.variant ||
    a.localeCompare(b)
  );
}
