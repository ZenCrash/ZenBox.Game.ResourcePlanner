import { graphHistoryReducer, type GraphHistory } from "../lib/editor-history";
import type { Node, Edge } from "@xyflow/react";
import type { DiagramDocument, Recipe } from "../lib/model";
import { applyVariants, port, rate } from "../lib/model";
import { overclockRecipe } from "../lib/recipe-overclock";
import { perfectMachineCounts } from "../lib/perfect-ratio";
import { fluidReferenceInputRates } from "../lib/fluid-reference";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: tsx scripts/benchmark-drag.ts <diagram-id> [base-url]");
  const base = process.argv[3] ?? "http://localhost:3000";
  const read = async <T,>(path: string): Promise<T> => {
    const response = await fetch(base + path);
    if (!response.ok) throw new Error(`${response.status}: ${path}`);
    return response.json();
  };
  const doc = await read<DiagramDocument>(`/api/diagrams/${id}`);
  const ids = [...new Set(doc.nodes.filter(n => !n.itemId).map(n => n.recipeId))];
  const recipes: Recipe[] = [];
  for (let i = 0; i < ids.length; i += 40)
    recipes.push(...await read<Recipe[]>(`/api/recipes?ids=${encodeURIComponent(ids.slice(i, i + 40).join(","))}`));
  const map = new Map(recipes.map(recipe => [recipe.id, recipe]));
  let state: GraphHistory<Node, Edge> = {
    present: { nodes: doc.nodes.map(node => ({ ...node, data: { recipe: map.get(node.recipeId), machines: node.machines, variants: node.variants } })), edges: doc.edges },
    past: [], future: [], group: null,
  };
  const start = performance.now();
  for (let i = 0; i < 300; i++) state = graphHistoryReducer(state, {
    type: "nodeChanges", group: 1,
    changes: state.present.nodes.map(node => ({ id: node.id, type: "position", position: { x: node.position.x + 1, y: node.position.y + 1 }, dragging: true })),
  });
  console.log(JSON.stringify({ nodes: doc.nodes.length, edges: doc.edges.length, updates: 300, ms: performance.now() - start }));
  // Reproduce the old eager menu checks separately from network/render time.
  const runtime = new Map(doc.nodes.flatMap(node => {
    const recipe = map.get(node.recipeId);
    return recipe ? [[node.id, overclockRecipe(applyVariants(recipe, node.variants), node.machineId)] as const] : [];
  }));
  const ratioStart = performance.now();
  let checks = 0;
  for (const edge of doc.edges) for (const [allInputs, includeReferences] of [[false, true], [true, true], [true, false], [false, false], [true, false]]) {
    if (edge.reference && !includeReferences) continue;
    const connections = allInputs ? doc.edges.filter(value => value.target === edge.target && (includeReferences || !value.reference)) : [edge];
    perfectMachineCounts(edge.target, connections.map(value => {
      const a = runtime.get(value.source), b = runtime.get(value.target);
      const output = a && port(a, value.sourceHandle), input = b && port(b, value.targetHandle);
      const reference = value.reference && a && b && output && input ? fluidReferenceInputRates(output, a, input, b) : undefined;
      return { source: value.source, input: value.targetHandle ?? "", supply: reference?.supply ?? (a && output ? rate(output, a) : NaN), demand: reference?.demand ?? (b && input ? rate(input, b) : NaN) };
    }));
    checks++;
  }
  console.log(JSON.stringify({ oldEagerMenuChecks: checks, msPerRender: performance.now() - ratioStart, newUnopenedMenuChecks: 0 }));
}
void main();
