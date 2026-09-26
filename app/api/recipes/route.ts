import { isGtnhInstalled } from "@/lib/game-packs";
import { catalog } from "@/lib/db";
import { hydrateRecipeVariants } from "@/lib/recipe-data";
export async function GET(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const url = new URL(request.url),
    item = url.searchParams.get("item"),
    ids = url.searchParams.get("ids");
  if (!item && !ids) return Response.json([]);
  const uses = url.searchParams.get("mode") === "uses";
  let machineHandlers: string[] = [];
  // Start with the indexed ingredient lookup instead of testing every recipe
  // in the version catalog for a matching ingredient.
  const matchingIds = ids
    ? ids.split(",").slice(0, 2000)
    : (
        await catalog.ingredient.findMany({
          where: {
            itemId: item!,
            direction:
              url.searchParams.get("mode") === "uses" ? "input" : "output",
          },
          select: { recipeId: true },
          distinct: ["recipeId"],
        })
      ).map((i) => i.recipeId);
  if (!ids && uses) {
    const [variants, machines] = await Promise.all([
      catalog.ingredientVariant.findMany({
        where: { itemId: item! },
        select: { ingredient: { select: { recipeId: true } } },
      }),
      catalog.$queryRaw<{ handler: string }[]>`
        SELECT DISTINCT handler FROM Recipe
        WHERE enabled = 1 AND EXISTS (
          SELECT 1 FROM json_each(Recipe.layout, '$.machineIds')
          WHERE value = ${item!}
        )
      `,
    ]);
    machineHandlers = machines.map((machine) => machine.handler);
    matchingIds.push(...variants.map((value) => value.ingredient.recipeId));
  }
  if (!matchingIds.length && !machineHandlers.length) return Response.json([]);
  const recipes = await catalog.recipe.findMany({
    where: {
      enabled: true,
      OR: [
        { id: { in: [...new Set(matchingIds)] } },
        { handler: { in: machineHandlers } },
      ],
    },
    include: {
      ingredients: { orderBy: { slot: "asc" }, include: { item: true } },
    },
    orderBy: [{ handler: "asc" }, { id: "asc" }],
  });
  // The browser creates tabs and selects its initial tab in response order.
  // Prioritize whole machine-handler groups; preserve their existing order.
  const preferred = new Set(machineHandlers);
  recipes.sort(
    (a, b) =>
      Number(preferred.has(b.handler)) - Number(preferred.has(a.handler)),
  );
  return Response.json(await hydrateRecipeVariants(recipes));
}
