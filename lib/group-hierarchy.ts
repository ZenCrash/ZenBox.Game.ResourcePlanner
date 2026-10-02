type Group = { id: string; position: { x: number; y: number }; width?: number; height?: number };
/** Choose the smallest fully enclosing group. Equal bounds are peers, avoiding cycles. */
export function groupHierarchy(groups: Group[]) {
  const area = (g: Group) => (g.width ?? 640) * (g.height ?? 480);
  const parent = new Map<string, string>();
  const children = new Map(groups.map(g => [g.id, [] as string[]]));
  for (const child of groups) {
    const enclosing = groups.filter(g => g.id !== child.id && area(g) > area(child) &&
      g.position.x <= child.position.x && g.position.y <= child.position.y &&
      g.position.x + (g.width ?? 640) >= child.position.x + (child.width ?? 640) &&
      g.position.y + (g.height ?? 480) >= child.position.y + (child.height ?? 480))
      .sort((a,b) => area(a)-area(b) || a.id.localeCompare(b.id))[0];
    if (enclosing) { parent.set(child.id,enclosing.id); children.get(enclosing.id)!.push(child.id); }
  }
  const depth = new Map<string, number>();
  for (const group of groups) {
    let level=0, id=group.id;
    while (parent.has(id)) { level++; id=parent.get(id)!; }
    depth.set(group.id,level);
  }
  return { parent, children, depth, roots: groups.filter(g => !parent.has(g.id)).map(g => g.id) };
}


/** Group membership remains fixed until a drag or resize completes. */
export class GroupHierarchyCache {
  private value?: ReturnType<typeof groupHierarchy>;
  private bounds?: Group[];
  get(groups: Group[], interacting = false) {
    if (this.value && interacting) return this.value;
    const unchanged = this.bounds?.length === groups.length && groups.every((group, index) => {
      const old = this.bounds![index];
      return group.id === old.id && group.position.x === old.position.x && group.position.y === old.position.y && group.width === old.width && group.height === old.height;
    });
    if (!this.value || !unchanged) {
      this.value = groupHierarchy(groups);
      this.bounds = groups.map(group => ({ ...group, position: { ...group.position } }));
    }
    return this.value;
  }
}


export function reorderSiblingGroups<T extends Group & { type?: string }>(nodes: T[], source: string, target: string, after = false): T[] {
  if (source === target) return nodes;
  const groups=nodes.filter(node => node.type === "summary");
  const tree=groupHierarchy(groups);
  if (!tree.children.has(source) || !tree.children.has(target) || tree.parent.get(source) !== tree.parent.get(target)) return nodes;
  const siblings=groups.filter(node => tree.parent.get(node.id) === tree.parent.get(source));
  const moved=siblings.find(node=>node.id===source)!;
  const reordered=siblings.filter(node=>node.id!==source);
  reordered.splice(reordered.findIndex(node=>node.id===target)+(after?1:0),0,moved);
  if (siblings.every((node,index)=>node===reordered[index])) return nodes;
  const ids=new Set(siblings.map(node=>node.id));let index=0;
  return nodes.map(node=>ids.has(node.id)?reordered[index++]:node);
}
