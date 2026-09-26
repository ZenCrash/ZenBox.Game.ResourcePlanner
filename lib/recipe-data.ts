import { catalog } from "./db";
import { acceptedItemIds, type Recipe } from "./model";

function machineIds(recipe: Recipe): string[] {
  try {
    const ids = JSON.parse(recipe.layout).machineIds;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function hydrateRecipeVariants(
  recipes: Recipe[],
): Promise<Recipe[]> {
  const known = new Map(
    recipes.flatMap((recipe) =>
      recipe.ingredients.map((i) => [i.itemId, i.item] as const),
    ),
  );
  const ids = [
    ...new Set(
      recipes.flatMap((recipe) => [
        ...recipe.ingredients.flatMap(acceptedItemIds),
        ...machineIds(recipe),
      ]),
    ),
  ].filter((id) => !known.has(id));
  for (let start = 0; start < ids.length; start += 500) {
    const items = await catalog.item.findMany({
      where: { id: { in: ids.slice(start, start + 500) } },
    });
    for (const item of items) known.set(item.id, item);
  }
  return recipes.map((recipe) => ({
    ...recipe,
    craftingMachines: machineIds(recipe).flatMap((id) =>
      known.has(id) ? [known.get(id)!] : [],
    ),
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      alternativeItems: acceptedItemIds(i).flatMap((id) =>
        known.has(id) ? [known.get(id)!] : [],
      ),
    })),
  }));
}
