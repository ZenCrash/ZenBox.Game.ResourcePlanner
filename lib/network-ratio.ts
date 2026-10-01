import { connectionColors, supplyColor } from "./model";

export type NetworkFlow = { source: string; target: string; input: string; supply: number; demand: number };

export function connectedMachines(start: string, edges: { source: string; target: string; data?: { reference?: boolean } }[], includeReferences = false) {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.data?.reference && !includeReferences) continue;
    for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a)!.add(b);
    }
  }
  const ids = new Set([start]);
  for (const id of ids) for (const neighbor of neighbors.get(id) ?? []) ids.add(neighbor);
  return ids;
}

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
function fraction(value: number) {
  let x = value, h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x), h = a * h1 + h0, k = a * k1 + k0;
    if (!Number.isSafeInteger(h) || k > 1000000) return null;
    if (Math.abs(h / k - value) <= 1e-10 * Math.max(1, value)) return [h, k];
    [h0, h1, k0, k1] = [h1, h, k1, k];
    x = 1 / (x - a);
  }
  return null;
}

// Solve all receiving-port balance equations together. Phase-I simplex finds
// a feasible positive solution (counts = y + 1, y >= 0), including shared inputs
// and cycles. Convert to whole counts and recheck the original rates before use.
export function networkMachineCounts(flows: NetworkFlow[], fixed?: Record<string, number>): Record<string, number> | null {
  if ((!flows.length && !Object.keys(fixed ?? {}).length) || flows.some(f => !Number.isFinite(f.supply) || !Number.isFinite(f.demand) || f.supply <= 0 || f.demand <= 0)) return null;
  if (fixed && Object.values(fixed).some(value => !Number.isFinite(value) || value <= 0 || value > 1e9)) return null;
  const ids = [...new Set([...flows.flatMap(f => [f.source, f.target]), ...Object.keys(fixed ?? {})])].sort();
  const groups = new Map<string, NetworkFlow[]>();
  for (const f of flows) { const key = JSON.stringify([f.target, f.input]); groups.set(key, [...(groups.get(key) ?? []), f]); }
  const n = ids.length, m = groups.size + Object.keys(fixed ?? {}).length;
  if (n > 300 || m > 600) return null;
  const rows = [...groups.values()].map(group => {
    const row = Array(n).fill(0) as number[];
    row[ids.indexOf(group[0].target)] -= group[0].demand;
    for (const f of group) row[ids.indexOf(f.source)] += f.supply;
    const scale = Math.max(...row.map(Math.abs), 1e-30);
    return row.map(value => value / scale);
  });
  const rightSides = rows.map(() => 0);
  for (const [id, value] of Object.entries(fixed ?? {})) {
    rows.push(ids.map(column => column === id ? 1 : 0));
    rightSides.push(value);
  }
  const minimum = fixed ? 0 : 1;
  const table = rows.map((row, i) => {
    const rhs = rightSides[i] - minimum * row.reduce((a, b) => a + b, 0), sign = rhs < 0 ? -1 : 1;
    return [...row.map(value => value * sign), ...Array.from({ length: m }, (_, j) => i === j ? 1 : 0), Math.abs(rhs)];
  });
  const basis = Array.from({ length: m }, (_, i) => n + i);
  const width = n + m, eps = 1e-10;
  let solved = false;
  for (let iteration = 0; iteration < 10000; iteration++) {
    let enter = -1;
    for (let j = 0; j < width; j++) {
      const reduced = (j >= n ? 1 : 0) - table.reduce((sum, row, i) => sum + (basis[i] >= n ? row[j] : 0), 0);
      if (reduced < -eps) { enter = j; break; }
    }
    if (enter < 0) { solved = true; break; }
    let leave = -1, ratio = Infinity;
    for (let i = 0; i < m; i++) if (table[i][enter] > eps) {
      const candidate = table[i][width] / table[i][enter];
      if (candidate < ratio - eps || (Math.abs(candidate - ratio) <= eps && (leave < 0 || basis[i] < basis[leave]))) { ratio = candidate; leave = i; }
    }
    if (leave < 0) return null;
    const pivot = table[leave][enter];
    table[leave] = table[leave].map(value => value / pivot);
    for (let i = 0; i < m; i++) if (i !== leave) {
      const factor = table[i][enter];
      for (let j = 0; j <= width; j++) table[i][j] -= factor * table[leave][j];
    }
    basis[leave] = enter;
  }
  if (!solved || table.some((row, i) => basis[i] >= n && row[width] > 1e-8)) return null;
  const values = Array(n).fill(minimum) as number[];
  basis.forEach((column, i) => { if (column < n) values[column] += table[i][width]; });
  if (fixed) {
    const counts = Object.fromEntries(ids.map((id, i) => [id, Math.max(0, values[i])]));
    if (Object.values(counts).some(value => !Number.isFinite(value) || value > 1e9)) return null;
    for (const [id, value] of Object.entries(fixed)) {
      if (Math.abs(counts[id] - value) > 1e-8 * Math.max(value, 1e-10)) return null;
      counts[id] = value;
    }
    for (const group of groups.values()) if (supplyColor(group.reduce((sum, f) => sum + f.supply * counts[f.source], 0), group[0].demand * counts[group[0].target]) !== connectionColors.balanced) return null;
    return counts;
  }
  const fractions = values.map(fraction);
  if (fractions.some(f => !f)) return null;
  let multiple = 1;
  for (const f of fractions) { multiple = multiple / gcd(multiple, f![1]) * f![1]; if (!Number.isSafeInteger(multiple) || multiple > 1e9) return null; }
  const counts = Object.fromEntries(ids.map((id, i) => [id, Math.round(values[i] * multiple)]));
  const divisor = Object.values(counts).reduce(gcd);
  for (const id of ids) counts[id] /= divisor;
  if (Object.values(counts).some(value => !Number.isSafeInteger(value) || value < 1 || value > 1e9)) return null;
  for (const group of groups.values()) if (supplyColor(group.reduce((sum, f) => sum + f.supply * counts[f.source], 0), group[0].demand * counts[group[0].target]) !== connectionColors.balanced) return null;
  return counts;
}
