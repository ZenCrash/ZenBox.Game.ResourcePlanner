import type { PlannedGraph } from '../components/auto-recipe-planner';
import { summaryRecipe } from './area-summary';

/** Grow upward for the width-scaled header without moving recipe positions. */
export function plannerGroupNode(graph: PlannedGraph) {
  if (!graph.group || graph.nodes.length < 2) return undefined;
  const left = Math.min(...graph.nodes.map(n => n.position.x)) - 40;
  const top = Math.min(...graph.nodes.map(n => n.position.y));
  const right = Math.max(...graph.nodes.map(n => n.position.x + (n.measured?.width ?? n.width ?? 700))) + 40;
  const bottom = Math.max(...graph.nodes.map(n => n.position.y + (n.measured?.height ?? n.height ?? 480))) + 40;
  const width = right - left;
  const header = Math.max(graph.group.headerHeight ?? 0, 30 + width * .036 * 1.2);
  const y = top - header - 40;
  return { id: 'planner-group', type: 'summary' as const, position: { x: left, y }, width, height: bottom - y,
    zIndex: -100, draggable: false, selectable: false,
    data: { recipe: summaryRecipe, machines: 0, variants: {}, title: graph.group.title, theme: graph.group.theme ?? 'transparent' as const, calculators: graph.group.calculators, ignoredItems: graph.ignoredItems } };
}
