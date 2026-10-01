import type { Node, Edge, NodeChange } from "@xyflow/react";
import { applyGraphNodeChanges } from "./canvas-interactions";

export type Graph<N extends Node, E extends Edge> = { nodes: N[]; edges: E[] };
export type GraphHistory<N extends Node, E extends Edge> = {
  present: Graph<N, E>;
  past: Graph<N, E>[];
  future: Graph<N, E>[];
  group: number | null;
};
export type HistoryAction<N extends Node, E extends Edge> =
  | { type: "nodeChanges"; changes: NodeChange<N>[]; group: number }
  | { type: "nodes"; value: N[] | ((nodes: N[]) => N[]); group: number }
  | { type: "edges"; value: E[] | ((edges: E[]) => E[]); group: number }
  | { type: "undo" | "redo" | "reset" };

// Graph updates are immutable. Compare the editable fields without serializing
// the entire catalog payload on every pointer movement.
function sameData(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]));
}
function sameContent<N extends Node, E extends Edge>(a: Graph<N, E>, b: Graph<N, E>) {
  return a.nodes.length === b.nodes.length && a.edges.length === b.edges.length &&
    a.nodes.every((node, i) => {
      const old = b.nodes[i];
      return node === old || (node.id === old.id && node.type === old.type &&
        node.position.x === old.position.x && node.position.y === old.position.y &&
        (node.type !== "summary" || (node.width === old.width && node.height === old.height)) &&
        sameData(node.data, old.data));
    }) && a.edges.every((edge, i) => {
      const old = b.edges[i];
      return edge === old || (edge.id === old.id && edge.source === old.source && edge.target === old.target &&
        edge.sourceHandle === old.sourceHandle && edge.targetHandle === old.targetHandle && sameData(edge.data, old.data));
    });
}
export function graphHistoryReducer<N extends Node, E extends Edge>(
  state: GraphHistory<N, E>,
  action: HistoryAction<N, E>,
): GraphHistory<N, E> {
  if (action.type === "reset")
    return { ...state, past: [], future: [], group: null };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          present: previous,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future],
          group: null,
        }
      : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next
      ? {
          present: next,
          past: [...state.past, state.present],
          future: state.future.slice(1),
          group: null,
        }
      : state;
  }
  if (
    action.type !== "nodes" &&
    action.type !== "edges" &&
    action.type !== "nodeChanges"
  )
    return state;
  const present =
    action.type === "nodeChanges"
      ? applyGraphNodeChanges(state.present, action.changes)
      : action.type === "nodes"
        ? {
            ...state.present,
            nodes:
              typeof action.value === "function"
                ? action.value(state.present.nodes)
                : action.value,
          }
        : {
            ...state.present,
            edges:
              typeof action.value === "function"
                ? action.value(state.present.edges)
                : action.value,
          };
  if (sameContent(present, state.present)) return { ...state, present };
  return {
    present,
    past:
      state.group === action.group
        ? state.past
        : [...state.past, state.present].slice(-100),
    future: [],
    group: action.group,
  };
}
