import { after, test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/recipes/route";
import { catalog } from "../lib/db";
import type { Recipe } from "../lib/model";

after(() => catalog.$disconnect());

test("machine uses start with processing tabs and retain ingredient uses", async () => {
  const machine = "gregtech:gt.blockmachines:651";
  const response = await GET(
    new Request(
      `http://localhost/api/recipes?mode=uses&item=${encodeURIComponent(machine)}`,
    ),
  );
  const recipes: Recipe[] = await response.json();
  assert.equal(recipes[0]?.handler, "Arc Furnace");
  assert(recipes.some((recipe) => recipe.handler === "Arc Furnace Recycling"));
  const isProcessing = (recipe: Recipe) =>
    recipe.craftingMachines?.some((item) => item.id === machine);
  const firstIngredientTab = recipes.findIndex(
    (recipe) => !isProcessing(recipe),
  );
  assert(
    firstIngredientTab > 0,
    "fixture has both processing and ingredient uses",
  );
  assert(
    recipes.slice(firstIngredientTab).every((recipe) => !isProcessing(recipe)),
  );
  assert(
    recipes
      .slice(firstIngredientTab)
      .some((recipe) =>
        recipe.ingredients.some(
          (ingredient) =>
            ingredient.direction === "input" && ingredient.itemId === machine,
        ),
      ),
  );
  assert.equal(
    new Set(recipes.map((recipe) => recipe.id)).size,
    recipes.length,
  );
});

test("left-click machine recipes do not include its processing recipes", async () => {
  const response = await GET(
    new Request(
      "http://localhost/api/recipes?mode=recipes&item=gregtech%3Agt.blockmachines%3A651",
    ),
  );
  const recipes: Recipe[] = await response.json();
  assert(recipes.length > 0);
  assert(
    recipes.every((recipe) =>
      recipe.ingredients.some(
        (ingredient) =>
          ingredient.direction === "output" &&
          ingredient.itemId === "gregtech:gt.blockmachines:651",
      ),
    ),
  );
});

test("unknown items still return no uses", async () => {
  const response = await GET(
    new Request(
      "http://localhost/api/recipes?mode=uses&item=missing-test-item",
    ),
  );
  assert.deepEqual(await response.json(), []);
});
