import Database from "better-sqlite3";

// Patch existing catalogs without needing the original full runtime dump.
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
try {
  const ebf = "gregtech:gt.blockmachines:1000";
  const helioflare = "gregtech:gt.blockmachines:15412";
  const icon = db
    .prepare("SELECT image FROM Item WHERE id = ?")
    .get(ebf)?.image;
  if (!icon || !db.prepare("SELECT id FROM Item WHERE id = ?").get(helioflare))
    throw new Error(
      "Required Blast Furnace machines are missing from the catalog",
    );
  const rows = db
    .prepare("SELECT id, layout FROM Recipe WHERE handler = 'Blast Furnace'")
    .all();
  const update = db.prepare("UPDATE Recipe SET layout = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      const layout = JSON.parse(row.layout);
      layout.tabIcon = icon;
      layout.machineIds = [
        ...new Set([ebf, ...(layout.machineIds ?? []), helioflare]),
      ].filter((id) => id !== "IC2:blockMachine3:1");
      update.run(JSON.stringify(layout), row.id);
    }
  })();
  console.log(`Updated ${rows.length} Blast Furnace recipes.`);
} finally {
  db.close();
}
