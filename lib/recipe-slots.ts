import type { Ingredient } from "./model";

export type RecipeSlotCounts = {
  itemInputs: number;
  itemOutputs: number;
  fluidInputs: number;
  fluidOutputs: number;
};

/** NEI crafting coordinates locate item artwork, not the surrounding slot bevel. */
export function shapedCraftingSlots(ingredients: Ingredient[]) {
  const inputs: (Ingredient | null)[] = Array(9).fill(null);
  for (const ingredient of ingredients.filter((i) => i.direction === "input")) {
    const column =
      ingredient.x === null
        ? ingredient.slot % 3
        : Math.round((ingredient.x - 25) / 18);
    const row =
      ingredient.y === null
        ? Math.floor(ingredient.slot / 3)
        : Math.round((ingredient.y - 6) / 18);
    if (column >= 0 && column < 3 && row >= 0 && row < 3)
      inputs[row * 3 + column] = ingredient;
  }
  return {
    inputs,
    output: ingredients.find((i) => i.direction === "output") ?? null,
  };
}

export function recipeSlotGroups(
  ingredients: Ingredient[],
  direction: "input" | "output",
  counts?: RecipeSlotCounts,
) {
  return (["item", "fluid"] as const).map((kind) => {
    const occupied = ingredients.filter(
      (ingredient) =>
        ingredient.direction === direction &&
        (ingredient.item.kind === "fluid") === (kind === "fluid"),
    );
    const key =
      `${kind}${direction === "input" ? "Inputs" : "Outputs"}` as keyof RecipeSlotCounts;
    const capacity = counts?.[key];
    const total =
      Number.isSafeInteger(capacity) && capacity! >= 0
        ? Math.max(capacity!, occupied.length)
        : occupied.length;
    return {
      kind,
      slots: Array.from(
        { length: total },
        (_, index) => occupied[index] ?? null,
      ),
    };
  });
}
