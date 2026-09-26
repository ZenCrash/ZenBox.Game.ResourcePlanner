import { readFile, copyFile } from "node:fs/promises";
import { catalog } from "../lib/db";
function color(argb: number) {
  const n = argb >>> 0;
  return `rgba(${(n >>> 16) & 255}, ${(n >>> 8) & 255}, ${n & 255}, ${((n >>> 24) & 255) / 255})`;
}
async function main() {
  const source =
    "data/extraction/instance/minecraft/dumps/planner/item-groups.json";
  const raw: {
    collapsedColor: number;
    expandedColor: number;
    groups: { id: string; name: string; items: string[] }[];
  } = JSON.parse(await readFile(source, "utf8"));
  if (!raw.groups.length) throw new Error("No NEI groups exported");
  const known = new Set(
    (await catalog.item.findMany({ select: { id: true } })).map((i) => i.id),
  );
  const unknown = raw.groups.flatMap((group) =>
    group.items.filter((id) => !known.has(id)),
  );
  if (unknown.length)
    throw new Error(`Unknown group members: ${unknown.length}`);
  await catalog.$transaction(
    async (tx) => {
      await tx.item.updateMany({ data: { collapsibleGroupId: null } });
      await tx.itemGroup.deleteMany();
      for (const group of raw.groups) {
        await tx.itemGroup.create({
          data: {
            id: group.id,
            name: group.name || "",
            collapsedColor: color(raw.collapsedColor),
            expandedColor: color(raw.expandedColor),
          },
        });
        for (let i = 0; i < group.items.length; i += 500)
          await tx.item.updateMany({
            where: { id: { in: group.items.slice(i, i + 500) } },
            data: { collapsibleGroupId: group.id },
          });
      }
    },
    { timeout: 120000 },
  );
  await copyFile(source, "data/catalogs/gtnh-2.8.4.item-groups.json");
  console.log(
    `Imported ${raw.groups.length} exact NEI groups, ${raw.groups.reduce((sum, group) => sum + group.items.length, 0)} members`,
  );
}
main().finally(() => catalog.$disconnect());
