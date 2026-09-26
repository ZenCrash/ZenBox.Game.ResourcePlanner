import { readFile, mkdir, copyFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { catalog } from "../lib/db";

async function main() {
  const fluidMode = process.argv.includes("--fluids");
  const repairMode = process.argv.includes("--repairs");
  const root = path.resolve("data/extraction/instance/minecraft/dumps");
  if (fluidMode) {
    const source = path.join(root, "planner/fluids.json");
    const fluids: { id: string; name: string; tooltip: string }[] = JSON.parse(
      await readFile(source, "utf8"),
    );
    for (let offset = 0; offset < fluids.length; offset += 250) {
      await catalog.$transaction(
        fluids.slice(offset, offset + 250).map((fluid, index) => {
          const details = {
            name: fluid.name,
            tooltip: JSON.stringify(fluid.tooltip.split("<br>")),
          };
          return catalog.item.upsert({
            where: { id: fluid.id },
            update: details,
            create: {
              id: fluid.id,
              registryId: fluid.id,
              ...details,
              mod: "Fluids",
              group: "Fluids",
              hidden: true,
              kind: "fluid",
              sortOrder: 1000000 + offset + index,
            },
          });
        }),
      );
    }
    await copyFile(source, "data/catalogs/gtnh-2.8.4.fluids.json");
  }
  const icons: [string, string, number, number][] = JSON.parse(
    await readFile(
      path.join(
        root,
        repairMode
          ? "planner/repair-icons.json"
          : fluidMode
            ? "planner/fluid-icons.json"
            : "planner/icons.json",
      ),
      "utf8",
    ),
  );
  const destination = path.resolve("public/assets/gtnh-2.8.4/items");
  await mkdir(destination, { recursive: true });
  let installed = 0;
  for (let offset = 0; offset < icons.length; offset += 250) {
    const batch: { id: string; image: string }[] = [];
    for (const [id, sourceName] of icons.slice(offset, offset + 250)) {
      if (path.basename(sourceName) !== sourceName)
        throw new Error("Invalid icon filename");
      const source = path.join(root, "icons", sourceName);
      await access(source);
      const filename = createHash("sha256").update(id).digest("hex") + ".png";
      await copyFile(source, path.join(destination, filename));
      batch.push({ id, image: "/assets/gtnh-2.8.4/items/" + filename });
    }
    await catalog.$transaction(
      batch.map(({ id, image }) =>
        catalog.item.updateMany({ where: { id }, data: { image } }),
      ),
    );
    installed += batch.length;
    if (offset % 10000 === 0)
      console.log(`Installed ${installed} / ${icons.length} rendered icons`);
  }
  console.log(`Installed ${installed} local icons; catalog remains partial.`);
}
main().finally(() => catalog.$disconnect());
