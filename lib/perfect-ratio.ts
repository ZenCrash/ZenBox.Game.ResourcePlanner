import { supplyColor, connectionColors } from "./model";

export function availableCatchup(counts: { a: number | null; b: number | null } | null, lineColor: string) {
  if (!counts || lineColor === connectionColors.balanced || lineColor === connectionColors.unrated) return null;
  return { a: lineColor === connectionColors.surplus ? null : counts.a, b: lineColor === connectionColors.shortage ? null : counts.b };
}

export type RatioFlow = { source: string; input: string; supply: number; demand: number };

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

export function catchupMachineCounts(supply: number, demand: number, producerCount: number, consumerCount: number) {
  if ([supply, demand, producerCount, consumerCount].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const needed = demand * consumerCount;
  const supplied = supply * producerCount;
  if (!Number.isFinite(needed) || !Number.isFinite(supplied) || supplyColor(supplied, needed) === connectionColors.balanced) return null;
  const nearA = Math.round(needed / supply);
  const nearB = Math.round(supplied / demand);
  const a = supplyColor(supply * nearA, needed) === connectionColors.balanced ? nearA : Math.ceil(needed / supply);
  const b = supplyColor(supplied, demand * nearB) === connectionColors.balanced ? nearB : Math.floor(supplied / demand);
  const valid = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 1e9 ? value : null;
  return { a: valid(a), b: valid(b) };
}

// Find whole machine counts for an input star. Suppliers sharing an input
// contribute together; every input is checked again before applying any change.
export function perfectMachineCounts(target: string, flows: RatioFlow[]) {
  if (!flows.length || flows.some((flow) => flow.source === target ||
    !Number.isFinite(flow.supply) || !Number.isFinite(flow.demand) ||
    flow.supply <= 0 || flow.demand <= 0)) return null;
  const groups = new Map<string, RatioFlow[]>();
  for (const flow of flows) groups.set(flow.input, [...(groups.get(flow.input) ?? []), flow]);
  const proportions = new Map<string, number>([[target, 1]]);
  for (const group of groups.values()) {
    const proportion = group[0].demand / group.reduce((sum, flow) => sum + flow.supply, 0);
    for (const flow of group) {
      const previous = proportions.get(flow.source);
      if (previous !== undefined && Math.abs(previous - proportion) > 1e-10 * Math.max(previous, proportion)) return null;
      proportions.set(flow.source, proportion);
    }
  }
  let multiple = 1;
  for (const value of proportions.values()) {
    let denominator = 1;
    for (; denominator <= 100000; denominator++) {
      if (Math.round(value * denominator) > 0 &&
        Math.abs(value * denominator - Math.round(value * denominator)) < 1e-9) break;
    }
    if (denominator > 100000) return null;
    multiple = multiple / gcd(multiple, denominator) * denominator;
    if (!Number.isSafeInteger(multiple)) return null;
  }
  const counts = Object.fromEntries([...proportions].map(([id, value]) => [id, Math.round(value * multiple)]));
  if (Object.values(counts).some((count) => !Number.isSafeInteger(count) || count < 1 || count > 1e9)) return null;
  const divisor = Object.values(counts).reduce(gcd);
  for (const id in counts) counts[id] /= divisor;
  for (const group of groups.values()) {
    const supply = group.reduce((sum, flow) => sum + flow.supply * counts[flow.source], 0);
    if (supplyColor(supply, group[0].demand * counts[target]) !== connectionColors.balanced) return null;
  }
  return counts;
}

export function increaseMachineCounts(base: Record<string, number>, current: Record<string, number>, target: string) {
  const multiple = Math.max(
    Math.floor((current[target] ?? 1) / base[target]) + 1,
    ...Object.entries(base).map(([id, count]) => Math.ceil((current[id] ?? 1) / count)),
  );
  const counts = Object.fromEntries(Object.entries(base).map(([id, count]) => [id, count * multiple]));
  return Object.values(counts).every((count) => Number.isSafeInteger(count) && count <= 1e9) ? counts : null;
}

export function stepMachineRatio(base: Record<string, number>, current: Record<string, number>, step: -1 | 1) {
  const ratios = Object.entries(base).map(([id, count]) => (current[id] ?? 1) / count);
  if (!ratios.length || ratios.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  let multiple = step === 1 ? Math.ceil(Math.max(...ratios)) : Math.floor(Math.min(...ratios));
  const alreadyBalanced = Object.entries(base).every(([id, count]) => current[id] === count * multiple);
  if (alreadyBalanced) multiple += step;
  multiple = Math.max(1, multiple);
  const counts = Object.fromEntries(Object.entries(base).map(([id, count]) => [id, count * multiple]));
  return Object.values(counts).every((count) => Number.isSafeInteger(count) && count >= 1 && count <= 1e9) ? counts : null;
}
