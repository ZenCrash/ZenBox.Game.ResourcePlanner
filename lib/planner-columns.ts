// Ignore feedback edges for placement while retaining them in the graph.
export function plannerColumns(count: number, links: { source: number; target: number }[]) {
  const columns = new Map<number, number>();
  const visiting = new Set<number>();
  const column = (index: number): number => {
    const known = columns.get(index);
    if (known !== undefined) return known;
    visiting.add(index);
    let value = 0;
    for (const link of links) {
      if (link.target !== index || visiting.has(link.source)) continue;
      value = Math.max(value, column(link.source) + 1);
    }
    visiting.delete(index);
    columns.set(index, value);
    return value;
  };
  for (let index = 0; index < count; index++) column(index);
  return columns;
}


// Recovery chains occupy separate rows above production, ending immediately
// before the earliest consumer they feed back into.
export function plannerPositions(count: number, links: { source: number; target: number }[], recovery: Set<number>) {
  const productionLinks = links.filter(l => !recovery.has(l.source) && !recovery.has(l.target));
  const columns = plannerColumns(count, productionLinks);
  const positions = new Map<number, { column: number; row: number }>();
  const rows = new Map<number, number>();
  for (let index = 0; index < count; index++) {
    if (recovery.has(index)) continue;
    const column = columns.get(index)!;
    const row = rows.get(column) ?? 0;
    positions.set(index, { column, row });
    rows.set(column, row + 1);
  }
  const remaining = new Set(recovery);
  let top = 0;
  while (remaining.size) {
    const members = [remaining.values().next().value!];
    remaining.delete(members[0]);
    for (let i = 0; i < members.length; i++) {
      for (const link of links) {
        const neighbor = link.source === members[i] ? link.target : link.target === members[i] ? link.source : -1;
        if (remaining.delete(neighbor)) members.push(neighbor);
      }
    }
    const memberSet = new Set(members);
    const internal = plannerColumns(count, links.filter(l => memberSet.has(l.source) && memberSet.has(l.target)));
    const returns = links.filter(l => memberSet.has(l.source) && positions.has(l.target));
    const start = returns.length ? Math.min(...returns.map(l => positions.get(l.target)!.column - internal.get(l.source)! - 1)) : 0;
    const lanes = new Map<number, number>();
    let height = 1;
    for (const index of members) {
      const column = start + internal.get(index)!;
      const lane = lanes.get(column) ?? 0;
      lanes.set(column, lane + 1);
      height = Math.max(height, lane + 1);
      positions.set(index, { column, row: top - 1 - lane });
    }
    top -= height;
  }
  return positions;
}
