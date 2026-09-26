import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { catalog } from "../lib/db";

export async function checkBundledCatalog({ allowPartial = false } = {}) {
  const info = await catalog.catalogInfo.findUnique({ where: { id: "gtnh" } });
  if (
    !info ||
    info.version !== "2.8.4" ||
    (!allowPartial && info.completeness !== "verified-nei-parity")
  ) {
    throw new Error(
      "GTNH 2.8.4 is not ready to ship: a complete, verified catalog must be bundled during development. Planner users must not have to supply game files or import a catalog.",
    );
  }
  const [itemCount, recipeCount, missingImages, items, recipes] =
    await Promise.all([
      catalog.item.count({ where: { hidden: false } }),
      catalog.recipe.count({ where: { enabled: true } }),
      catalog.item.count({
        where: {
          image: null,
          OR: [
            { hidden: false },
            { ingredients: { some: { recipe: { enabled: true } } } },
          ],
        },
      }),
      catalog.item.findMany({
        where: { image: { not: null } },
        select: { image: true },
      }),
      catalog.recipe.findMany({
        where: { enabled: true },
        select: { layout: true },
      }),
    ]);
  if (!itemCount || !recipeCount || (!allowPartial && missingImages))
    throw new Error(
      `Incomplete bundled data: ${itemCount} visible items, ${recipeCount} enabled recipes, ${missingImages} required icons missing.`,
    );
  const assets = new Set<string>([
    "/assets/minecraft-logo.png",
    "/assets/gtnh-2.8.4/logo.png",
  ]);
  for (const item of items) if (item.image) assets.add(item.image);
  for (const recipe of recipes) {
    const layout = JSON.parse(recipe.layout);
    if (layout.background) assets.add(layout.background);
  }
  const root = path.resolve("public/assets");
  const files: { path: string; bytes: number; sha256: string }[] = [];
  for (const asset of [...assets].sort()) {
    if (!asset.startsWith("/assets/"))
      throw new Error(`Non-local asset: ${asset}`);
    const file = path.resolve("public", `.${asset}`);
    if (!file.startsWith(root + path.sep))
      throw new Error(`Asset escapes bundle: ${asset}`);
    await access(file);
    const bytes = await readFile(file);
    if (!(await stat(file)).isFile() || !bytes.length)
      throw new Error(`Empty or invalid asset: ${asset}`);
    files.push({
      path: `public${asset}`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const database = await readFile("data/catalogs/gtnh-2.8.4.sqlite");
  return {
    game: "gtnh",
    version: "2.8.4",
    completeness: info.completeness,
    missingRequiredIcons: missingImages,
    source: info.source,
    itemCount,
    recipeCount,
    catalogSha256: createHash("sha256").update(database).digest("hex"),
    assets: files,
  };
}

if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/check-bundled-catalog.ts")
) {
  checkBundledCatalog()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => catalog.$disconnect());
}
