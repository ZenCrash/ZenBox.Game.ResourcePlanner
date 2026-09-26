import type { Edge } from "@xyflow/react";
import type { Point } from "./diagram-geometry";

export type Area = { left: number; top: number; right: number; bottom: number };
export function selectionArea(a: Point, b: Point): Area {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}
export function cardInSelection(card: Area, selection: Area) {
  const size =
    Math.max(0, card.right - card.left) * Math.max(0, card.bottom - card.top);
  const width = Math.max(
    0,
    Math.min(card.right, selection.right) - Math.max(card.left, selection.left),
  );
  const height = Math.max(
    0,
    Math.min(card.bottom, selection.bottom) - Math.max(card.top, selection.top),
  );
  return size > 0 && width * height > size / 4;
}
export function routeInSelection(points: Point[], area: Area) {
  // A rectangle is convex: containing every endpoint and bend contains all
  // segments too, including detours outside the endpoints' bounding box.
  return (
    points.length >= 2 &&
    points.every(
      (point) =>
        point.x >= area.left &&
        point.x <= area.right &&
        point.y >= area.top &&
        point.y <= area.bottom,
    )
  );
}
export function moveConnectedEdges<E extends Edge>(
  edges: E[],
  movements: Map<string, Point>,
): E[] {
  return edges.map((edge) => {
    const a = movements.get(edge.source),
      b = movements.get(edge.target);
    if (!a && !b) return edge;
    if (a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) {
      const translate = (p: Point) => ({ x: p.x + a.x, y: p.y + a.y });
      return {
        ...edge,
        data: {
          ...edge.data,
          ...(edge.data?.bend
            ? { bend: translate(edge.data.bend as Point) }
            : {}),
          ...(typeof edge.data?.targetBendX === "number"
            ? { targetBendX: edge.data.targetBendX + a.x }
            : {}),
          ...(edge.data?.waypoints
            ? { waypoints: (edge.data.waypoints as Point[]).map(translate) }
            : {}),
          ...(edge.data?.labelPosition
            ? { labelPosition: translate(edge.data.labelPosition as Point) }
            : {}),
        },
      };
    }
    return edge.data?.labelPosition
      ? { ...edge, data: { ...edge.data, labelPosition: undefined } }
      : edge;
  });
}
