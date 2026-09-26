import { readFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import { catalog } from "../lib/db";

async function main() {
  const zip = new AdmZip(
    "data/extraction/instance/minecraft/mods/NotEnoughItems-2.8.44-GTNH.jar",
  );
  const rows = zip
    .readAsText("assets/nei/csv/catalysts.csv")
    .split(/\r?\n/)
    .slice(1)
    .map((line) =>
      (line.match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g) ?? []).map((cell) =>
        cell.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'),
      ),
    );
  const raw: { name: string; source: string; overlay?: string }[] = JSON.parse(
    await readFile(
      "data/extraction/instance/minecraft/dumps/planner/recipes.json",
      "utf8",
    ),
  );
  const { icons } = JSON.parse(
    await readFile("data/catalogs/gtnh-2.8.4.recipe-tab-icons.json", "utf8"),
  );
  const items = await catalog.item.findMany({
    select: { id: true, registryId: true },
  });
  const ids = new Set(items.map((item) => item.id));
  const namespaces = new Set(
    items.map((item) => item.registryId.split(":")[0].toLowerCase()),
  );
  // GTNH's DreamCraft integration has no reliable item namespace of its own.
  namespaces.add("dreamcraft");
  const mappings = new Map<string, Map<string, number>>();
  for (const handler of raw) {
    const machines = mappings.get(handler.name) ?? new Map<string, number>();
    for (const row of rows) {
      if (row[0] !== handler.overlay && row[0] !== handler.source) continue;
      if (row[2] || (row[5] && namespaces.has(row[5].toLowerCase()))) continue;
      const id = row[1]?.replace(/:0$/, "");
      if (ids.has(id)) machines.set(id, Number(row[6]) || 0);
    }
    mappings.set(handler.name, machines);
  }
  let count = 0;
  for (const [handler, machines] of mappings) {
    const fallback = icons[handler]?.itemId;
    if (!machines.size && fallback && ids.has(fallback))
      machines.set(fallback, 0);
    if (!machines.size) continue;
    const machineIds = [...machines]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    await catalog.$executeRaw`UPDATE Recipe SET layout = json_set(layout, '$.machineIds', json(${JSON.stringify(machineIds)})) WHERE handler = ${handler}`;
    count++;
  }
  console.log(`Installed machine slots for ${count} recipe handlers.`);
}
main().finally(() => catalog.$disconnect());
