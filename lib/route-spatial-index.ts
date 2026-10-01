import type { Point } from "./diagram-geometry";
type Bounds = { left: number; top: number; right: number; bottom: number };
const intersects = (a: Bounds, b: Bounds) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
const segments = (points: Point[]) => points.slice(1).map((b, i) => ({
  left: Math.min(points[i].x, b.x), right: Math.max(points[i].x, b.x),
  top: Math.min(points[i].y, b.y), bottom: Math.max(points[i].y, b.y),
}));

/** Broad-phase segment index; exact crossing rules remain in crossingPath. */
export class RouteSpatialIndex {
  private cells = new Map<string, Set<string>>();
  private records = new Map<string, { bounds: Bounds[]; cells: Set<string> }>();
  private large = new Set<string>();
  constructor(private cellSize = 512) {}
  private keys(bounds: Bounds): string[] | null {
    const x0 = Math.floor(bounds.left / this.cellSize), x1 = Math.floor(bounds.right / this.cellSize);
    const y0 = Math.floor(bounds.top / this.cellSize), y1 = Math.floor(bounds.bottom / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return null;
    const keys: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
    return keys;
  }
  remove(id: string) {
    for (const key of this.records.get(id)?.cells ?? []) {
      const cell = this.cells.get(key);
      cell?.delete(id);
      if (!cell?.size) this.cells.delete(key);
    }
    this.large.delete(id);
    this.records.delete(id);
  }
  set(id: string, points: Point[]) {
    this.remove(id);
    const bounds = segments(points), keys = new Set<string>();
    for (const segment of bounds) {
      const found = this.keys(segment);
      if (!found) this.large.add(id);
      else found.forEach(key => keys.add(key));
    }
    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = new Set());
      cell.add(id);
    }
    this.records.set(id, { bounds, cells: keys });
  }
  query(points: Point[]) {
    const bounds = segments(points), candidates = new Set(this.large);
    for (const segment of bounds) {
      const keys = this.keys(segment);
      if (!keys) this.records.forEach((_, id) => candidates.add(id));
      else for (const key of keys) this.cells.get(key)?.forEach(id => candidates.add(id));
    }
    return [...candidates].filter(id => this.records.get(id)?.bounds.some(other => bounds.some(segment => intersects(segment, other))));
  }
}
