export type MachineConnection = { id?: string; style?: { stroke?: string }; source: string; target: string; data?: { reference?: boolean } };
export function machineConnectionTree(ids: string[], connections: MachineConnection[]) {
  const members = new Set(ids), seen = new Set<string>();
  const edges = connections.filter(edge => {
    const key = edge.id ?? JSON.stringify([edge.source, edge.target]);
    if (!members.has(edge.source) || !members.has(edge.target) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  const remaining = new Set(ids), order: string[] = [];
  const inCycle = (id: string) => {
    const visited = new Set<string>();
    const visit = (from: string): boolean => {
      if (visited.has(from)) return false;
      visited.add(from);
      return edges.some(edge => edge.source === from && remaining.has(edge.target) && (edge.target === id || visit(edge.target)));
    };
    return visit(id);
  };
  while (remaining.size) {
    const next = ids.find(id => remaining.has(id) && !edges.some(e => e.target === id && remaining.has(e.source))) ?? ids.find(id => remaining.has(id) && inCycle(id))!;
    remaining.delete(next); order.push(next);
  }
  const rows = new Map(order.map((id, row) => [id, row]));
  const occupied: number[] = [];
  const lines = edges.map(edge => ({ ...edge, from: rows.get(edge.source)!, to: rows.get(edge.target)! }))
    .sort((a,b) => Math.min(a.from,a.to) - Math.min(b.from,b.to) || Math.max(a.from,a.to) - Math.max(b.from,b.to))
    .map(edge => {
      const start = Math.min(edge.from, edge.to), end = Math.max(edge.from, edge.to);
      let lane = occupied.findIndex(last => last < start);
      if (lane < 0) lane = occupied.length;
      occupied[lane] = end;
      return { ...edge, lane, feedback: edge.to <= edge.from };
    });
  return { order, lines, width: 24 + occupied.length * 8 };
}
