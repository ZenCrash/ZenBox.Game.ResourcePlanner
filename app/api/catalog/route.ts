import { isGtnhInstalled } from "@/lib/game-packs";
import { catalog } from "@/lib/db";
import { catalogTiles } from "@/lib/catalog-layout";
import { AsyncCache } from "@/lib/async-cache";

const metadata = new AsyncCache<Awaited<ReturnType<typeof readMetadata>>>(1);
const layouts = new AsyncCache<{
  total: number;
  tiles: ReturnType<typeof catalogTiles>;
}>(16);
async function readMetadata() {
  const [groups, itemGroups, info] = await Promise.all([
    catalog.item.groupBy({
      by: ["group"],
      where: { hidden: false },
      orderBy: { group: "asc" },
    }),
    catalog.itemGroup.findMany(),
    catalog.catalogInfo.findFirst(),
  ]);
  return { groups: groups.map((g) => g.group), itemGroups, info };
}
export async function GET(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const url = new URL(request.url),
    query = (url.searchParams.get("q") ?? "").slice(0, 200),
    group = url.searchParams.get("group");
  const page = Math.max(
    0,
    Math.min(100000, Number(url.searchParams.get("page")) || 0),
  );
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize =
    Number.isFinite(requestedSize) && requestedSize > 0
      ? Math.min(1000, Math.max(1, Math.floor(requestedSize)))
      : 104;
  const where = {
    hidden: false,
    ...(group ? { group } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { registryId: { contains: query } },
            { mod: { contains: query.replace(/^@/, "") } },
          ],
        }
      : {}),
  };
  const expanded = new Set(
    (url.searchParams.get("expanded") ?? "")
      .split(",")
      .filter(Boolean)
      .slice(0, 2000),
  );
  const [{ tiles, total }, { groups, itemGroups, info }] = await Promise.all([
    layouts.get(
      JSON.stringify([query, group, [...expanded].sort()]),
      async () => {
        const matching = await catalog.item.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, collapsibleGroupId: true },
        });
        return {
          tiles: catalogTiles(matching, expanded),
          total: matching.length,
        };
      },
    ),
    metadata.get("metadata", readMetadata),
  ]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(tiles.length / pageSize) - 1),
  );
  const visible = tiles.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const items = await catalog.item.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            visible.flatMap((tile) =>
              tile.backgroundId ? [tile.id, tile.backgroundId] : [tile.id],
            ),
          ),
        ],
      },
    },
  });
  const map = new Map(items.map((item) => [item.id, item]));
  return Response.json({
    items: visible.map((tile) => map.get(tile.id)),
    tiles: visible.map((tile) => ({
      ...tile,
      item: map.get(tile.id),
      backgroundItem: tile.backgroundId
        ? map.get(tile.backgroundId)
        : undefined,
    })),
    total,
    displayTotal: tiles.length,
    page: currentPage,
    itemGroups: itemGroups.filter((g) =>
      visible.some((tile) => tile.groupId === g.id),
    ),
    groups,
    info,
  });
}
