import { catalog } from "./db";
import { acceptedItemIds, type Recipe } from "./model";
import { bottlerFluids } from "./fluid-containers";

function machineIds(recipe: Recipe): string[] {
  // Et Futurum registers this catalyst through IMC rather than NEI's CSV.
  const extra =
    recipe.handler === "Blasting"
      ? ["etfuturum:blast_furnace"]
      : recipe.handler === "Blast Furnace"
        ? ["gregtech:gt.blockmachines:1000", "gregtech:gt.blockmachines:15412"]
        : [];
  try {
    const ids = JSON.parse(recipe.layout).machineIds;
    return [
      ...new Set([
        ...extra,
        ...(Array.isArray(ids)
          ? ids.filter(
              (id): id is string =>
                typeof id === "string" &&
                !(
                  recipe.handler === "Distillery" &&
                  id === "witchery:distilleryidle"
                ) &&
                !(
                  recipe.handler === "Blast Furnace" &&
                  id === "IC2:blockMachine3:1"
                ),
            )
          : []),
      ]),
    ];
  } catch {
    return extra;
  }
}

export async function hydrateRecipeVariants(
  recipes: Recipe[],
): Promise<Recipe[]> {
  const tankFluids = await bottlerFluids(recipes);
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
        ...(recipe.handler === "Smelting" ? ["minecraft:coal"] : []),
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
    ...(recipe.handler === "Smelting"
      ? { smeltingFuel: known.get("minecraft:coal") }
      : {}),
    ...(tankFluids.has(recipe.id)
      ? { bottlerFluid: tankFluids.get(recipe.id) }
      : {}),
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
