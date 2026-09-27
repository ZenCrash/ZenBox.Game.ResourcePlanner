// Priorities inferred from observed in-game tab sequences, with gaps for future
// observations. The relative order between separate observed sequences is provisional.
export const RECIPE_TAB_PRIORITIES: Readonly<Record<string, number>> = {
  "Shaped Crafting": 100,
  "Shapeless Crafting": 200,
  "SAG Mill": 300,
  Carpenter: 400,
  Crucible: 500,
  "Rock Breaker": 600,
  Extractor: 700,
  "Forge Hammer": 800,
  "Bacterial Vat": 1000,
  Mixer: 1100,
  "Multiblock Mixer": 1101,
  Fermenter: 1200,
  "Fluid Extractor": 1300,
  "Fluid Extractor Recycling": 2800,
  Bottler: 3000,
  "Fluid Canner": 3100,
  "Electromagnetic Separator": 1700,
  Smelting: 1800,
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
