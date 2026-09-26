import type { Ingredient } from "./model";

export type RecipeSlotCounts = {
  itemInputs: number;
  itemOutputs: number;
  fluidInputs: number;
  fluidOutputs: number;
};

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
