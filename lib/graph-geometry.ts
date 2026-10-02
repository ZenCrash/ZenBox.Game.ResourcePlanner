import { ARROW_SPACING, synchronizedArrowPhases } from "./line-direction";
import type { Edge, ReactFlowState } from "@xyflow/react";
import { connectionRoute, routeMidpoint, type Point } from "./diagram-geometry";
import { RouteSpatialIndex } from "./route-spatial-index";
import { hiddenOverviewItems } from "./overview-overlap";

type GeometryData = { bend?: Point; targetBendX?: number; waypoints?: Point[]; reference?: boolean; item?: { id: string }; imagePosition?: Point; showOverviewCard?: boolean };
export type RouteRecord = { edge: Edge; order: number; points: Point[]; geometry: unknown[] };
export class GraphGeometry {
  readonly index = new RouteSpatialIndex();
  readonly records = new Map<string, RouteRecord>();
  obstacles: { x: number; y: number; width: number; height: number }[] = [];
  selected = false;
  moving = false;
  settledRevision = 0;
  private arrowPhases?: Map<number, Map<string, number>>;
  private snapshot?: ReactFlowState;
  private hidden = new Map<boolean, Set<string>>();
  update(state: ReactFlowState) {
    if (this.snapshot === state) return;
    const previousState = this.snapshot;
    const wasMoving = this.moving;
    this.moving = state.nodes.some(node => node.dragging);
    if (!this.moving && (wasMoving || previousState?.nodes !== state.nodes || previousState?.edges !== state.edges)) this.settledRevision++;
    this.snapshot = state;
    this.hidden.clear();
    this.selected = state.edges.some(edge => edge.selected);
    const keep = new Set<string>();
    state.edges.forEach((edge, order) => {
      const source = state.nodeLookup.get(edge.source), target = state.nodeLookup.get(edge.target);
      const a = source?.internals.handleBounds?.source?.find(handle => handle.id === edge.sourceHandle);
      const b = target?.internals.handleBounds?.target?.find(handle => handle.id === edge.targetHandle);
      if (!source || !target || !a || !b) return;
      keep.add(edge.id);
      const data = edge.data as GeometryData | undefined;
      const start = { x: source.internals.positionAbsolute.x + a.x + a.width / 2, y: source.internals.positionAbsolute.y + a.y + a.height / 2 };
      const end = { x: target.internals.positionAbsolute.x + b.x + b.width / 2, y: target.internals.positionAbsolute.y + b.y + b.height / 2 };
      const geometry = [start.x, start.y, end.x, end.y, data?.bend?.x, data?.bend?.y, data?.targetBendX, data?.waypoints];
      const previous = this.records.get(edge.id);
      const changed = !previous || geometry.some((value, i) => value !== previous.geometry[i]);
      const points = changed ? connectionRoute(start, end, data?.bend, data?.targetBendX, data?.waypoints).points : previous.points;
      if (changed || previous?.edge.hidden !== edge.hidden || previous?.edge.data?.reference !== edge.data?.reference) this.arrowPhases = undefined;
      if (changed) this.index.set(edge.id, points);
      this.records.set(edge.id, { edge, order, points, geometry });
    });
    for (const id of this.records.keys()) if (!keep.has(id)) { this.records.delete(id); this.index.remove(id); this.arrowPhases = undefined; }
    this.obstacles = state.nodes.flatMap(node => {
      if (node.type === "summary" || node.hidden) return [];
      const internal = state.nodeLookup.get(node.id);
      return internal ? [{ ...internal.internals.positionAbsolute, width: internal.measured.width ?? node.width ?? 352, height: internal.measured.height ?? node.height ?? 240 }] : [];
    });
  }
  arrowPhase(id: string, spacing = ARROW_SPACING) {
    this.arrowPhases ??= new Map();
    let phases = this.arrowPhases.get(spacing);
    if (!phases) {
      phases = synchronizedArrowPhases(
        [...this.records.values()].filter(r => !r.edge.hidden && !r.edge.data?.reference).map(r => ({ id: r.edge.id, points: r.points })),
        points => this.index.query(points), spacing,
      );
      this.arrowPhases.set(spacing, phases);
    }
    return phases.get(id);
  }
  nearby(id: string, points: Point[]) {
    return this.index.query(points).filter(other => other !== id).map(other => this.records.get(other)!).sort((a, b) => a.order - b.order);
  }
  // React subscribers only repaint when this line's visible dependencies change.
  dependencies(id: string, overview: boolean, showOverviewItems: boolean, arrows: boolean): unknown[] {
    const record = this.records.get(id);
    if (!record) return [this.settledRevision, this.moving];
    return [record.points, arrows && this.arrowPhase(id), this.selected, this.moving, this.settledRevision,
      overview && this.hiddenItems(showOverviewItems).has(id),
      ...this.nearby(id, record.points).flatMap(other => [other.edge.id, other.points, other.edge.selected, other.edge.data?.reference]),
      ...(record.edge.data?.reference ? [...this.records.values()].flatMap(other => [other.edge.id, other.edge.hidden, other.edge.data?.reference, other.edge.style?.stroke]) : []),
    ];
  }
  hiddenItems(defaultVisible: boolean) {
    let hidden = this.hidden.get(defaultVisible);
    if (!hidden) {
      hidden = hiddenOverviewItems([...this.records.values()].flatMap(({ edge, order, points }) => {
        const data = edge.data as GeometryData | undefined;
        return !edge.hidden && data?.item && (data.showOverviewCard ?? defaultVisible)
          ? [{ id: edge.id, itemId: data.item.id, position: data.imagePosition ?? routeMidpoint(points), selected: !!edge.selected, order }] : [];
      }));
      this.hidden.set(defaultVisible, hidden);
    }
    return hidden;
  }
}
