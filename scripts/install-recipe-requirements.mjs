import Database from "better-sqlite3";
import { recipeRequirementDetails } from "./recipe-requirements.mjs";

// Only replace the exact exported requirement flags; keep all other details.
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
try {
  const rows = db
    .prepare(
      `SELECT id, details FROM Recipe
    WHERE EXISTS (SELECT 1 FROM json_each(Recipe.details)
      WHERE value IN ('Special value: -100', 'Special value: -200', 'Special value: -300'))`,
    )
    .all();
  const update = db.prepare("UPDATE Recipe SET details = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of rows) {
      const details = JSON.parse(row.details).flatMap((line) => {
        const match = /^Special value: (-100|-200|-300)$/.exec(line);
        return match ? recipeRequirementDetails(Number(match[1])) : [line];
      });
      update.run(JSON.stringify([...new Set(details)]), row.id);
    }
  })();
  console.log(`Updated requirements for ${rows.length} recipes.`);
} finally {
  db.close();
}
