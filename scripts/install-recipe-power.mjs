import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { recipePowerDetails } from "./recipe-power.mjs";

// Patch only recipe details, preserving IDs, layouts, and existing diagrams.
const handlers = JSON.parse(
  await readFile(
    "data/extraction/instance/minecraft/dumps/planner/recipes.json",
    "utf8",
  ),
);
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
try {
  const find = db.prepare("SELECT details FROM Recipe WHERE id = ?");
  const update = db.prepare("UPDATE Recipe SET details = ? WHERE id = ?");
  const counts = {};
  db.transaction(() => {
    for (const handler of handlers) {
      for (const raw of handler.recipes) {
        const power = recipePowerDetails(handler, raw);
        if (!power.length) continue;
        const id = createHash("sha256")
          .update(JSON.stringify([handler.source, handler.name, raw]))
          .digest("hex");
        const row = find.get(id);
        if (!row) continue; // Normalization can omit incomplete recipes.
        const details = JSON.parse(row.details).filter(
          (line) => !/^(Voltage|Amperage):/.test(line),
        );
        update.run(JSON.stringify([...power, ...details]), id);
        counts[handler.name] = (counts[handler.name] ?? 0) + 1;
      }
    }
  })();
  console.log(counts);
} finally {
  db.close();
}
