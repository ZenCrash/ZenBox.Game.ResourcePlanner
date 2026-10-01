"use client";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { memo, useEffect, useLayoutEffect, useMemo, useId, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { CornerDownRight, Minus, Plus, Factory, Eye, EyeOff } from "lucide-react";
import { crossingPath } from "@/lib/line-crossings";
import { GraphGeometry } from "@/lib/graph-geometry";
import { useStableValues } from "./use-stable-values";
import { lineDirectionColor, animatedDirectionMarkers } from "@/lib/line-direction";
import type { Item } from "@/lib/model";
import { ItemTooltip } from "./item-tooltip";
import { useDisplaySettings } from "./display-settings";
import { AnimatedLineArrows } from "./animated-line-arrows";
import { NetworkRatioControls } from "./network-ratio-controls";
import {
  connectionRoute,
  routeMidpoint,
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

const graphScenes = new WeakMap<object, GraphGeometry>();
export type DiagramEdge = Edge<{
  readOnlyMachines?: boolean;
  networkRatio?: () => Record<string, number> | null;
  infoNetworkRatio?: () => Record<string, number> | null;
  infoNetworkCurrent?: Record<string, number>;
  networkCurrent?: Record<string, number>;
  applyNetworkRatio?: (counts: Record<string, number>) => void;
  item?: Item;
  reference?: boolean;
  catchup?: { a: number | null; b: number | null } | null;
  applyCatchup?: (side: "a" | "b") => void;
  perfectRatio?: () => void;
  stepRatio?: (allInputs: boolean, step: -1 | 1, includeReferences?: boolean) => void;
  hasInfoConnections?: boolean;
  infoBaseRatio?: () => void;
  canInfoBaseRatio?: boolean;
  canInfoInputRatio?: boolean;
  canStepConnectedRatio?: boolean;
  baseInputRatio?: () => void;
  canPerfectRatio?: boolean;
  canBaseInputRatio?: boolean;
  ratioAvailability?: () => {
    canInfoBaseRatio: boolean; canInfoInputRatio: boolean; canStepConnectedRatio: boolean;
    canPerfectRatio: boolean; canBaseInputRatio: boolean;
  };
  hasOtherSuppliers?: boolean;
  bend?: Point;
  targetBendX?: number;
  waypoints?: Point[];
  labelPosition?: Point;
  imagePosition?: Point;
  showLineCard?: boolean;
  showOverviewCard?: boolean;
  setCardVisible?: (overview: boolean, visible: boolean) => void;
  moveLabel?: (id: string, position: Point, image?: boolean) => void;
  select?: (additive: boolean, toggle?: boolean) => void;
  movePoints?: (id: string, waypoints: Point[]) => void;
  moveBend?: (id: string, point: Point, targetBendX: number) => void;
}>;

function ConnectedFactoriesIcon({ multipleInputs = true }: { multipleInputs?: boolean }) {
  return (
    <svg className="connected-factories-icon" width="24" height="20" viewBox="0 0 34 26"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d={multipleInputs ? "M11 6h6v14h-6m6-7h5" : "M11 13h11"} />
      {(multipleInputs ? [[1, 1], [1, 15], [23, 8]] : [[1, 8], [23, 8]]).map(([x, y]) => (
        <g key={`${x}:${y}`} transform={`translate(${x} ${y})`}>
          <path d="M0 10V5l4-3v3l4-3V0h2v10ZM2 7v1m3-1v1m3-1v1" />
        </g>
      ))}
    </svg>
  );
}

function OperationTooltip({ title, text, unavailable = false }: { title: string; text: string; unavailable?: boolean }) {
  return (
    <ItemTooltip compact followPointer placement="top-right">
      <strong style={{ color: "#fff" }}>{title}</strong>
      <span style={{ display: "block", width: 280, maxWidth: "calc(100vw - 48px)", whiteSpace: "normal", lineHeight: 1.4 }}>{text}</span>
      {unavailable && <span style={{ whiteSpace: "normal", maxWidth: 280 }}>Unavailable: a supported whole-machine balance could not be calculated within the machine-count limit.</span>}
    </ItemTooltip>
  );
}
export const GridEdge = memo(function GridEdge({
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
  const store = useStoreApi();
  const [menu, setMenu] = useState<{ x: number; y: number; point: Point; onLine: boolean } | null>(null);
  const ratioAvailability = menu && data?.ratioAvailability ? data.ratioAvailability() : data;
  const networkCounts = useMemo(() => menu && data?.networkRatio ? data.networkRatio() : null, [menu, data?.networkRatio]);
  const infoNetworkCounts = useMemo(() => menu && data?.infoNetworkRatio ? data.infoNetworkRatio() : null, [menu, data?.infoNetworkRatio]);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!menu || !element) return;
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - element.offsetHeight - 8))}px`;
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
    };
  }, [menu]);
  const crossingId = useId().replaceAll(":", "");
  const { settings } = useDisplaySettings();
  const arrowScale = settings.lineThickness / 6;
  const overview = useStore((state) => state.transform[2] < settings.overviewZoom);
  let scene = graphScenes.get(store);
  if (!scene) { scene = new GraphGeometry(); graphScenes.set(store, scene); }
  const geometry = scene;
  useStore(state => {
    geometry.update(state);
    return geometry.dependencies(id, overview, settings.overviewLineItems, !settings.disableArrows);
  }, (a, b) => a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
  const edges = store.getState().edges;
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
    image: boolean;
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
    // The fixed 12px handles are centered on the card edge. React Flow
    // supplies their outer edges, so extend underneath each port circle.
    { x: sourceX - 6, y: sourceY },
    { x: targetX + 6, y: targetY },
    data?.bend,
    data?.targetBendX,
    data?.waypoints,
  );
  scene.update(store.getState());
  const nearby = useStableValues(scene.nearby(id, route.points), (a, b) => a.edge.id === b.edge.id && a.points === b.points &&
    a.edge.selected === b.edge.selected && a.edge.data?.reference === b.edge.data?.reference);
  const midpoint = data?.imagePosition ?? routeMidpoint(route.points);
  const showOverviewItem = overview && (data?.showOverviewCard ?? settings.overviewLineItems) && !scene.hiddenItems(settings.overviewLineItems).has(id);
  const anySelected = scene.selected;
  const crossing = useMemo(() => !settings.crossingBridges || data?.reference || selected || anySelected
    ? { path: route.path, underpasses: [], junctions: [] }
    : crossingPath(route.points, nearby.filter(other => !other.edge.selected).map(other => other.points),
      nearby.filter(other => !other.edge.selected && !other.edge.data?.reference).map(other => other.points)),
    [route.path, nearby, settings.crossingBridges, data?.reference, selected, anySelected]);
  const otherRoutes = nearby.map(other => ({ id: other.edge.id, points: other.points }));

  const staticArrows = useMemo(() => {
    if (settings.disableArrows || settings.animatedArrows || data?.reference) return [];
    const length = route.points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - route.points[i].x, point.y - route.points[i].y), 0);
    return length < 40 ? [] : animatedDirectionMarkers(route.points, 0);
  }, [route.path, settings.disableArrows, settings.animatedArrows, data?.reference]);
  const foregroundArrows = otherRoutes.flatMap((other) => {
    const axes = new Set<string>();
    for (let index = 1; index < other.points.length; index++) {
      const a = other.points[index - 1], b = other.points[index];
      const horizontal = a.y === b.y;
      const contains = (p: Point) => horizontal
        ? p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x)
        : p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
      if ((horizontal && crossing.underpasses.some(contains)) ||
          crossing.junctions.some((p) => (horizontal ? p.dy !== 0 : p.dx !== 0) && contains(p)))
        axes.add(horizontal ? "horizontal" : "vertical");
    }
    return [...axes].map((axis) => `connection-arrows-${other.id}-${axis}`);
  });
  // The detailed label is hidden in overview mode; don't solve its placement.
  const placedLabel = useRef<{ position: Point; middle: Point } | null>(null);
  const position = data?.labelPosition ?? (overview || !(data?.showLineCard ?? settings.detailLineItems)
    ? route.middle
    : scene.moving && placedLabel.current
    ? { x: placedLabel.current.position.x + route.middle.x - placedLabel.current.middle.x,
        y: placedLabel.current.position.y + route.middle.y - placedLabel.current.middle.y }
    : connectionLabelPosition(route, size.width, size.height,
      [route.points, ...[...scene.records.values()].filter(other => other.edge.id !== id && !other.edge.data?.reference).map(other => other.points)],
      scene.obstacles));
  if (!scene.moving) placedLabel.current = { position, middle: route.middle };
  const startLabelDrag = (
    event: PointerEvent<HTMLDivElement>,
    image = false,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    skipLabelClick.current = false;
    labelDrag.current = {
      image,
      pointer: flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
      position: image ? midpoint : position,
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
      active.image,
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
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      data?.movePoints?.(
        id,
        insertRouteBend(
          route,
          flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        ),
      );
      return;
    }
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
  const openMenu = (event: MouseEvent, onLine = false) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      onLine,
      x: event.clientX,
      y: event.clientY,
      point: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  };
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
      {menu && createPortal(
        <div ref={menuRef} className="diagram-selection-menu line-context-menu nodrag nopan" role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          {menu.onLine && <button role="menuitem" type="button" onClick={() => {
            data?.movePoints?.(id, insertRouteBend(route, menu.point)); setMenu(null);
          }}><CornerDownRight size={16} /> Create angle</button>}
          {[overview].map(isOverview => {
            const visible = isOverview ? (data?.showOverviewCard ?? settings.overviewLineItems) : (data?.showLineCard ?? settings.detailLineItems);
            const Icon = visible ? EyeOff : Eye;
            return <button key={String(isOverview)} role="menuitem" type="button" onClick={() => { data?.setCardVisible?.(isOverview, !visible); setMenu(null); }}><Icon size={16} />{visible ? "Hide" : "Show"} line card</button>;
          })}
          {!data?.readOnlyMachines && <>
          {data?.catchup && <>
            <div role="separator" className="diagram-menu-divider" />
            <button role="menuitem" type="button" disabled={data.catchup.a === null}
              onClick={() => { data.applyCatchup?.("a"); setMenu(null); }}>
              <Factory size={16} /> Machine A catchup
              <OperationTooltip title="Machine A catchup" unavailable={data.catchup.a === null}
                text={`Adjusts only Machine A, the producer, to meet Machine B's current demand. Uses an exact whole count if possible; otherwise rounds up to the first count that produces a surplus.${data.catchup.a !== null ? ` Result: ${data.catchup.a.toLocaleString("en-US")} machines.` : ""}`} />
            </button>
            <button role="menuitem" type="button" disabled={data.catchup.b === null}
              onClick={() => { data.applyCatchup?.("b"); setMenu(null); }}>
              <Factory size={16} /> Machine B catchup
              <OperationTooltip title="Machine B catchup"
                text={`Adjusts only Machine B, the consumer, to the highest whole count supported by Machine A's current supply. Uses an exact balance if possible; otherwise rounds down, leaving surplus production. Other suppliers are not included.${data.catchup.b !== null ? ` Result: ${data.catchup.b.toLocaleString("en-US")} machines.` : " Unavailable: no supported count between 1 and the machine-count limit can be used."}`} />
            </button>
          </>}
          <div role="separator" className="diagram-menu-divider" />
          {[{ allInputs: false, info: false }, ...(data?.hasOtherSuppliers ? [{ allInputs: true, info: false }] : []), ...(data?.hasInfoConnections ? [{ allInputs: true, info: true }] : [])].map(({ allInputs, info }) => {
            const label = allInputs ? "Adjust connected inputs ratio" : "Adjust connected machines ratio";
            const includeReferences = info || (!allInputs && !!data?.reference);
            const enabled = info ? ratioAvailability?.canInfoInputRatio : allInputs ? ratioAvailability?.canStepConnectedRatio : data?.reference ? ratioAvailability?.canInfoBaseRatio : ratioAvailability?.canPerfectRatio;
            const scope = allInputs ? "the receiving machine and all its directly connected input suppliers" : "the two machines on this line";
            const infoHelp = includeReferences ? " Includes info connections using actual container capacities; they remain excluded from production and area-summary relationships." : "";
            const increaseHelp = `If unbalanced, brings ${scope} to the smallest balanced whole-number ratio without reducing any count. Keeps the receiving machine's count when possible. Once balanced, each click adds one ratio unit: 2:3 becomes 4:6, then 6:9. Keeps this menu open.${infoHelp}`;
            const decreaseHelp = `If unbalanced, brings ${scope} down to the nearest balanced whole-number ratio. Once balanced, each click removes one ratio unit: 6:9 becomes 4:6, then 2:3. If no lower perfect ratio is available, resets all affected machines to 1. Keeps this menu open.${infoHelp}`;
            return (
              <div key={`${label}-${info}`} role={info ? "group" : undefined} aria-label={info ? "Ratios including info connections" : undefined}>
              {info && <>
                <div role="separator" className="diagram-menu-divider" />
                <div className="info-ratio-heading">Including info lines<span className="info-line-sample" aria-hidden="true" /></div>
              </>}
              <div className={`line-ratio-controls${info ? " info-ratio-option" : ""}`} role="group" aria-label={label + (info ? " including info connections" : "")}>
                <div className="line-ratio-action" aria-disabled={!enabled}>
                  <ConnectedFactoriesIcon multipleInputs={allInputs} /> {label}
                  <OperationTooltip title={label} text={increaseHelp} unavailable={!enabled} />
                </div>
                <button className="line-ratio-step" role="menuitem" type="button" disabled={!data?.stepRatio}
                  aria-label={allInputs ? "Decrease connected inputs ratio" : "Decrease connected machines ratio"}
                  onClick={() => data?.stepRatio?.(allInputs, -1, includeReferences)}><Minus size={16} />
                  <OperationTooltip title={allInputs ? "Decrease connected inputs ratio" : "Decrease connected machines ratio"} text={decreaseHelp} unavailable={!data?.stepRatio} />
                </button>
                <button className="line-ratio-step" role="menuitem" type="button" disabled={!enabled}
                  aria-label={allInputs ? "Increase connected inputs ratio" : "Increase connected machines ratio"}
                  onClick={() => data?.stepRatio?.(allInputs, 1, includeReferences)}><Plus size={16} />
                  <OperationTooltip title={allInputs ? "Increase connected inputs ratio" : "Increase connected machines ratio"} text={increaseHelp} unavailable={!enabled} />
                </button>
              </div>
              {!info && allInputs === !!data?.hasOtherSuppliers && <>
          <div role="separator" className="diagram-menu-divider" />
          <button className="base-ratio-option" role="menuitem" type="button" disabled={!(data?.reference ? ratioAvailability?.canInfoBaseRatio : ratioAvailability?.canPerfectRatio)}
            onClick={() => { if (data?.reference) data.infoBaseRatio?.(); else data?.perfectRatio?.(); setMenu(null); }}><ConnectedFactoriesIcon multipleInputs={false} /> Set connected machines to base ratio
            <OperationTooltip title="Set connected machines to base ratio" unavailable={!(data?.reference ? ratioAvailability?.canInfoBaseRatio : ratioAvailability?.canPerfectRatio)}
              text={`Sets these two machines to the smallest whole-number counts that balance production and consumption on this line. Other suppliers are not included, and existing counts may decrease.${data?.reference ? " Converts containers to their actual fluid capacity; this remains an info connection." : ""}`} />
          </button>
          {data?.networkRatio && <NetworkRatioControls base={networkCounts} current={data.networkCurrent ?? {}} includeInfo={data.reference}
            apply={counts => data.applyNetworkRatio?.(counts)} />}

          {data?.hasOtherSuppliers && <button className="base-ratio-option" role="menuitem" type="button" disabled={!ratioAvailability?.canBaseInputRatio}
            onClick={() => { data.baseInputRatio?.(); setMenu(null); }}><ConnectedFactoriesIcon /> Set connected inputs to base ratio
            <OperationTooltip title="Set connected inputs to base ratio" unavailable={!ratioAvailability?.canBaseInputRatio}
              text="Sets the receiving machine and all machines directly supplying its connected inputs to their smallest balanced whole-number counts. All incoming lines balance, and existing machine counts may decrease." />
          </button>}
              </>}
              </div>
            );
          })}
          {data?.infoNetworkRatio && <>
            {!data.hasInfoConnections && <>
              <div role="separator" className="diagram-menu-divider" />
              <div className="info-ratio-heading">Including info lines<span className="info-line-sample" aria-hidden="true" /></div>
            </>}
            <NetworkRatioControls includeInfo base={infoNetworkCounts} current={data.infoNetworkCurrent ?? {}} apply={counts => data.applyNetworkRatio?.(counts)} />
          </>}
          </>}
        </div>, document.body,
      )}
      <g
        onContextMenu={(event) => openMenu(event, true)}
      >
        <defs>
          {data?.reference && <mask id={`${crossingId}-arrow-overlay`} maskUnits="userSpaceOnUse"
            x={Math.min(...route.points.map((point) => point.x)) - 30}
            y={Math.min(...route.points.map((point) => point.y)) - 30}
            width={Math.max(...route.points.map((point) => point.x)) - Math.min(...route.points.map((point) => point.x)) + 60}
            height={Math.max(...route.points.map((point) => point.y)) - Math.min(...route.points.map((point) => point.y)) + 60}>
            <path d={route.path} fill="none" stroke="white" strokeWidth={settings.lineThickness} />
          </mask>}
          {data?.reference && ["color", "white"].map((variant) => (
            <pattern key={variant} id={`${crossingId}-reference-${variant}`} patternUnits="userSpaceOnUse"
              width={16 * arrowScale} height={16 * arrowScale} patternTransform="rotate(45)">
              <rect width={8 * arrowScale} height={16 * arrowScale} fill={variant === "white" ? "white" : String(style?.stroke ?? "#9ca3af")} />
            </pattern>
          ))}
          <filter id={`${crossingId}-black-silhouette`}>
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
          </filter>
          <filter id={`${crossingId}-white-silhouette`}>
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
          </filter>
          <mask
            id={`${crossingId}-mask`}
            maskUnits="userSpaceOnUse"
            x={Math.min(...route.points.map((p) => p.x)) - 30}
            y={Math.min(...route.points.map((p) => p.y)) - 30}
            width={
              Math.max(...route.points.map((p) => p.x)) -
              Math.min(...route.points.map((p) => p.x)) +
              60
            }
            height={
              Math.max(...route.points.map((p) => p.y)) -
              Math.min(...route.points.map((p) => p.y)) +
              60
            }
          >
            <path
              d={crossing.path}
              fill="none"
              stroke="white"
              strokeWidth={40 * arrowScale}
            />
            {crossing.underpasses.map((point, index) => (
              <rect
                key={index}
                x={point.x - 20 * arrowScale}
                y={point.y - settings.lineThickness / 2}
                width={40 * arrowScale}
                height={settings.lineThickness}
                fill="black"
              />
            ))}
            {foregroundArrows.map((arrowId) => <use key={arrowId} href={`#${arrowId}`} filter={`url(#${crossingId}-black-silhouette)`} />)}
          </mask>
          {crossing.underpasses.map((point, index) => (
            <linearGradient
              key={index}
              id={`${crossingId}-shadow-${index}`}
              gradientUnits="userSpaceOnUse"
              x1={point.x}
              x2={point.x}
              y1={point.y - 11 * arrowScale}
              y2={point.y + 11 * arrowScale}
            >
              <stop offset="0" stopColor="black" stopOpacity="0" />
              <stop offset="0.3" stopColor="black" stopOpacity="0.8" />
              <stop offset="0.7" stopColor="black" stopOpacity="0.8" />
              <stop offset="1" stopColor="black" stopOpacity="0" />
            </linearGradient>
          ))}
          {crossing.junctions.map((point, index) => (
            <linearGradient key={`junction-${index}`} id={`${crossingId}-junction-${index}`} gradientUnits="userSpaceOnUse"
              x1={point.x + point.dx * 3 * arrowScale} y1={point.y + point.dy * 3 * arrowScale}
              x2={point.x + point.dx * 11 * arrowScale} y2={point.y + point.dy * 11 * arrowScale}>
              <stop offset="0" stopColor="black" stopOpacity="0.8" />
              <stop offset="1" stopColor="black" stopOpacity="0" />
            </linearGradient>
          ))}
          <mask
            id={`${crossingId}-shadow-shape`}
            maskUnits="userSpaceOnUse"
            x={Math.min(...route.points.map((p) => p.x)) - 30}
            y={Math.min(...route.points.map((p) => p.y)) - 30}
            width={Math.max(...route.points.map((p) => p.x)) - Math.min(...route.points.map((p) => p.x)) + 60}
            height={Math.max(...route.points.map((p) => p.y)) - Math.min(...route.points.map((p) => p.y)) + 60}
          >
            <path d={crossing.path} fill="none" stroke={data?.reference ? `url(#${crossingId}-reference-white)` : "white"} strokeWidth={style?.strokeWidth ?? 6} />
            <use href={`#${crossingId}-arrows`} filter={`url(#${crossingId}-white-silhouette)`} />
            {foregroundArrows.map((arrowId) => <use key={arrowId} href={`#${arrowId}`} filter={`url(#${crossingId}-black-silhouette)`} />)}
          </mask>
        </defs>
        <g
          mask={
            crossing.underpasses.length ? `url(#${crossingId}-mask)` : undefined
          }
        >
          <BaseEdge
            id={id}
            path={crossing.path}
            style={{
              ...style,
              stroke: data?.reference ? `url(#${crossingId}-reference-color)` : style?.stroke,
              filter: selected
                ? `drop-shadow(0 0 4px ${style?.stroke ?? "#fff"}) drop-shadow(0 0 8px ${style?.stroke ?? "#fff"})`
                : undefined,
            }}
            interactionWidth={20}
          />
        </g>
        <g mask={crossing.underpasses.length ? `url(#${crossingId}-mask)` : undefined}>
        <g id={`${crossingId}-arrows`}>
        {settings.disableArrows || data?.reference ? null : settings.animatedArrows ? (
          <AnimatedLineArrows idPrefix={`connection-arrows-${id}`} points={route.points} scale={arrowScale} color={lineDirectionColor(String(style?.stroke ?? "#ffffff"))} />
        ) : ["horizontal", "vertical"].map((axis) => <g key={axis} id={`connection-arrows-${id}-${axis}`}>
        {staticArrows.filter((marker) => (Math.abs(marker.angle) % 180 === 0) === (axis === "horizontal")).map((marker, index) => (
          <path
            key={`direction-${index}`}
            d="M8,0 L-6,-9 L-6,9 Z"
            transform={`translate(${marker.x},${marker.y}) rotate(${marker.angle}) scale(${arrowScale})`}
            fill={lineDirectionColor(String(style?.stroke ?? "#ffffff"))}
            stroke="#242424"
            strokeWidth={1}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}</g>)}
        </g>
        <g mask={`url(#${crossingId}-shadow-shape)`} pointerEvents="none">
        {crossing.underpasses.map((point, index) => (
          <path
            key={`crossing-shadow-${index}`}
            d={`M${point.x},${point.y - 11 * arrowScale} V${point.y + 11 * arrowScale}`}
            stroke={`url(#${crossingId}-shadow-${index})`}
            strokeWidth={20 * arrowScale}
            fill="none"
            pointerEvents="none"
          />
        ))}
        {crossing.junctions.map((point, index) => (
          <path key={`junction-shadow-${index}`}
            d={`M${point.x + point.dx * 3 * arrowScale},${point.y + point.dy * 3 * arrowScale} L${point.x + point.dx * 11 * arrowScale},${point.y + point.dy * 11 * arrowScale}`}
            stroke={`url(#${crossingId}-junction-${index})`} strokeWidth={20 * arrowScale} fill="none" pointerEvents="none" />
        ))}
        </g>
        </g>
        {data?.reference && !settings.disableArrows && (
          <g mask={`url(#${crossingId}-arrow-overlay)`} pointerEvents="none">
            {edges.filter((edge) => !edge.hidden && !edge.data?.reference).flatMap((edge) =>
              ["horizontal", "vertical"].map((axis) => (
                <use key={`${edge.id}-${axis}`} href={`#connection-arrows-${edge.id}-${axis}`}
                  fill={lineDirectionColor(String(edge.style?.stroke ?? "#ffffff"))}
                  stroke="#242424" strokeWidth={1} strokeLinejoin="round" />
              )),
            )}
          </g>
        )}
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
            className={`connection-label nodrag nopan${data?.reference ? " reference-connection" : ""}${selected ? " selected" : ""}${overview || !(data?.showLineCard ?? settings.detailLineItems) ? " overview-hidden" : ""}`}
            onContextMenu={openMenu}
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
              zIndex: selected ? 2700 : 2600,
            }}
          >
            {label}
          </div>
        )}
        {data?.item && (
          <div
            className={`connection-overview-item nodrag nopan${showOverviewItem ? " visible" : ""}${selected ? " selected" : ""}`}
            onContextMenu={openMenu}
            onPointerDown={(event) => startLabelDrag(event, true)}
            onPointerMove={moveLabel}
            onPointerUp={stopLabelDrag}
            onPointerCancel={stopLabelDrag}
            onLostPointerCapture={() => {
              labelDrag.current = null;
            }}
            style={{
              left: midpoint.x,
              top: midpoint.y,
              zIndex: selected ? 2700 : 2600,
            }}
            aria-hidden={!showOverviewItem}
            onClick={(event) => {
              event.stopPropagation();
              if (skipLabelClick.current) {
                skipLabelClick.current = false;
                return;
              }
              data.select?.(
                event.ctrlKey || event.metaKey,
                event.ctrlKey || event.metaKey,
              );
            }}
          >
            <strong className="connection-overview-name">
              {data.item.name.replace(/§./g, "")}
            </strong>
            {data.item.image ? (
              <img
                className={data.item.kind === "fluid" ? "connection-fluid-image" : undefined}
                src={data.item.image}
                alt={data.item.name}
                draggable={false}
              />
            ) : (
              <span>?</span>
            )}
            {showOverviewItem && (
              <ItemTooltip compact followPointer placement="top-right">
                <strong>{data.item.name.replace(/§./g, "")}</strong>
              </ItemTooltip>
            )}
          </div>
        )}
        {selected &&
          corners.map(({ point, index }) => (
            <button
              key={index}
              className="connection-bend nodrag nopan"
              aria-label={`Move connection corner ${index + 1}`}
              title="Drag to route this connection · Middle-click to add a bend · Arrow keys move one grid step"
              style={{
                transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                zIndex: 2002,
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  event.stopPropagation();
                }
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
});
