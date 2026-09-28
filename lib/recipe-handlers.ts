import categoryMods from "./recipe-category-mods.json";
import type { Recipe } from "./model";

/** Category ownership comes from NEI handler IDs, not the crafted item's mod. */
export function recipeCategoryMod(recipe: Recipe): string {
  const known = (categoryMods as Record<string, string>)[canonicalRecipeHandler(recipe.handler)];
  if (known) return known;
  const mods = [...new Set((recipe.craftingMachines ?? []).map(machine => machine.mod))];
  return mods.length === 1 ? ({ gregtech: "GregTech", miscutils: "GT++" } as Record<string, string>)[mods[0]] ?? mods[0] : "Unknown mod";
}

// Some exported NEI category names contain the UI's truncated title.
export function canonicalRecipeHandler(handler: string) {
  return handler === "Combustion Generator Fue..."
    ? "Combustion Generator Fuels"
    : handler;
}

export function isCombustionFuelHandler(handler: string) {
  return canonicalRecipeHandler(handler) === "Combustion Generator Fuels";
}
