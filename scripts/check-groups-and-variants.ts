import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { catalog } from "../lib/db";
import { GET as getCatalog } from "../app/api/catalog/route";
import { GET as getRecipes } from "../app/api/recipes/route";
import { ingredientVariants, type Recipe } from "../lib/model";
async function main() {
  const closed = await (
    await getCatalog(new Request("http://local/api/catalog?q=minecraft:wool"))
  ).json();
  assert.equal(closed.total, 16);
  assert.equal(closed.tiles.length, 1);
  assert.ok(closed.tiles[0].groupId);
  const open = await (
    await getCatalog(
      new Request(
        `http://local/api/catalog?q=minecraft:wool&expanded=${closed.tiles[0].groupId}`,
      ),
    )
  ).json();
  assert.equal(open.tiles.length, 16);
  assert.ok(
    open.tiles.every((tile: { item: { image: string } }) => tile.item.image),
  );
  const variant = await catalog.ingredientVariant.findFirst({
    where: {
      itemId: "minecraft:planks:1",
      ingredient: { recipe: { enabled: true } },
    },
    include: { ingredient: true },
  });
  assert.ok(variant);
  const recipes: Recipe[] = await (
    await getRecipes(
      new Request(
        `http://local/api/recipes?ids=${encodeURIComponent(variant.ingredient.recipeId)}`,
      ),
    )
  ).json();
  const recipe = recipes[0];
  const input = recipe.ingredients.find(
    (item) =>
      item.slot === variant.ingredient.slot && item.direction === "input",
  )!;
  assert.ok(
    ingredientVariants(input).some(
      (item) => item.id === variant.itemId && item.image,
    ),
  );
  const uses: Recipe[] = await (
    await getRecipes(
      new Request(
        "http://local/api/recipes?item=minecraft%3Aplanks%3A1&mode=uses",
      ),
    )
  ).json();
  assert.ok(uses.some((value) => value.id === recipe.id));
  await mkdir("data/ui-check", { recursive: true });
  await writeFile(
    "data/ui-check/fixtures.json",
    JSON.stringify({ closed, open, recipe }),
  );
  console.log(
    `Verified wool group: 1 collapsed / 16 expanded; ${ingredientVariants(input).length} hydrated recipe variants; alternative appears in ${uses.length} usage recipes`,
  );
}
main().finally(() => catalog.$disconnect());
