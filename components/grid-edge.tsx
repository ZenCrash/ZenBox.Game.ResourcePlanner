"use client";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  connectionRoute,
  connectionLabelPosition,
  moveRouteCorner,
  draggableRouteSegments,
  moveRouteSegment,
  insertRouteBend,
  mergeRouteCorner,
  GRID_SIZE,
  snapPoint,
  type Point,
} from "@/lib/diagram-geometry";
export type DiagramEdge = Edge<{
  bend?: Point;
  targetBendX?: number;
  waypoints?: Point[];
  labelPosition?: Point;
  moveLabel?: (id: string, position: Point) => void;
  select?: (additive: boolean, toggle?: boolean) => void;
  movePoints?: (id: string, waypoints: Point[]) => void;
  moveBend?: (id: string, point: Point, targetBendX: number) => void;
}>;
export function GridEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
  label,
  selected,
}: EdgeProps<DiagramEdge>) {
  const flow = useReactFlow();
  const edges = useStore((state) => state.edges);
  useStore((state) => state.nodes);
  const dragging = useRef<number | null>(null);
  const cornerStart = useRef<ReturnType<typeof connectionRoute> | null>(null);
  const segmentDrag = useRef<{
    key: string;
    route: ReturnType<typeof connectionRoute>;
    segment: ReturnType<typeof draggableRouteSegments>[number];
    pointer: Point;
  } | null>(null);
  const [activeSegment, setActiveSegment] = useState<
    ReturnType<typeof draggableRouteSegments>[number] | null
  >(null);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const labelDrag = useRef<{
    pointer: Point;
    position: Point;
    moved: boolean;
  } | null>(null);
  const skipLabelClick = useRef(false);
  const [size, setSize] = useState({ width: 240, height: 72 });
  const hasLabel = label != null;
  useEffect(() => {
    if (!labelRef.current) return;
    const observer = new ResizeObserver(() => {
      const element = labelRef.current;
      if (element)
        setSize((previous) =>
          previous.width === element.offsetWidth &&
          previous.height === element.offsetHeight
            ? previous
            : { width: element.offsetWidth, height: element.offsetHeight },
        );
    });
    observer.observe(labelRef.current);
    return () => observer.disconnect();
  }, [hasLabel]);
  const route = connectionRoute(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    data?.bend,
    data?.targetBendX,
    data?.waypoints,
  );
  const routes = edges.flatMap((edge) => {
    if (edge.id === id) return [];
    const source = flow.getInternalNode(edge.source),
      target = flow.getInternalNode(edge.target);
    const sourceHandle = source?.internals.handleBounds?.source?.find(
      (handle) => handle.id === edge.sourceHandle,
    );
    const targetHandle = target?.internals.handleBounds?.target?.find(
      (handle) => handle.id === edge.targetHandle,
    );
    if (!source || !target || !sourceHandle || !targetHandle) return [];
    const edgeData = edge.data as DiagramEdge["data"];
    return [
      connectionRoute(
        {
          x:
            source.internals.positionAbsolute.x +
            sourceHandle.x +
            sourceHandle.width,
          y:
            source.internals.positionAbsolute.y +
            sourceHandle.y +
            sourceHandle.height / 2,
        },
        {
          x: target.internals.positionAbsolute.x + targetHandle.x,
          y:
            target.internals.positionAbsolute.y +
            targetHandle.y +
            targetHandle.height / 2,
        },
        edgeData?.bend,
        edgeData?.targetBendX,
        edgeData?.waypoints,
      ).points,
    ];
  });
  const position =
    data?.labelPosition ??
    connectionLabelPosition(route, size.width, size.height, [
      route.points,
      ...routes,
    ]);
  const startLabelDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    skipLabelClick.current = false;
    labelDrag.current = {
      pointer: flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
      position,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveLabel = (event: PointerEvent<HTMLDivElement>) => {
    const active = labelDrag.current;
    if (!active) return;
    const pointer = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (
      !active.moved &&
      Math.hypot(pointer.x - active.pointer.x, pointer.y - active.pointer.y) *
        flow.getZoom() <
        3
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    active.moved = true;
    data?.moveLabel?.(
      id,
      snapPoint({
        x: active.position.x + pointer.x - active.pointer.x,
        y: active.position.y + pointer.y - active.pointer.y,
      }),
    );
  };
  const stopLabelDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    skipLabelClick.current = !!labelDrag.current?.moved;
    labelDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const move = (index: number, point: Point) => {
    const moved = moveRouteCorner(route, index, point);
    if (moved.waypoints) data?.movePoints?.(id, moved.waypoints);
    else data?.moveBend?.(id, moved.bend, moved.targetBendX);
  };
  const beginCornerDrag = (
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = index;
    cornerStart.current = route;
    setActiveCorner(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endCornerDrag = (
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (dragging.current === index && cornerStart.current) {
      const merged = mergeRouteCorner(
        cornerStart.current,
        index,
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
      if (merged) data?.movePoints?.(id, merged);
    }
    dragging.current = null;
    cornerStart.current = null;
    setActiveCorner(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const corners = [...route.corners];
  const segments = draggableRouteSegments(route);
  if (
    activeSegment &&
    !segments.some(
      (segment) =>
        segment.indexes.join("-") === activeSegment.indexes.join("-"),
    )
  )
    segments.push(activeSegment);
  if (
    activeCorner !== null &&
    !corners.some((corner) => corner.index === activeCorner)
  )
    corners.push({
      index: activeCorner,
      point: route.points[activeCorner + 1],
    });
  return (
    <>
      <g
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const click = flow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          data?.movePoints?.(id, insertRouteBend(route, click));
        }}
      >
        <BaseEdge
          id={id}
          path={route.path}
          style={{
            ...style,
            filter: selected
              ? `drop-shadow(0 0 4px ${style?.stroke ?? "#fff"}) drop-shadow(0 0 8px ${style?.stroke ?? "#fff"})`
              : undefined,
          }}
          interactionWidth={20}
        />
        {segments.map((segment) => {
          const key = segment.indexes.join("-");
          return (
            <path
              key={key}
              d={`M${segment.start.x},${segment.start.y} L${segment.end.x},${segment.end.y}`}
              className="connection-segment nodrag nopan"
              style={{ cursor: segment.vertical ? "ew-resize" : "ns-resize" }}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              aria-label={`Move ${segment.vertical ? "vertical" : "horizontal"} connection segment`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                data?.select?.(
                  event.ctrlKey || event.metaKey,
                  event.ctrlKey || event.metaKey,
                );
                if (event.ctrlKey || event.metaKey) return;
                segmentDrag.current = {
                  key,
                  route,
                  segment,
                  pointer: flow.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  }),
                };
                setActiveSegment(segment);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = segmentDrag.current;
                if (!drag || drag.key !== key) return;
                event.preventDefault();
                event.stopPropagation();
                const pointer = flow.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                const moved = moveRouteSegment(drag.route, drag.segment, {
                  x: drag.segment.start.x + pointer.x - drag.pointer.x,
                  y: drag.segment.start.y + pointer.y - drag.pointer.y,
                });
                if (moved.waypoints) data?.movePoints?.(id, moved.waypoints);
                else data?.moveBend?.(id, moved.bend, moved.targetBendX);
              }}
              onPointerUp={(event) => {
                segmentDrag.current = null;
                setActiveSegment(null);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                segmentDrag.current = null;
                setActiveSegment(null);
              }}
            />
          );
        })}
      </g>
      <EdgeLabelRenderer>
        {label != null && (
          <div
            className={`connection-label nodrag nopan${selected ? " selected" : ""}`}
            onPointerDown={startLabelDrag}
            onPointerMove={moveLabel}
            onPointerUp={stopLabelDrag}
            onPointerCancel={stopLabelDrag}
            role="button"
            tabIndex={0}
            aria-label="Select connection"
            aria-pressed={!!selected}
            onClick={(event) => {
              event.stopPropagation();
              if (skipLabelClick.current) {
                skipLabelClick.current = false;
                return;
              }
              data?.select?.(
                event.ctrlKey || event.metaKey,
                event.ctrlKey || event.metaKey,
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                data?.select?.(
                  event.ctrlKey || event.metaKey,
                  event.ctrlKey || event.metaKey,
                );
              }
            }}
            ref={labelRef}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              zIndex: selected ? 2001 : 0,
            }}
          >
            {label}
          </div>
        )}
        {selected &&
          corners.map(({ point, index }) => (
            <button
              key={index}
              className="connection-bend nodrag nopan"
              aria-label={`Move connection corner ${index + 1}`}
              title="Drag to route this connection · Arrow keys move one grid step"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data?.movePoints?.(
                  id,
                  insertRouteBend(
                    route,
                    flow.screenToFlowPosition({
                      x: event.clientX,
                      y: event.clientY,
                    }),
                  ),
                );
              }}
              style={{
                transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                zIndex: 2002,
              }}
              onPointerDown={(event) => beginCornerDrag(event, index)}
              onPointerMove={(event) => {
                if (dragging.current === index) {
                  event.stopPropagation();
                  move(
                    index,
                    snapPoint(
                      flow.screenToFlowPosition({
                        x: event.clientX,
                        y: event.clientY,
                      }),
                    ),
                  );
                }
              }}
              onPointerUp={(event) => endCornerDrag(event, index)}
              onPointerCancel={() => {
                dragging.current = null;
                setActiveCorner(null);
              }}
              onKeyDown={(event) => {
                const delta: Record<string, Point> = {
                  ArrowLeft: { x: -GRID_SIZE, y: 0 },
                  ArrowRight: { x: GRID_SIZE, y: 0 },
                  ArrowUp: { x: 0, y: -GRID_SIZE },
                  ArrowDown: { x: 0, y: GRID_SIZE },
                };
                if (delta[event.key]) {
                  event.preventDefault();
                  event.stopPropagation();
                  move(
                    index,
                    snapPoint({
                      x: point.x + delta[event.key].x,
                      y: point.y + delta[event.key].y,
                    }),
                  );
                }
              }}
            />
          ))}
      </EdgeLabelRenderer>
    </>
  );
}
