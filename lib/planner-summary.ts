import type { PlannedGraph } from "@/components/auto-recipe-planner";
import { summarizeArea } from "./area-summary";
import { applyVariants, hasIngredientPort } from "./model";
import { overclockRecipe } from "./recipe-overclock";

export function summarizePlanner(graph: PlannedGraph) {
  const bounds = { position: { x: 0, y: 0 }, width: 1, height: 1 };
  return summarizeArea(bounds, graph.nodes.map(node => ({ ...node.data, ...bounds })));
}

function matchingPorts(graph: PlannedGraph, itemId: string) {
  return new Map(graph.nodes.map(node => [node.id, new Set(
    overclockRecipe(applyVariants(node.data.recipe, node.data.variants), node.data.machineId, node.data.multiblock).ingredients
      .filter(ingredient => ingredient.itemId === itemId && hasIngredientPort(ingredient))
      .map(ingredient => `${ingredient.direction}:${ingredient.slot}`),
  )]));
}

export function plannerItemPortState(graph: PlannedGraph, itemId: string) {
  const matches = matchingPorts(graph, itemId);
  let hasEnabled = false, hasDisabled = false;
  for (const node of graph.nodes) for (const handle of matches.get(node.id)!) {
    if (node.data.disabledPorts?.includes(handle)) hasDisabled = true;
    else hasEnabled = true;
  }
  return { hasEnabled, hasDisabled };
}

export function setPlannerItemDisabled(graph: PlannedGraph, itemId: string, disabled: boolean): PlannedGraph {
  const matches = matchingPorts(graph, itemId);
  return {
    ...graph,
    nodes: graph.nodes.map(node => {
      const handles = matches.get(node.id)!;
      if (!handles.size) return node;
      const ports = new Set(node.data.disabledPorts ?? []);
      for (const handle of handles) disabled ? ports.add(handle) : ports.delete(handle);
      return { ...node, data: { ...node.data, disabledPorts: [...ports] } };
    }),
    edges: disabled ? graph.edges.filter(edge => !matches.get(edge.source)?.has(edge.sourceHandle ?? "") && !matches.get(edge.target)?.has(edge.targetHandle ?? "")) : graph.edges,
  };
}
