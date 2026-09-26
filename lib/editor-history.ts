import type { Node, Edge } from "@xyflow/react";

export type Graph<N extends Node, E extends Edge> = { nodes: N[]; edges: E[] };
export type GraphHistory<N extends Node, E extends Edge> = {
  present: Graph<N, E>;
  past: Graph<N, E>[];
  future: Graph<N, E>[];
  group: number | null;
};
export type HistoryAction<N extends Node, E extends Edge> =
  | { type: "nodes"; value: N[] | ((nodes: N[]) => N[]); group: number }
  | { type: "edges"; value: E[] | ((edges: E[]) => E[]); group: number }
  | { type: "undo" | "redo" | "reset" };

function content<N extends Node, E extends Edge>(graph: Graph<N, E>) {
  return JSON.stringify({
    nodes: graph.nodes.map(({ id, position, data, type, width, height }) => ({
      id,
      position,
      data,
      ...(type === "summary" ? { width, height } : {}),
    })),
    edges: graph.edges.map(
      ({ id, source, target, sourceHandle, targetHandle, data }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        data: {
          bend: data?.bend,
          targetBendX: data?.targetBendX,
          waypoints: data?.waypoints,
          labelPosition: data?.labelPosition,
        },
      }),
    ),
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
  if (action.type !== "nodes" && action.type !== "edges") return state;
  const present =
    action.type === "nodes"
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
  if (content(present) === content(state.present)) return { ...state, present };
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
