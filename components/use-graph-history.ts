"use client";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type SetStateAction,
} from "react";
import type { Node, Edge } from "@xyflow/react";
import { graphHistoryReducer, type GraphHistory } from "@/lib/editor-history";

export function useGraphHistory<N extends Node, E extends Edge>() {
  const [state, dispatch] = useReducer(graphHistoryReducer<N, E>, {
    present: { nodes: [], edges: [] },
    past: [],
    future: [],
    group: null,
  } as GraphHistory<N, E>);
  const group = useRef(0);
  useEffect(() => {
    const begin = () => {
      group.current++;
    };
    window.addEventListener("pointerdown", begin, true);
    window.addEventListener("keydown", begin, true);
    window.addEventListener("cut", begin, true);
    window.addEventListener("paste", begin, true);
    return () => {
      window.removeEventListener("pointerdown", begin, true);
      window.removeEventListener("keydown", begin, true);
      window.removeEventListener("cut", begin, true);
      window.removeEventListener("paste", begin, true);
    };
  }, []);
  const setNodes = useCallback(
    (value: SetStateAction<N[]>) =>
      dispatch({ type: "nodes", value, group: group.current }),
    [],
  );
  const setEdges = useCallback(
    (value: SetStateAction<E[]>) =>
      dispatch({ type: "edges", value, group: group.current }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const resetHistory = useCallback(() => dispatch({ type: "reset" }), []);
  return {
    ...state.present,
    setNodes,
    setEdges,
    undo,
    redo,
    resetHistory,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
