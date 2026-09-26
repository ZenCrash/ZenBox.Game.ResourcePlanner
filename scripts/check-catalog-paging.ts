import assert from "node:assert/strict";
import { GET } from "../app/api/catalog/route";
import { catalog, db } from "../lib/db";

async function main() {
  for (const page of [0, 1, 2, 1]) {
    const start = performance.now();
    const response = await GET(
      new Request(`http://local/api/catalog?page=${page}`),
    );
    const result = await response.json();
    assert.equal(result.page, page);
    assert.equal(result.tiles.length, 104);
    assert.ok(result.tiles.every((tile: { item: unknown }) => tile.item));
    console.log(
      `Page ${page + 1}: ${(performance.now() - start).toFixed(1)} ms; ${JSON.stringify(result).length} characters`,
    );
  }
  const closed = await (
    await GET(new Request("http://local/api/catalog?q=minecraft:wool"))
  ).json();
  assert.equal(closed.total, 16);
  assert.equal(closed.tiles.length, 1);
  const group = closed.tiles[0].groupId;
  assert.ok(
    closed.itemGroups.some((item: { id: string }) => item.id === group),
  );
  const open = await (
    await GET(
      new Request(
        `http://local/api/catalog?q=minecraft:wool&expanded=${group}`,
      ),
    )
  ).json();
  assert.equal(open.tiles.length, 16);
  const again = await (
    await GET(new Request("http://local/api/catalog?q=minecraft:wool"))
  ).json();
  assert.equal(again.tiles.length, 1);
  console.log("Search and expanded-group cache isolation passed.");
}
main().finally(async () => {
  await catalog.$disconnect();
  await db.$disconnect();
});
