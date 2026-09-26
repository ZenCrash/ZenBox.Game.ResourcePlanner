import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { catalog } from "../lib/db";
import { hydrateRecipeVariants } from "../lib/recipe-data";

async function main() {
  const recipes = await catalog.recipe.findMany({
    where: { handler: { contains: "Crafting" }, enabled: true },
    distinct: ["handler"],
    include: { ingredients: { include: { item: true } } },
  });
  const hydrated = await hydrateRecipeVariants(recipes);
  const crafting = hydrated.filter((recipe) =>
    /^(shaped|shapeless|crafting)/i.test(recipe.handler),
  );
  assert.ok(crafting.length > 0);
  for (const recipe of crafting) {
    assert.ok(
      recipe.craftingMachines?.some(
        (item) => item.registryId === "minecraft:crafting_table",
      ),
      recipe.handler,
    );
    for (const item of recipe.craftingMachines ?? []) {
      assert.ok(item.image, item.name);
      await access("data/game-assets" + item.image.replace(/^\/assets/, ""));
    }
    console.log(
      `${recipe.handler}: ${recipe.craftingMachines?.map((item) => item.name).join(", ")}`,
    );
  }
}
main().finally(() => catalog.$disconnect());
