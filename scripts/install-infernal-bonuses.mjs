import fs from "node:fs";
import Database from "better-sqlite3";

const raw = JSON.parse(
  fs.readFileSync(
    "data/extraction/instance/minecraft/dumps/planner/infernal-recipes.json",
    "utf8",
  ),
);
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
db.pragma("foreign_keys = ON");
try {
  const recipes = db
    .prepare(
      "SELECT id,details FROM Recipe WHERE handler = 'Infernal Blast Furnace'",
    )
    .all();
  const ingredients = db.prepare(
    "SELECT * FROM Ingredient WHERE recipeId = ? ORDER BY slot",
  );
  const hasItem = db.prepare("SELECT id FROM Item WHERE id = ?");
  const changes = recipes.map((recipe) => {
    const slots = ingredients.all(recipe.id);
    const output = slots.find((i) => i.direction === "output");
    const input = slots.find((i) => i.direction === "input");
    const ids = new Set([input.itemId, ...JSON.parse(input.alternatives)]);
    const matches = raw.filter(
      (r) =>
        r.outputs.some(
          (o) => o.id === output.itemId && o.amount === output.amount,
        ) &&
        r.inputs.some(
          (i) =>
            ids.has(i.id) || (i.alternatives ?? []).some((a) => ids.has(a.id)),
        ),
    );
    if (
      !matches.length ||
      new Set(matches.map((r) => JSON.stringify(r.bonus))).size !== 1
    )
      throw new Error(`Ambiguous/missing runtime match for ${recipe.id}`);
    const bonus = matches[0].bonus;
    if (bonus.length > 1 || bonus.some((i) => !hasItem.get(i.id)))
      throw new Error(`Invalid bonus for ${recipe.id}`);
    return { ...recipe, bonus: bonus[0] };
  });
  const clear = db.prepare(
    "DELETE FROM Ingredient WHERE recipeId = ? AND direction = 'output' AND slot = 1",
  );
  const insert = db.prepare(
    "INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,x,y,alternatives) VALUES (?,?,'output',?,0.25,1,1,126,39,'[]')",
  );
  const details = db.prepare("UPDATE Recipe SET details = ? WHERE id = ?");
  db.transaction(() => {
    for (const recipe of changes) {
      clear.run(recipe.id);
      if (recipe.bonus)
        insert.run(recipe.id, recipe.bonus.id, recipe.bonus.amount);
      details.run(
        JSON.stringify(
          JSON.parse(recipe.details).filter(
            (s) =>
              s !==
              "Additional handler slots require classification; see extraction report.",
          ),
        ),
        recipe.id,
      );
    }
  })();
  console.log(
    `Restored ${changes.filter((r) => r.bonus).length} bonus outputs across ${changes.length} Infernal Blast Furnace recipes (25% base chance without Arcane Bellows).`,
  );
} finally {
  db.close();
}
