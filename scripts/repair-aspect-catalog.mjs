import Database from "better-sqlite3";

// The NEI export hides aspect tokens and masks undiscovered compound names.
// Metadata 1 is the token actually referenced by recipes; metadata 0 is a
// duplicate research token. Preserve IDs so existing recipes still connect.
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite");
const rows = db.prepare("SELECT id, name, metadata, nbt, tooltip FROM Item WHERE registryId = ?").all("thaumcraftneiplugin:Aspect");
const update = db.prepare('UPDATE Item SET name = ?, tooltip = ?, hidden = ?, "group" = ? WHERE id = ?');
db.transaction(() => {
  for (const row of rows) {
    const key = row.nbt.match(/key:"([^"]+)"/)?.[1];
    if (!key) continue;
    const name = /unknown aspect/i.test(row.name) ? `Aspect: ${key[0].toUpperCase()}${key.slice(1)}` : row.name;
    let tooltip;
    try { tooltip = JSON.parse(row.tooltip); } catch { tooltip = []; }
    tooltip = [name, ...tooltip.slice(1).filter(line => !/unknown aspect/i.test(line))];
    update.run(name, JSON.stringify(tooltip), row.metadata === 1 ? 0 : 1, "Thaumcraft Aspects", row.id);
  }
})();
console.log(`Repaired ${rows.length} aspect tokens; recipe variants are visible in Thaumcraft Aspects.`);
db.close();
