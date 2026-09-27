import type { PlannedGraph } from "@/components/auto-recipe-planner";
import { applyVariants, portsCompatible } from "./model";

/** Append a branch without changing the existing preview's positions or IDs. */
export function appendPlannerBranch(graph: PlannedGraph, branch: PlannedGraph, targetId: string, slot: number, prefix: string): PlannedGraph {
  const target = graph.nodes.find(n => n.id === targetId);
  const input = target && applyVariants(target.data.recipe, target.data.variants).ingredients.find(i => i.direction === "input" && i.slot === slot);
  if (!target || !input) throw new Error("The original ingredient is no longer in the preview.");
  const candidates = branch.nodes.flatMap(node => applyVariants(node.data.recipe, node.data.variants).ingredients
    .filter(output => portsCompatible(output, input))
    .map(output => ({ node, output })));
  const match = candidates.sort((a, b) => Number(portsCompatible(b.output, input)) - Number(portsCompatible(a.output, input)) || b.node.position.x - a.node.position.x)[0];
  if (!match) throw new Error("This suggestion has no compatible output for the original ingredient.");
  const dx = target.position.x - 860 - Math.max(...branch.nodes.map(n => n.position.x));
  const dy = Math.max(...graph.nodes.map(n => n.position.y + Math.max(n.measured?.height ?? 400, 400))) + 180 - Math.min(...branch.nodes.map(n => n.position.y));
  const nodes = branch.nodes.map(node => ({ ...node, id: prefix + node.id, position: { x: node.position.x + dx, y: node.position.y + dy } }));
  const edges = branch.edges.map(edge => ({ ...edge, id: prefix + edge.id, source: prefix + edge.source, target: prefix + edge.target, data: { item: edge.data?.item, reference: edge.data?.reference, showLineCard: edge.data?.showLineCard, showOverviewCard: edge.data?.showOverviewCard } }));
  return { nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges, {
    id: prefix + "join", source: prefix + match.node.id, target: target.id,
    sourceHandle: `output:${match.output.slot}`, targetHandle: `input:${slot}`, type: "grid",
    data: { item: match.output.item, reference: false },
  }] };
}
