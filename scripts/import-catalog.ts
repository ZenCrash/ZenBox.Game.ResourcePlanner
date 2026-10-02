import { readFile } from "node:fs/promises";
import { z } from "zod";
import { catalog } from "../lib/db";
const image = z
  .string()
  .regex(/^\/assets\/[a-zA-Z0-9_./-]+$/)
  .refine((v) => !v.includes(".."));
const itemSchema = z.object({
  id: z.string().min(1),
  registryId: z.string(),
  metadata: z.number().int().default(0),
  nbt: z.string().default(""),
  name: z.string().min(1),
  mod: z.string(),
  group: z.string(),
  tooltip: z.array(z.string()).default([]),
  image: image.nullable().default(null),
  hidden: z.boolean(),
  sortOrder: z.number().int(),
  kind: z.enum(["item", "fluid"]).default("item"),
});
const ingredientSchema = z.object({
  itemId: z.string(),
  direction: z.enum(["input", "output"]),
  amount: z.number().finite().nonnegative(),
  chance: z.number().min(0).max(1).default(1),
  consumed: z.boolean().default(true),
  slot: z.number().int().nonnegative(),
  x: z.number().finite().nullable().default(null),
  y: z.number().finite().nullable().default(null),
  alternatives: z.array(z.string()).default([]),
});
const recipeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  handler: z.string(),
  // Some installed GT recipes contain overflowed negative durations. Preserve
  // the source value; rate() refuses to calculate throughput for these records.
  durationTicks: z.number().finite(),
  euPerTick: z.number().finite().default(0),
  enabled: z.boolean(),
  layout: z
    .object({
      background: image.optional(),
      tabIcon: image.optional(),
      machineIds: z.array(z.string()).optional(),
      slotCounts: z
        .object({
          itemInputs: z.number().int().nonnegative(),
          itemOutputs: z.number().int().nonnegative(),
          fluidInputs: z.number().int().nonnegative(),
          fluidOutputs: z.number().int().nonnegative(),
        })
        .optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    })
    .default({}),
  details: z.array(z.string()).default([]),
  ingredients: z.array(ingredientSchema),
});
export const catalogSchema = z.object({
  game: z.literal("gtnh"),
  version: z.literal("2.8.4"),
  source: z.string().min(1),
  completeness: z.enum(["partial", "runtime-export", "verified-nei-parity"]),
  items: z.array(itemSchema),
  recipes: z.array(recipeSchema),
});
async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error("Usage: npm run catalog:import -- path/to/catalog.json");
  const data = catalogSchema.parse(JSON.parse(await readFile(file, "utf8")));
  for (const item of data.items) {
    if (item.registryId !== "thaumcraftneiplugin:Aspect") continue;
    const key = item.nbt.match(/key:"([^"]+)"/)?.[1];
    if (!key) continue;
    if (/unknown aspect/i.test(item.name)) item.name = `Aspect: ${key[0].toUpperCase()}${key.slice(1)}`;
    item.tooltip = [item.name, ...item.tooltip.slice(1).filter(line => !/unknown aspect/i.test(line))];
    item.hidden = item.metadata !== 1;
    item.group = "Thaumcraft Aspects";
  }
  const ids = new Set(data.items.map((i) => i.id));
  if (
    ids.size !== data.items.length ||
    new Set(data.recipes.map((r) => r.id)).size !== data.recipes.length
  )
    throw new Error("Duplicate item or recipe IDs");
  for (const recipe of data.recipes) {
    const slots = new Set<string>();
    for (const i of recipe.ingredients) {
      if (!ids.has(i.itemId) || i.alternatives.some((a) => !ids.has(a)))
        throw new Error(`Unknown ingredient in ${recipe.id}`);
      const key = `${i.direction}:${i.slot}`;
      if (slots.has(key)) throw new Error(`Duplicate port in ${recipe.id}`);
      slots.add(key);
    }
  }
  // Additive import preserves recipe IDs referenced by existing JSON diagrams.
  await catalog.$transaction(
    async (tx) => {
      const firstImport =
        (await tx.item.count()) === 0 && (await tx.recipe.count()) === 0;
      if (firstImport) {
        // The complete runtime catalog has hundreds of thousands of recipes.
        // Batch initial creation while retaining the same atomic transaction.
        for (let offset = 0; offset < data.items.length; offset += 500) {
          await tx.item.createMany({
            data: data.items.slice(offset, offset + 500).map((item) => ({
              ...item,
              tooltip: JSON.stringify(item.tooltip),
            })),
          });
        }
        for (let offset = 0; offset < data.recipes.length; offset += 250) {
          const batch = data.recipes.slice(offset, offset + 250);
          await tx.recipe.createMany({
            data: batch.map(({ ingredients, ...recipe }) => {
              void ingredients;
              return {
                ...recipe,
                layout: JSON.stringify(recipe.layout),
                details: JSON.stringify(recipe.details),
              };
            }),
          });
          await tx.ingredient.createMany({
            data: batch.flatMap((recipe) =>
              recipe.ingredients.map((i) => ({
                ...i,
                alternatives: JSON.stringify(i.alternatives),
                recipeId: recipe.id,
              })),
            ),
          });
          if (offset % 10000 === 0)
            console.log(
              `Imported ${Math.min(offset + 250, data.recipes.length)} / ${data.recipes.length} recipes`,
            );
        }
      } else {
        for (const item of data.items) {
          const record = { ...item, tooltip: JSON.stringify(item.tooltip) };
          await tx.item.upsert({
            where: { id: item.id },
            create: record,
            update: record,
          });
        }
        for (const recipe of data.recipes) {
          const { ingredients, ...fields } = recipe;
          const record = {
            ...fields,
            enabled: fields.enabled,
            layout: JSON.stringify(fields.layout),
            details: JSON.stringify(fields.details),
          };
          await tx.recipe.upsert({
            where: { id: recipe.id },
            create: record,
            update: record,
          });
          await tx.ingredient.deleteMany({ where: { recipeId: recipe.id } });
          await tx.ingredient.createMany({
            data: ingredients.map((i) => ({
              ...i,
              alternatives: JSON.stringify(i.alternatives),
              recipeId: recipe.id,
            })),
          });
        }
      }
      await tx.$executeRaw`INSERT OR IGNORE INTO IngredientVariant (ingredientId, itemId)
        SELECT Ingredient.id, value FROM Ingredient, json_each(Ingredient.alternatives)
        WHERE Ingredient.direction = 'input' AND json_each.type = 'text' AND value != Ingredient.itemId`;
      await tx.catalogInfo.upsert({
        where: { id: "gtnh" },
        create: {
          id: "gtnh",
          version: data.version,
          source: data.source,
          completeness: data.completeness,
        },
        update: {
          version: data.version,
          source: data.source,
          completeness: data.completeness,
          importedAt: new Date(),
        },
      });
    },
    { timeout: 600000 },
  );
  console.log(
    `Imported ${data.items.length} items and ${data.recipes.length} recipes (${data.completeness}).`,
  );
}
main().finally(() => catalog.$disconnect());
