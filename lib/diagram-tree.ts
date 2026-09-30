import { z } from "zod";
export const treeEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["diagram", "folder"]),
  parentId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(100).optional(),
  collapsed: z.boolean().optional(),
});
export type TreeEntry = z.infer<typeof treeEntrySchema>;
export type DiagramTree = { revision: number; entries: TreeEntry[] };
export const diagramTreeSchema = z.object({
  revision: z.number().int().nonnegative(),
  entries: z.array(treeEntrySchema).max(10000),
});
export function reconcileTree(
  entries: TreeEntry[],
  diagrams: { id: string }[],
): TreeEntry[] {
  const ids = new Set(diagrams.map((d) => d.id));
  const result = entries.filter((e) => e.kind === "folder" || ids.has(e.id));
  const present = new Set(result.map((e) => e.id));
  return [
    ...result,
    ...diagrams
      .filter((d) => !present.has(d.id))
      .map((d) => ({ id: d.id, kind: "diagram" as const, parentId: null })),
  ];
}
export function validateTree(entries: TreeEntry[], diagramIds: Set<string>) {
  const map = new Map(entries.map((e) => [e.id, e]));
  if (map.size !== entries.length) throw new Error("Duplicate tree entries.");
  for (const entry of entries) {
    if (entry.kind === "diagram" && !diagramIds.has(entry.id))
      throw new Error("Diagram does not belong to this project.");
    if (entry.kind === "folder" && (!entry.name || diagramIds.has(entry.id)))
      throw new Error("Invalid folder.");
    const visited = new Set([entry.id]);
    let parent = entry.parentId;
    while (parent) {
      if (visited.has(parent))
        throw new Error("A folder cannot contain itself.");
      visited.add(parent);
      const node = map.get(parent);
      if (!node || node.kind !== "folder")
        throw new Error("Invalid parent folder.");
      if (visited.size > 32)
        throw new Error("Folders can be nested up to 31 levels.");
      parent = node.parentId;
    }
  }
}
export function subtree(entries: TreeEntry[], id: string): Set<string> {
  const ids = new Set([id]);
  const visit = (parent: string) => {
    for (const e of entries)
      if (e.parentId === parent && !ids.has(e.id)) {
        ids.add(e.id);
        visit(e.id);
      }
  };
  visit(id);
  return ids;
}
export function selectTreeEntry(
  entries: TreeEntry[],
  selected: Set<string>,
  id: string,
  additive: boolean,
) {
  const next = additive ? new Set(selected) : new Set<string>();
  const removing = additive && next.has(id);
  for (const child of subtree(entries, id)) {
    if (removing) next.delete(child);
    else next.add(child);
  }
  // A folder is selected only when all its descendants are selected.
  const folders = entries.filter((e) => e.kind === "folder");
  for (let pass = 0; pass <= folders.length; pass++) {
    let changed = false;
    for (const folder of folders) {
      const children = entries.filter((e) => e.parentId === folder.id);
      if (!children.length) continue;
      const full = children.every((e) => next.has(e.id));
      if (!full && next.has(folder.id)) {
        changed = true;
        next.delete(folder.id);
      }
    }
    if (!changed) break;
  }
  return next;
}
export function visibleTree(
  entries: TreeEntry[],
  parentId: string | null = null,
  depth = 0,
): { entry: TreeEntry; depth: number }[] {
  return entries
    .filter((e) => e.parentId === parentId)
    .flatMap((entry) => [
      { entry, depth },
      ...(entry.kind === "folder" && !entry.collapsed
        ? visibleTree(entries, entry.id, depth + 1)
        : []),
    ]);
}
export function moveTreeEntries(
  entries: TreeEntry[],
  selected: Set<string>,
  targetId: string | null,
  position: "before" | "after" | "inside",
): TreeEntry[] {
  const map = new Map(entries.map((e) => [e.id, e]));
  const roots = entries.filter((e) => {
    if (!selected.has(e.id)) return false;
    let parent = e.parentId;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = map.get(parent)?.parentId ?? null;
    }
    return true;
  });
  if (!roots.length) return entries;
  const moving = new Set(roots.flatMap((e) => [...subtree(entries, e.id)]));
  if (targetId && moving.has(targetId)) return entries;
  const target = targetId ? map.get(targetId) : undefined;
  if (targetId && !target) return entries;
  if (position === "inside" && target && target.kind !== "folder")
    return entries;
  const parentId =
    position === "inside" ? targetId : (target?.parentId ?? null);
  // Keep the dragged roots in their displayed tree order, including collapsed folders.
  const ordered = visibleTree(entries.map((e) => ({ ...e, collapsed: false })))
    .map((row) => row.entry)
    .filter((e) => roots.some((r) => r.id === e.id));
  const rootIds = new Set(roots.map((e) => e.id));
  const rest = entries.filter((e) => !rootIds.has(e.id));
  const index =
    target && position !== "inside"
      ? rest.findIndex((e) => e.id === targetId) +
        (position === "after" ? 1 : 0)
      : rest.length;
  rest.splice(index, 0, ...ordered.map((e) => ({ ...e, parentId })));
  const result = rest.map((e) =>
    e.id === parentId ? { ...e, collapsed: false } : e,
  );
  validateTree(
    result,
    new Set(result.filter((e) => e.kind === "diagram").map((e) => e.id)),
  );
  return result;
}
