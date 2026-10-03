import type { PlannedGraph } from '../components/auto-recipe-planner';
import { plannerGroupNode } from './planner-group';

export function plannerPreviewBounds(graph: PlannedGraph) {
  if (!graph.nodes.length || graph.nodes.some(n => !n.measured?.width || !n.measured?.height)) return undefined;
  const group = plannerGroupNode(graph);
  const boxes = graph.nodes.map(n => ({ ...n.position, width: n.measured!.width!, height: n.measured!.height! }));
  if (group) boxes.push({ ...group.position, width: group.width, height: group.height });
  const points = boxes.flatMap(b => [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }]);
  for (const edge of graph.edges) {
    const waypoints = edge.data?.waypoints;
    if (Array.isArray(waypoints)) for (const point of waypoints) {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
    }
  }
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
