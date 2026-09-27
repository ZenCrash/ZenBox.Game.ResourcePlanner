import Database from "better-sqlite3";

// Backfill existing packs without requiring the original full runtime export.
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
try {
  const read = db.prepare("SELECT id,layout FROM Recipe WHERE handler = ?");
  const item = db.prepare("SELECT id FROM Item WHERE id = ?");
  const update = db.prepare("UPDATE Recipe SET layout = ? WHERE id = ?");
  const changes = [];
  for (const [category, parent] of [
    ["Alloy Smelter Molding", "Alloy Smelter"],
    ["Alloy Smelter Recycling", "Alloy Smelter"],
    ["Fluid Extractor Recycling", "Fluid Extractor"],
    ["Arc Furnace Recycling", "Arc Furnace"],
  ]) {
    const ids = [
      ...new Set(
        read.all(parent).flatMap((r) => JSON.parse(r.layout).machineIds ?? []),
      ),
    ].filter((id) => id.startsWith("gregtech:") && item.get(id));
    if (!ids.length)
      throw new Error(`No parent machines found for ${category}`);
    const recipes = read.all(category);
    for (const recipe of recipes) {
      const layout = JSON.parse(recipe.layout);
      layout.machineIds = [...new Set([...(layout.machineIds ?? []), ...ids])];
      changes.push([JSON.stringify(layout), recipe.id]);
    }
    console.log(
      `${category}: ${ids.length} machines, ${recipes.length} recipes`,
    );
  }
  db.transaction(() => {
    for (const change of changes) update.run(...change);
  })();
} finally {
  db.close();
}
