// Add the actual post-initialization TConstruct registry to an existing catalog.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const source =
  process.argv[2] ??
  "data/extraction/instance/minecraft/dumps/planner/casting-table.json";
const rows = JSON.parse(fs.readFileSync(source, "utf8"));
if (!Array.isArray(rows) || !rows.length)
  throw new Error("Empty casting export");
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
db.pragma("foreign_keys = ON");
try {
  const items = db
    .prepare(
      "SELECT id, registryId, metadata, nbt, name FROM Item ORDER BY hidden, sortOrder, id",
    )
    .all();
  const key = (s) => JSON.stringify([s.registryId, s.metadata, s.nbt]);
  const known = new Map(items.map((item) => [key(item), item]));
  const icons = new Map(
    JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(source), "casting-icons.json"),
        "utf8",
      ),
    ).map(([id, file]) => [id, file]),
  );
  const added = new Map();
  for (const row of rows)
    for (const stack of [row.cast, row.output]) {
      if (!stack || stack.metadata === 32767 || known.has(key(stack))) continue;
      const filename = icons.get(stack.id);
      if (
        !stack.id ||
        !stack.name ||
        !filename ||
        path.basename(filename) !== filename
      )
        throw new Error(
          `Missing exported item metadata/icon: ${JSON.stringify(stack)}`,
        );
      const icon = path.resolve(path.dirname(source), "../icons", filename);
      if (!fs.existsSync(icon))
        throw new Error(`Missing rendered icon: ${icon}`);
      const imageName =
        createHash("sha256").update(stack.id).digest("hex") + ".png";
      const item = {
        ...stack,
        image: "/assets/gtnh-2.8.4/items/" + imageName,
        icon,
        imageName,
      };
      known.set(key(item), item);
      items.push(item);
      added.set(item.id, item);
    }
  const byId = db.prepare("SELECT id, name, image FROM Item WHERE id = ?");
  const resolve = (stack, ignoreNBT = false) => {
    if (!stack) return null;
    const accepted =
      stack.metadata === 32767 || ignoreNBT
        ? items.filter(
            (i) =>
              i.registryId === stack.registryId &&
              (stack.metadata === 32767 || i.metadata === stack.metadata),
          )
        : [];
    const item = known.get(key(stack)) ?? accepted[0];
    if (!item)
      throw new Error(`Missing catalog stack: ${JSON.stringify(stack)}`);
    return {
      ...item,
      amount: stack.amount,
      alternatives: accepted.map((v) => v.id).filter((id) => id !== item.id),
    };
  };
  const table = byId.get("TConstruct:SearedBlock");
  if (!table) throw new Error("Casting Table item missing");
  // Validate every reference before writing anything; never silently drop recipes.
  const recipes = rows.map((row) => {
    const output = resolve(row.output),
      cast = resolve(row.cast, row.ignoreNBT),
      fluid = byId.get(row.fluid);
    if (!output || !fluid || !(row.amount > 0) || !(row.durationTicks >= 0))
      throw new Error(`Invalid casting recipe: ${JSON.stringify(row)}`);
    const ingredients = [
      ...(cast
        ? [
            {
              itemId: cast.id,
              direction: "input",
              amount: cast.amount,
              consumed: row.consumeCast,
              slot: 0,
              alternatives: cast.alternatives,
            },
          ]
        : []),
      {
        itemId: fluid.id,
        direction: "input",
        amount: row.amount,
        consumed: true,
        slot: 1,
      },
      {
        itemId: output.id,
        direction: "output",
        amount: output.amount,
        consumed: true,
        slot: 0,
      },
    ];
    const id =
      "tconstruct-casting-table:" +
      createHash("sha256")
        .update(
          JSON.stringify([
            row.cast ? key(row.cast) : null,
            row.cast?.amount,
            key(row.output),
            row.output.amount,
            row.fluid,
            row.amount,
            row.consumeCast,
            row.ignoreNBT,
            row.durationTicks,
          ]),
        )
        .digest("hex");
    return {
      id,
      name: output.name,
      durationTicks: row.durationTicks,
      ingredients,
    };
  });
  const layout = JSON.stringify({
    tabIcon: table.image,
    machineIds: [table.id, "TConstruct:SearedBlockNether"].filter((id) =>
      byId.get(id),
    ),
    slotCounts: {
      itemInputs: 1,
      fluidInputs: 1,
      itemOutputs: 1,
      fluidOutputs: 0,
    },
  });
  const upsert = db.prepare(
    "INSERT INTO Recipe (id,name,handler,durationTicks,euPerTick,enabled,layout,details) VALUES (?,?,'Casting Table',?,0,1,?,'[]') ON CONFLICT(id) DO UPDATE SET name=excluded.name,durationTicks=excluded.durationTicks,layout=excluded.layout",
  );
  const remove = db.prepare("DELETE FROM Ingredient WHERE recipeId = ?");
  const insert = db.prepare(
    "INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,alternatives) VALUES (?,?,?,?,1,?,?,?)",
  );
  const insertVariant = db.prepare(
    "INSERT INTO IngredientVariant (ingredientId,itemId) VALUES (?,?)",
  );
  const insertItem = db.prepare(
    "INSERT INTO Item (id,registryId,metadata,nbt,name,mod,\"group\",tooltip,image,hidden,sortOrder,kind) VALUES (?,?,?,?,?,?,?,?,?,1,0,'item')",
  );
  const assetDir = "data/game-assets/gtnh-2.8.4/items";
  fs.mkdirSync(assetDir, { recursive: true });
  for (const item of added.values())
    fs.copyFileSync(item.icon, path.join(assetDir, item.imageName));
  db.transaction(() => {
    for (const i of added.values()) {
      const mod = i.registryId.split(":")[0];
      insertItem.run(
        i.id,
        i.registryId,
        i.metadata,
        i.nbt,
        i.name,
        mod,
        mod,
        JSON.stringify(String(i.tooltip ?? "").split("<br>")),
        i.image,
      );
    }
    for (const recipe of recipes) {
      upsert.run(recipe.id, recipe.name, recipe.durationTicks, layout);
      remove.run(recipe.id);
      for (const i of recipe.ingredients) {
        const result = insert.run(
          recipe.id,
          i.itemId,
          i.direction,
          i.amount,
          Number(i.consumed),
          i.slot,
          JSON.stringify(i.alternatives ?? []),
        );
        for (const id of i.alternatives ?? [])
          insertVariant.run(result.lastInsertRowid, id);
      }
    }
  })();
  console.log(
    `Installed ${new Set(recipes.map((r) => r.id)).size} Casting Table recipes and ${added.size} missing item variants.`,
  );
} finally {
  db.close();
}
