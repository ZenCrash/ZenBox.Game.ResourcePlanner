import type { Node, Edge } from "@xyflow/react";
import { applyVariants, hasRecipeTiming, port, rate, type Recipe, type VariantSelection } from "./model";
import { overclockRecipe } from "./recipe-overclock";
import { selectedMachine } from "./machine-selection";
import { connectedMachines, networkMachineCounts } from "./network-ratio";

type ScaleNode = Node<{ recipe: Recipe; variants: VariantSelection; machines: number; machineId?: string; scaleAmount?: number; scaleMachineId?: string }>;
export function scaleDiagram<N extends ScaleNode>(nodes: N[], edges: Edge[]) {
  const recipes = new Map(nodes.filter(node => node.type === "recipe").map(node => [node.id, overclockRecipe(applyVariants(node.data.recipe, node.data.variants), node.data.scaleMachineId ?? node.data.machineId)]));
  const counts = new Map<string, number>(), scaled = new Set<string>(), failed = new Set<string>(), proportional = new Set<string>(), visited = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "recipe" || node.data.recipe.sourceItemId || !node.data.scaleMachineId) continue;
    const base = applyVariants(node.data.recipe, node.data.variants);
    if (selectedMachine(base, node.data.machineId)?.id === selectedMachine(base, node.data.scaleMachineId)?.id) continue;
    const original = overclockRecipe(base, node.data.machineId), selected = recipes.get(node.id)!;
    if (!hasRecipeTiming(original) || !hasRecipeTiming(selected)) continue;
    const speed = (recipe: Recipe) => (recipe.parallel ?? 1) / (recipe.cycleDurationTicks ?? recipe.durationTicks);
    const amount = node.data.machines * speed(original) / speed(selected);
    if (Number.isFinite(amount) && amount >= 0 && amount <= 1e9) {
      counts.set(node.id, amount);
      scaled.add(node.id);
    }
  }
  for (const node of nodes) {
    if (!(node.data.scaleAmount! > 0) || visited.has(node.id)) continue;
    const ids = connectedMachines(node.id, edges);
    ids.forEach(id => visited.add(id));
    const fixed = Object.fromEntries(nodes.filter(value => ids.has(value.id) && value.data.scaleAmount! > 0).map(value => [value.id, value.data.scaleAmount!]));
    const flows = edges.filter(edge => !edge.data?.reference && ids.has(edge.source) && ids.has(edge.target)).flatMap(edge => {
      const producer = recipes.get(edge.source), consumer = recipes.get(edge.target);
      const output = producer && port(producer, edge.sourceHandle), input = consumer && port(consumer, edge.targetHandle);
      // Item-source cards are external supplies with no declared rate.
      if (producer?.sourceItemId || !input?.consumed) return [];
      return [{ source: edge.source, target: edge.target, input: edge.targetHandle ?? "",
        supply: producer && output && hasRecipeTiming(producer) ? rate(output, producer) : NaN,
        demand: consumer && input && hasRecipeTiming(consumer) ? rate(input, consumer) : NaN }];
    });
    let result = networkMachineCounts(flows, fixed);
    if (!result && !networkMachineCounts(flows)) {
      // An unbalanced network can still be scaled in its existing proportions.
      // Adjust the baseline counts for any tier speed changes first.
      const baseline = Object.fromEntries(nodes.filter(value => ids.has(value.id) && value.type === "recipe" && !value.data.recipe.sourceItemId).map(value => {
        const original = overclockRecipe(applyVariants(value.data.recipe, value.data.variants), value.data.machineId);
        const selected = recipes.get(value.id)!;
        const speed = (recipe: Recipe) => (recipe.parallel ?? 1) / (recipe.cycleDurationTicks ?? recipe.durationTicks);
        const adjustment = hasRecipeTiming(original) && hasRecipeTiming(selected) ? speed(original) / speed(selected) : 1;
        return [value.id, value.data.machines * adjustment];
      }));
      const factors = Object.entries(fixed).map(([id, amount]) => amount / baseline[id]);
      const factor = factors[0];
      if (Number.isFinite(factor) && factor > 0 && factors.every(value => Math.abs(value - factor) <= 1e-9 * factor)) {
        const candidate = Object.fromEntries(Object.entries(baseline).map(([id, amount]) => [id, fixed[id] ?? amount * factor]));
        if (Object.values(candidate).every(amount => Number.isFinite(amount) && amount >= 0 && amount <= 1e9)) {
          result = candidate;
          ids.forEach(id => proportional.add(id));
        }
      }
    }
    if (!result) {
      ids.forEach(id => failed.add(id));
      Object.entries(fixed).forEach(([id, amount]) => counts.set(id, amount));
      continue;
    }
    Object.entries(result).forEach(([id, amount]) => { counts.set(id, amount); scaled.add(id); });
  }
  return { counts, scaled, failed, proportional };
}


/** Retain the last calculation across view switches and presentation-only edits. */
export function createScaleCalculator(calculate: typeof scaleDiagram = scaleDiagram) {
  let previousNodes: ScaleNode[] | undefined, previousEdges: Edge[] | undefined;
  let result: ReturnType<typeof scaleDiagram>;
  return (nodes: ScaleNode[], edges: Edge[]) => {
    const sameNodes = previousNodes?.length === nodes.length && nodes.every((node, i) => {
      const previous = previousNodes![i], a = node.data, b = previous.data;
      return node.id === previous.id && node.type === previous.type && a.recipe === b.recipe && a.variants === b.variants &&
        a.machines === b.machines && a.machineId === b.machineId && a.scaleAmount === b.scaleAmount && a.scaleMachineId === b.scaleMachineId;
    });
    const sameEdges = previousEdges?.length === edges.length && edges.every((edge, i) => {
      const previous = previousEdges![i];
      return edge.source === previous.source && edge.target === previous.target && edge.sourceHandle === previous.sourceHandle &&
        edge.targetHandle === previous.targetHandle && !!edge.data?.reference === !!previous.data?.reference;
    });
    if (!sameNodes || !sameEdges) result = calculate(nodes, edges);
    previousNodes = nodes;
    previousEdges = edges;
    return result!;
  };
}
