import type { Node, Edge } from "@xyflow/react";
import type { Graph } from "./editor-history";
import { snapPoint, type Point } from "./diagram-geometry";

export function copySelection<N extends Node, E extends Edge>(
  graph: Graph<N, E>,
): Graph<N, E> {
  const ids = new Set(graph.nodes.filter((n) => n.selected).map((n) => n.id));
  graph.edges
    .filter((e) => e.selected)
    .forEach((e) => {
      ids.add(e.source);
      ids.add(e.target);
    });
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

export function pasteSelection<N extends Node, E extends Edge>(
  graph: Graph<N, E>,
  origin: Point,
  uuid: () => string,
): Graph<N, E> {
  if (!graph.nodes.length) return { nodes: [], edges: [] };
  const ids = new Map(graph.nodes.map((n) => [n.id, uuid()]));
  const anchor = snapPoint(origin);
  const delta = {
    x: anchor.x - Math.min(...graph.nodes.map((n) => n.position.x)),
    y: anchor.y - Math.min(...graph.nodes.map((n) => n.position.y)),
  };
  const translate = (p: Point) => ({ x: p.x + delta.x, y: p.y + delta.y });
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      position: translate(n.position),
      selected: true,
      dragging: false,
    })),
    edges: graph.edges.map((e) => ({
      ...e,
      id: uuid(),
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
      selected: true,
      data: {
        ...e.data,
        ...(e.data?.bend ? { bend: translate(e.data.bend as Point) } : {}),
        ...(e.data?.labelPosition
          ? { labelPosition: translate(e.data.labelPosition as Point) }
          : {}),
        ...(typeof e.data?.targetBendX === "number"
          ? { targetBendX: e.data.targetBendX + delta.x }
          : {}),
        ...(e.data?.waypoints
          ? { waypoints: (e.data.waypoints as Point[]).map(translate) }
          : {}),
      },
    })),
  };
}
