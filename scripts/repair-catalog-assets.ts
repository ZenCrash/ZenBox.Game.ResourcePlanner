import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalog } from "../lib/db";
import { GET as getCatalog } from "../app/api/catalog/route";
import { GET as getRecipes } from "../app/api/recipes/route";

const game = path.resolve("data/extraction/instance/minecraft");
async function main() {
  if (process.argv.includes("--prepare-images")) {
    const missing = await catalog.item.findMany({
      where: { image: null, kind: "item" },
    });
    const requests = [];
    for (const item of missing) {
      const representative =
        item.metadata === 32767
          ? await catalog.item.findFirst({
              where: {
                registryId: item.registryId,
                metadata: { not: 32767 },
                nbt: "",
                image: { not: null },
              },
              orderBy: { metadata: "asc" },
            })
          : null;
      if (item.metadata === 32767 && !representative)
        throw new Error(`No wildcard representative for ${item.id}`);
      requests.push({
        id: item.id,
        registryId: item.registryId,
        metadata: item.metadata,
        nbt: item.nbt,
        representativeMetadata: representative?.metadata ?? item.metadata,
        representativeId: representative?.id ?? null,
      });
    }
    await writeFile(
      path.join(game, "planner-export.image-repairs.json"),
      JSON.stringify(requests, null, 2),
    );
    await writeFile(
      "data/catalogs/gtnh-2.8.4.image-repairs.json",
      JSON.stringify(
        {
          source:
            "GTNH 2.8.4 runtime renderer; wildcard inputs use an explicit representative without changing recipe identity",
          items: requests,
        },
        null,
        2,
      ),
    );
    console.log(
      `Prepared ${requests.length} exact variant / wildcard representative renders`,
    );
  }
  if (process.argv.includes("--visibility")) {
    const source = path.join(game, "dumps/planner/visible-items.json");
    const ids: string[] = JSON.parse(await readFile(source, "utf8"));
    if (!ids.includes("minecraft:log2"))
      throw new Error(
        "Visibility export still omits acacia; refusing to apply",
      );
    const items = await catalog.item.findMany({ select: { id: true } });
    const known = new Set(items.map((item) => item.id));
    const absent = ids.filter((id) => !known.has(id));
    // Report unstable NBT identities instead of manufacturing catalog records.
    const ordering = new Map(ids.map((id, index) => [id, index]));
    for (let start = 0; start < items.length; start += 500) {
      await catalog.$transaction(
        items.slice(start, start + 500).map((item) =>
          catalog.item.update({
            where: { id: item.id },
            data: {
              hidden: !ordering.has(item.id),
              ...(ordering.has(item.id)
                ? { sortOrder: ordering.get(item.id)! }
                : {}),
            },
          }),
        ),
      );
    }
    await copyFile(source, "data/catalogs/gtnh-2.8.4.visible-items.json");
    await writeFile(
      "data/catalogs/gtnh-2.8.4.visibility-report.json",
      JSON.stringify(
        {
          source:
            "NEI 2.8.44 ItemList.items, after ItemInfo.isHidden filtering, before search and collapsed groups",
          exported: ids.length,
          searchable: ids.length - absent.length,
          absent,
        },
        null,
        2,
      ),
    );
    console.log(
      `Restored ${ids.length - absent.length} searchable items; ${absent.length} exported identities absent from catalog`,
    );
  }
  if (process.argv.includes("--verify")) {
    const page = await (
      await getCatalog(new Request("http://localhost/api/catalog?q=acacia"))
    ).json();
    if (
      !page.items.some(
        (item: { id: string; image: string | null }) =>
          item.id === "minecraft:log2" && item.image,
      )
    ) {
      throw new Error("Acacia log is missing from searchable catalog results");
    }
    const recipes = await (
      await getRecipes(
        new Request(
          "http://localhost/api/recipes?item=minecraft%3Alog2&mode=uses",
        ),
      )
    ).json();
    if (!recipes.length) throw new Error("Acacia log has no accessible uses");
    console.log(
      `Acacia search returns its local image; ${recipes.length} usage recipes are accessible`,
    );
    const items = await catalog.item.findMany({
      select: { id: true, image: true },
    });
    const missing: string[] = [];
    for (let start = 0; start < items.length; start += 500) {
      await Promise.all(
        items.slice(start, start + 500).map(async (item) => {
          if (!item.image || !item.image.startsWith("/assets/")) {
            missing.push(item.id);
            return;
          }
          try {
            await access(
              path.join(
                "data/game-assets",
                item.image.replace(/^\/assets\//, ""),
              ),
            );
          } catch {
            missing.push(item.id);
          }
        }),
      );
    }
    console.log(
      `${items.length} item records checked; ${missing.length} missing local images`,
    );
    if (missing.length) throw new Error(JSON.stringify(missing));
  }
}
main().finally(() => catalog.$disconnect());
