"use client";
import {
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  type PointerEvent,
} from "react";
import { useReactFlow, type Node, type Edge } from "@xyflow/react";
import { connectionRoute, type Point } from "@/lib/diagram-geometry";
import {
  cardInSelection,
  routeInSelection,
  selectionArea,
  type Area,
} from "@/lib/canvas-interactions";

export function CanvasSelection<N extends Node, E extends Edge>({
  nodes,
  edges,
  setNodes,
  setEdges,
  children,
  enabled,
}: {
  nodes: N[];
  edges: E[];
  setNodes: Dispatch<SetStateAction<N[]>>;
  setEdges: Dispatch<SetStateAction<E[]>>;
  children: ReactNode;
  enabled: boolean;
}) {
  const flow = useReactFlow();
  const [box, setBox] = useState<Area | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    start: Point;
    local: Point;
    remove: boolean;
    moved: boolean;
    nodes: N[];
    edges: E[];
    shapes: { id: string; bounds: Area }[];
    routes: { id: string; points: Point[] }[];
  } | null>(null);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !enabled ||
      (event.button !== 0 && event.button !== 2) ||
      !(event.target instanceof Element) ||
      !event.target.classList.contains("react-flow__pane")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX, y: event.clientY };
    const shapes = nodes.flatMap((node) => {
      const internal = flow.getInternalNode(node.id);
      if (!internal) return [];
      const p = internal.internals.positionAbsolute;
      return [
        {
          id: node.id,
          bounds: {
            left: p.x,
            top: p.y,
            right: p.x + (internal.measured.width ?? 0),
            bottom: p.y + (internal.measured.height ?? 0),
          },
        },
      ];
    });
    const routes = edges.flatMap((edge) => {
      const source = flow.getInternalNode(edge.source),
        target = flow.getInternalNode(edge.target);
      const a = source?.internals.handleBounds?.source?.find(
        (h) => h.id === edge.sourceHandle,
      );
      const b = target?.internals.handleBounds?.target?.find(
        (h) => h.id === edge.targetHandle,
      );
      if (!source || !target || !a || !b) return [];
      return [
        {
          id: edge.id,
          points: connectionRoute(
            {
              x: source.internals.positionAbsolute.x + a.x + a.width,
              y: source.internals.positionAbsolute.y + a.y + a.height / 2,
            },
            {
              x: target.internals.positionAbsolute.x + b.x,
              y: target.internals.positionAbsolute.y + b.y + b.height / 2,
            },
            edge.data?.bend as Point | undefined,
            edge.data?.targetBendX as number | undefined,
            edge.data?.waypoints as Point[] | undefined,
          ).points,
        },
      ];
    });
    drag.current = {
      start: point,
      local: { x: point.x - bounds.left, y: point.y - bounds.top },
      remove: event.shiftKey,
      moved: false,
      nodes,
      edges,
      shapes,
      routes,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    const point = { x: event.clientX, y: event.clientY };
    if (
      !active.moved &&
      Math.hypot(point.x - active.start.x, point.y - active.start.y) < 3
    )
      return;
    active.moved = true;
    const bounds = event.currentTarget.getBoundingClientRect();
    setBox(
      selectionArea(active.local, {
        x: point.x - bounds.left,
        y: point.y - bounds.top,
      }),
    );
    const area = selectionArea(
      flow.screenToFlowPosition(active.start),
      flow.screenToFlowPosition(point),
    );
    const nodeIds = new Set(
      active.shapes
        .filter((shape) => cardInSelection(shape.bounds, area))
        .map((shape) => shape.id),
    );
    const edgeIds = new Set(
      active.routes
        .filter((route) => routeInSelection(route.points, area))
        .map((route) => route.id),
    );
    const oldNodes = new Set(
      active.nodes.filter((n) => n.selected).map((n) => n.id),
    );
    const oldEdges = new Set(
      active.edges.filter((e) => e.selected).map((e) => e.id),
    );
    setNodes((values) =>
      values.map((n) => ({
        ...n,
        selected: active.remove
          ? oldNodes.has(n.id) && !nodeIds.has(n.id)
          : nodeIds.has(n.id),
      })),
    );
    setEdges((values) =>
      values.map((e) => ({
        ...e,
        selected: active.remove
          ? oldEdges.has(e.id) && !edgeIds.has(e.id)
          : edgeIds.has(e.id),
      })),
    );
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancel = false) => {
    const active = drag.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    if (cancel) {
      setNodes(active.nodes);
      setEdges(active.edges);
    } else if (!active.moved && (event.button === 0 || event.button === 2)) {
      setNodes((values) =>
        values.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
      );
      setEdges((values) =>
        values.map((edge) =>
          edge.selected ? { ...edge, selected: false } : edge,
        ),
      );
    }
    suppressClick.current = active.moved && !cancel;
    drag.current = null;
    setBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div
      className="flow-canvas"
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDownCapture={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onContextMenu={(event) => {
        if (
          event.target === event.currentTarget ||
          (event.target instanceof Element &&
            event.target.classList.contains("react-flow__pane"))
        )
          event.preventDefault();
      }}
    >
      {children}
      {box && (
        <div
          className="canvas-selection-box"
          style={{
            left: box.left,
            top: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
          }}
        />
      )}
    </div>
  );
}
