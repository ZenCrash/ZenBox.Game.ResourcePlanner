import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

// Read the matching 5.09.51.482 sources; never infer capacity from the
// ingredients of whichever recipes happen to be present in the export.
const maps = {};
for (const file of await readdir("data/extraction/power-source")) {
  if (!file.endsWith("RecipeMaps.java") && file !== "DEFCRecipes.java")
    continue;
  const source = await readFile(`data/extraction/power-source/${file}`, "utf8");
  for (const definition of source.split("public static final")) {
    const id = /\.of\("([^"]+)"/.exec(definition)?.[1];
    const counts =
      /\.maxIO\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(
        definition,
      );
    if (!id || !counts) continue;
    maps[id] = Object.fromEntries(
      ["itemInputs", "itemOutputs", "fluidInputs", "fluidOutputs"].map(
        (key, index) => [key, Number(counts[index + 1])],
      ),
    );
  }
}
// Constants in EyeOfHarmonyFrontend (9 columns, 9 item / 2 fluid rows)
// and MTETreeFarm.Mode (LOG, SAPLING, LEAVES, FRUIT) in the same release.
maps["gt.recipe.eyeofharmony"] = {
  itemInputs: 1,
  itemOutputs: 81,
  fluidInputs: 0,
  fluidOutputs: 18,
};
maps["gtpp.recipe.treefarm"] = {
  itemInputs: 4,
  itemOutputs: 4,
  fluidInputs: 0,
  fluidOutputs: 0,
};
const categories = {
  "gt.recipe.category.alloy_smelter_molding": "gt.recipe.alloysmelter",
  "gt.recipe.category.alloy_smelter_recycling": "gt.recipe.alloysmelter",
  "gt.recipe.category.tic_bolt_molding": "gt.recipe.fluidsolidifier",
  "gt.recipe.category.tic_part_extruding": "gt.recipe.extruder",
  "gt.recipe.category.macerator_recycling": "gt.recipe.macerator",
  "gt.recipe.category.fluid_extractor_recycling": "gt.recipe.fluidextractor",
  "gt.recipe.category.forge_hammer_recycling": "gt.recipe.hammer",
  "gt.recipe.category.arc_furnace_recycling": "gt.recipe.arcfurnace",
  "gtpp.recipe.category.abs_non_alloy_recipes": "gtpp.recipe.alloyblastsmelter",
};
for (const [category, parent] of Object.entries(categories)) {
  if (!maps[parent]) throw new Error(`Missing recipe map: ${parent}`);
  maps[category] = maps[parent];
}
await writeFile(
  "data/catalogs/gtnh-2.8.4.recipe-slots.json",
  JSON.stringify(
    {
      source:
        "GT5-Unofficial 5.09.51.482 RecipeMapBuilder.maxIO (item inputs, item outputs, fluid inputs, fluid outputs)",
      maps,
    },
    null,
    2,
  ) + "\n",
);

const handlers = JSON.parse(
  await readFile(
    "data/extraction/instance/minecraft/dumps/planner/recipes.json",
    "utf8",
  ),
);
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
try {
  const update = db.prepare(
    "UPDATE Recipe SET layout = json_set(layout, '$.slotCounts', json(?)) WHERE id = ?",
  );
  let count = 0;
  const missing = [];
  db.transaction(() => {
    for (const handler of handlers) {
      if (handler.kind !== "gregtech" || !handler.recipes.length) continue;
      const slots = handler.slotCounts ?? maps[handler.overlay];
      if (!slots) {
        missing.push(handler.name);
        continue;
      }
      for (const raw of handler.recipes) {
        const id = createHash("sha256")
          .update(JSON.stringify([handler.source, handler.name, raw]))
          .digest("hex");
        count += update.run(JSON.stringify(slots), id).changes;
      }
    }
  })();
  console.log({ updated: count, unmappedHandlers: missing });
} finally {
  db.close();
}
