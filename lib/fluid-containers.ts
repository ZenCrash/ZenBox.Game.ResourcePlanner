import { catalog } from "./db";
import type { Item, Recipe } from "./model";

export function containerFill(
  filledId: string,
  emptyIds: string[],
  ingredients: (ContainerIngredient & { item: Item })[],
) {
  if (ingredients.length !== 3 || ingredients.some((i) => i.amount <= 0))
    return;
  const fluid = ingredients.filter((i) => i.item.kind === "fluid");
  if (fluid.length !== 1) return;
  const filled = ingredients.find(
    (i) => i.itemId === filledId && i.direction !== fluid[0].direction,
  );
  const empty = ingredients.find(
    (i) => emptyIds.includes(i.itemId) && i.direction === fluid[0].direction,
  );
  if (!filled || !empty || filled.amount !== empty.amount) return;
  return { item: fluid[0].item, amount: fluid[0].amount / filled.amount };
}

export async function bottlerFluids(recipes: Recipe[]) {
  const bottlers = recipes.filter((r) => r.handler === "Bottler");
  const ids = [
    ...new Set(
      bottlers.flatMap((r) =>
        r.ingredients
          .filter((i) => i.direction === "output" && i.item.kind !== "fluid")
          .map((i) => i.itemId),
      ),
    ),
  ];
  const matches = new Map<string, (ContainerIngredient & { item: Item })[][]>();
  for (let start = 0; start < ids.length; start += 200) {
    const rows = await catalog.ingredient.findMany({
      where: {
        itemId: { in: ids.slice(start, start + 200) },
        recipe: { enabled: true, handler: "Fluid Canner" },
      },
      include: {
        recipe: { include: { ingredients: { include: { item: true } } } },
      },
    });
    for (const row of rows) {
      const candidates = matches.get(row.itemId) ?? [];
      candidates.push(row.recipe.ingredients);
      matches.set(row.itemId, candidates);
    }
  }
  const result = new Map<string, { item: Item; amount: number }>();
  for (const recipe of bottlers) {
    const emptyIds = recipe.ingredients
      .filter((i) => i.direction === "input" && i.item.kind !== "fluid")
      .map((i) => i.itemId);
    for (const output of recipe.ingredients.filter(
      (i) => i.direction === "output" && i.item.kind !== "fluid",
    )) {
      const fills = (matches.get(output.itemId) ?? []).flatMap(
        (ingredients) => {
          const fill = containerFill(output.itemId, emptyIds, ingredients);
          return fill ? [fill] : [];
        },
      );
      if (
        fills.length &&
        fills.every(
          (fill) =>
            fill.item.id === fills[0].item.id &&
            fill.amount === fills[0].amount,
        )
      ) {
        result.set(recipe.id, {
          item: fills[0].item,
          amount: fills[0].amount * output.amount,
        });
      }
    }
  }
  return result;
}

type ContainerIngredient = {
  itemId: string;
  direction: string;
  amount: number;
  item: { kind: string };
};

// Only a pure fill/drain operation establishes contents. Chemical reactions,
// empty containers, and recipes with multiple fluids must not create aliases.
export function containedFluids(
  itemId: string,
  recipes: { ingredients: ContainerIngredient[] }[],
) {
  const fluids = new Set<string>();
  for (const { ingredients } of recipes) {
    if (ingredients.length !== 3 || ingredients.some((i) => i.amount <= 0))
      continue;
    const fluid = ingredients.filter((i) => i.item.kind === "fluid");
    const items = ingredients.filter((i) => i.item.kind !== "fluid");
    if (fluid.length !== 1 || items.length !== 2) continue;
    const filled = items.find(
      (i) => i.itemId === itemId && i.direction !== fluid[0].direction,
    );
    const empty = items.find(
      (i) => i.itemId !== itemId && i.direction === fluid[0].direction,
    );
    if (filled && empty && filled.amount === empty.amount)
      fluids.add(fluid[0].itemId);
  }
  return [...fluids];
}

export async function fluidContents(itemId: string) {
  const matches = await catalog.ingredient.findMany({
    where: { itemId, recipe: { enabled: true, handler: "Fluid Canner" } },
    select: {
      recipe: {
        select: {
          ingredients: {
            select: {
              itemId: true,
              direction: true,
              amount: true,
              item: { select: { kind: true } },
            },
          },
        },
      },
    },
  });
  return containedFluids(
    itemId,
    matches.map((match) => match.recipe),
  );
}
