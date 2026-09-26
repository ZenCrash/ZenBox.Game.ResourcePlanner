import { readFile, writeFile, access } from "node:fs/promises";
import AdmZip from "adm-zip";
import { catalog } from "../lib/db";

function csvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "",
    quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  return [...cells, cell];
}
async function main() {
  const zip = new AdmZip(
    "data/extraction/instance/minecraft/mods/NotEnoughItems-2.8.44-GTNH.jar",
  );
  const rows = new Map(
    zip
      .readAsText("assets/nei/csv/handlers.csv")
      .split(/\r?\n/)
      .slice(1)
      .map(csvRow)
      .map((row) => [row[0], row]),
  );
  const raw: {
    name: string;
    source: string;
    overlay?: string;
    kind?: string;
  }[] = JSON.parse(
    await readFile(
      "data/extraction/instance/minecraft/dumps/planner/recipes.json",
      "utf8",
    ),
  );
  // The browser combines handlers with the same displayed name. Prefer the
  // vanilla icon for combined crafting tabs before mod-specific crafting icons.
  raw.sort(
    (a, b) =>
      Number(b.source.startsWith("codechicken.")) -
      Number(a.source.startsWith("codechicken.")),
  );
  const icons: Record<
    string,
    { image: string; itemId: string; handlerId: string }
  > = {};
  for (const handler of raw) {
    if (icons[handler.name]) continue;
    const row = rows.get(handler.overlay ?? "") ?? rows.get(handler.source);
    if (!row?.[2] || row[3]) continue;
    const id = row[2].replace(/:0$/, "");
    const item = await catalog.item.findUnique({ where: { id } });
    if (!item?.image) continue;
    await access("public" + item.image);
    icons[handler.name] = {
      image: item.image,
      itemId: item.id,
      handlerId: row[0],
    };
  }
  // Prefer actual LV catalysts for GT tabs, including names shared with other
  // mods. For missing icons without an LV machine, retain catalyst priority.
  const machineItems = await catalog.item.findMany({
    where: { registryId: "gregtech:gt.blockmachines" },
    select: { id: true, image: true, tooltip: true },
  });
  const byId = new Map(machineItems.map((item) => [item.id, item]));
  for (const handler of raw) {
    if (handler.kind !== "gregtech") continue;
    const recipe = await catalog.recipe.findFirst({
      where: { handler: handler.name },
      select: { layout: true },
    });
    const ids: string[] = JSON.parse(recipe?.layout ?? "{}").machineIds ?? [];
    const candidates = ids.flatMap((id) => {
      const item = byId.get(id);
      return item?.image ? [item] : [];
    });
    const lv = candidates.find((item) =>
      /Voltage IN:[^\"]*\(LV\)/.test(item.tooltip.replace(/§./g, "")),
    );
    const item = lv ?? (!icons[handler.name] ? candidates[0] : undefined);
    if (!item?.image) continue;
    await access("public" + item.image);
    icons[handler.name] = {
      image: item.image,
      itemId: item.id,
      handlerId: handler.overlay ?? handler.source,
    };
  }
  // Explicit preferences, including the lowest available Dehydrator (MV).
  const machineIcons = [
    {
      name: "Mixer",
      itemId: "gregtech:gt.blockmachines:581",
      handlerId: "gt.recipe.mixer",
    },
    {
      name: "Multiblock Mixer",
      itemId: "gregtech:gt.blockmachines:811",
      handlerId: "gtpp.recipe.multimixer",
    },
    {
      name: "Dehydrator",
      itemId: "gregtech:gt.blockmachines:911",
      handlerId: "gtpp.recipe.chemicaldehydrator",
    },
  ];
  for (const { name, itemId, handlerId } of machineIcons) {
    const item = await catalog.item.findUnique({ where: { id: itemId } });
    if (!item?.image) throw new Error(`Missing machine tab icon: ${name}`);
    await access("public" + item.image);
    icons[name] = { image: item.image, itemId, handlerId };
  }
  await catalog.$transaction(
    Object.entries(icons).map(
      ([handler, icon]) =>
        catalog.$executeRaw`UPDATE Recipe SET layout = json_set(layout, '$.tabIcon', ${icon.image}) WHERE handler = ${handler}`,
    ),
  );
  await writeFile(
    "data/catalogs/gtnh-2.8.4.recipe-tab-icons.json",
    JSON.stringify(
      {
        source:
          "NotEnoughItems 2.8.44-GTNH handler icons, with verified LV GregTech catalysts preferred and explicit Mixer/Multiblock Mixer/Dehydrator choices",
        icons,
      },
      null,
      2,
    ),
  );
  console.log(
    `Installed NEI item tab icons for ${Object.keys(icons).length} handler names; remaining tabs use a recipe item image.`,
  );
}
main().finally(() => catalog.$disconnect());
