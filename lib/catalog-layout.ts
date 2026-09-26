export type CatalogGroup = {
  id: string;
  name: string;
  collapsedColor: string;
  expandedColor: string;
};
export type CatalogTile = {
  id: string;
  groupId: string | null;
  expanded: boolean;
  count: number;
  first: boolean;
  backgroundId?: string;
};
export function catalogTiles(
  items: { id: string; collapsibleGroupId: string | null }[],
  expanded: Set<string>,
): CatalogTile[] {
  const groups = new Map<string, string[]>();
  for (const item of items)
    if (item.collapsibleGroupId) {
      const members = groups.get(item.collapsibleGroupId) ?? [];
      members.push(item.id);
      groups.set(item.collapsibleGroupId, members);
    }
  const seen = new Set<string>();
  const tiles: CatalogTile[] = [];
  for (const item of items) {
    const members =
      item.collapsibleGroupId && groups.get(item.collapsibleGroupId);
    if (!members || members.length < 2) {
      tiles.push({
        id: item.id,
        groupId: null,
        expanded: false,
        count: 1,
        first: true,
      });
      continue;
    }
    if (seen.has(item.collapsibleGroupId!)) continue;
    seen.add(item.collapsibleGroupId!);
    const open = expanded.has(item.collapsibleGroupId!);
    for (const [index, id] of (open ? members : members.slice(0, 1)).entries())
      tiles.push({
        id,
        groupId: item.collapsibleGroupId,
        expanded: open,
        count: members.length,
        first: index === 0,
        ...(!open ? { backgroundId: members.at(-1) } : {}),
      });
  }
  return tiles;
}
