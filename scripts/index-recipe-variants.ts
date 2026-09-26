import { catalog } from "../lib/db";
export async function indexRecipeVariants() {
  await catalog.$executeRaw`INSERT OR IGNORE INTO IngredientVariant (ingredientId, itemId)
    SELECT Ingredient.id, value FROM Ingredient, json_each(Ingredient.alternatives)
    WHERE Ingredient.direction = 'input' AND json_each.type = 'text' AND value != Ingredient.itemId`;
}
indexRecipeVariants()
  .then(async () =>
    console.log(
      `Indexed ${await catalog.ingredientVariant.count()} accepted recipe variants`,
    ),
  )
  .finally(() => catalog.$disconnect());
