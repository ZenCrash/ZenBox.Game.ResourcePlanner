import { catalog } from "./db";
import type { Recipe } from "./model";
import { machineIds } from "./recipe-data";

/** Rank all candidates before applying the search cap. Bound every IN query,
 * including the relation queries Prisma emits when loading recipe ingredients.
 */
export async function plannerRecipes(
  itemId: string,
  recipeTypes: string[] = [],
  excludedRecipes: string[] = [],
) {
  const matching = await catalog.ingredient.findMany({
    where: { itemId, direction: "output", recipe: { enabled: true } },
    select: { recipeId: true },
    distinct: ["recipeId"],
  });
  const ids = [...new Set(matching.map((ingredient) => ingredient.recipeId))];
  const allowed = new Set(recipeTypes),
    excluded = new Set(excludedRecipes);
  const candidates: { id: string; euPerTick: number; durationTicks: number }[] =
    [];
  for (let start = 0; start < ids.length; start += 300) {
    const batch = await catalog.recipe.findMany({
      where: { enabled: true, id: { in: ids.slice(start, start + 300) } },
      select: { id: true, handler: true, euPerTick: true, durationTicks: true },
    });
    candidates.push(
      ...batch.filter(
        (recipe) =>
          (!allowed.size || allowed.has(recipe.handler)) &&
          !excluded.has(recipe.id),
      ),
    );
  }
  candidates.sort(
    (a, b) =>
      a.euPerTick - b.euPerTick ||
      a.durationTicks - b.durationTicks ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const selected = candidates.slice(0, 200);
  const recipes: Recipe[] = [];
  for (let start = 0; start < selected.length; start += 50) {
    recipes.push(
      ...(await catalog.recipe.findMany({
        where: {
          id: {
            in: selected.slice(start, start + 50).map((recipe) => recipe.id),
          },
        },
        include: {
          ingredients: { orderBy: { slot: "asc" }, include: { item: true } },
        },
      })),
    );
  }
  const ranks = new Map(selected.map((recipe, index) => [recipe.id, index]));
  recipes.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  const machineItemIds = [...new Set(recipes.flatMap(machineIds))];
  const machines = [];
  for (let start = 0; start < machineItemIds.length; start += 300) {
    machines.push(
      ...(await catalog.item.findMany({
        where: { id: { in: machineItemIds.slice(start, start + 300) } },
      })),
    );
  }
  const items = new Map(machines.map((item) => [item.id, item]));
  return {
    capped: candidates.length > 200,
    recipes: recipes.map((recipe) => ({
      ...recipe,
      craftingMachines: machineIds(recipe).flatMap((id) =>
        items.has(id) ? [items.get(id)!] : [],
      ),
    })),
  };
}
