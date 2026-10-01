import { hasRecipeTiming, port, rate, type Recipe } from "./model";

type Machine = { id: string; recipe: Recipe; machines: number; disabledPorts?: string[] };
type Connection = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; data?: { reference?: boolean } };

// Steady-state throughput: open ports are external supplies. Unknown-rate item
// cards and informational fluid/container links do not impose a numeric limit.
export function productionRates(machines: Machine[], edges: Connection[]) {
  const nodes = new Map(machines.map(node => [node.id, node]));
  const inputs = new Map<string, Map<string, { demand: number; sources: { id: string; capacity: number }[]; unknown: boolean }>>();
  for (const edge of edges) {
    if (edge.data?.reference) continue;
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    if (!source || !target || source.disabledPorts?.includes(edge.sourceHandle ?? "") || target.disabledPorts?.includes(edge.targetHandle ?? "")) continue;
    const output = port(source.recipe, edge.sourceHandle), input = port(target.recipe, edge.targetHandle);
    if (!input || !output || !input.consumed || !hasRecipeTiming(target.recipe)) continue;
    const demand = rate(input, target.recipe, target.machines);
    if (!(demand > 0)) continue;
    let ports = inputs.get(target.id);
    if (!ports) { ports = new Map(); inputs.set(target.id, ports); }
    let supply = ports.get(edge.targetHandle!);
    if (!supply) { supply = { demand, sources: [], unknown: false }; ports.set(edge.targetHandle!, supply); }
    if (!hasRecipeTiming(source.recipe) || !output.consumed) supply.unknown = true;
    else supply.sources.push({ id: source.id, capacity: rate(output, source.recipe, source.machines) });
  }
  let utilization = new Map(machines.map(node => [node.id, 1]));
  // Descending fixed point also handles recycling loops without recursive calls.
  for (let step = 0; step < Math.max(1000, machines.length); step++) {
    let difference = 0;
    const next = new Map(utilization);
    for (const [id, ports] of inputs) {
      let fraction = 1;
      for (const supply of ports.values()) {
        if (supply.unknown) continue;
        const available = supply.sources.reduce((sum, source) => sum + source.capacity * utilization.get(source.id)!, 0);
        fraction = Math.min(fraction, available / supply.demand);
      }
      next.set(id, fraction);
      difference = Math.max(difference, Math.abs(fraction - utilization.get(id)!));
    }
    utilization = next;
    if (difference < 1e-10) break;
  }
  return utilization;
}
