import { writeFile } from "node:fs/promises";
import { catalog } from "../lib/db";
import { GET as getCatalog } from "../app/api/catalog/route";
import { GET as getRecipes } from "../app/api/recipes/route";

async function main() {
  const started = performance.now();
  const page = await (
    await getCatalog(new Request("http://localhost/api/catalog"))
  ).json();
  if (!page.items.length || page.total < page.items.length)
    throw new Error("Bundled catalog listing failed");
  const listingMs = Math.round(performance.now() - started);
  console.log(`Catalog listing: ${listingMs} ms`);
  const ironRecipes = await (
    await getRecipes(
      new Request("http://localhost/api/recipes?item=minecraft%3Airon_ingot"),
    )
  ).json();
  const ironUses = await (
    await getRecipes(
      new Request(
        "http://localhost/api/recipes?item=minecraft%3Airon_ingot&mode=uses",
      ),
    )
  ).json();
  console.log(
    `Iron ingot navigation: ${ironRecipes.length} recipes, ${ironUses.length} uses`,
  );
  if (!ironRecipes.length || !ironUses.length)
    throw new Error("Recipe or usage navigation failed for iron ingots");
  const report = {
    version: "2.8.4",
    completeness: "partial",
    items: await catalog.item.count(),
    visibleItems: page.total,
    recipes: await catalog.recipe.count(),
    enabledRecipes: await catalog.recipe.count({ where: { enabled: true } }),
    invalidDurations: await catalog.recipe.count({
      where: { durationTicks: { lt: 0 } },
    }),
    icons: await catalog.item.count({ where: { image: { not: null } } }),
    visibleItemsMissingIcons: await catalog.item.count({
      where: { hidden: false, image: null },
    }),
    recipeItemsMissingIcons: await catalog.item.count({
      where: {
        image: null,
        ingredients: { some: { recipe: { enabled: true } } },
      },
    }),
    missingItemIconSamples: await catalog.item.findMany({
      where: { image: null, kind: "item" },
      select: { id: true, name: true },
      take: 50,
    }),
    checks: {
      listingMs,
      ironRecipes: ironRecipes.length,
      ironUses: ironUses.length,
    },
    remaining: [
      "Complete custom NEI handler coverage",
      "NEI grouping and hidden-state parity",
      "Exact recipe layouts and handler interactions",
      "Animated item images",
    ],
  };
  await writeFile(
    "data/catalogs/gtnh-2.8.4.coverage.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
main().finally(() => catalog.$disconnect());
