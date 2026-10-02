import type { Point } from "./diagram-geometry";

export const ARROW_SPACING = 160;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Advance arrows along cumulative route distance so bends never reset spacing. */
export function animatedDirectionMarkers(points: Point[], seconds: number, phase?: number, spacing = ARROW_SPACING) {
  const markers: (Point & { angle: number; opacity: number })[] = [];
  const lengths = points.slice(1).map((end, i) => Math.hypot(end.x - points[i].x, end.y - points[i].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 40) return markers;
  const initial = phase ?? (total < spacing ? total / 2 : spacing / 2);
  let distance = modulo(initial + seconds * 24, spacing);
  let offset = 0;
  lengths.forEach((length, index) => {
    if (!length) return;
    const start = points[index], end = points[index + 1];
    while (distance < offset + length) {
      const fraction = (distance - offset) / length;
      markers.push({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
        angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
        opacity: Math.max(0, Math.min(1, distance / 12, (total - distance) / 12)),
      });
      distance += spacing;
    }
    offset += length;
  });
  return markers;
}

export function lineDirectionColor(color: string) {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return color;
  return `#${match[1].match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16);
    return Math.round(value + (255 - value) * 0.45).toString(16).padStart(2, "0");
  }).join("")}`;
}


/** Static placement and the first animation frame share exactly the same points. */
export function lineDirectionMarkers(points: Point[], phase?: number) {
  return animatedDirectionMarkers(points, 0, phase).map(({ opacity, ...marker }) => marker);
}

/** Share a route-distance phase across overlapping, same-direction segments.
 * Long shared runs take priority if a loop imposes incompatible phases. */
export function synchronizedArrowPhases(routes: { id: string; points: Point[] }[], nearby: (points: Point[]) => string[], spacing = ARROW_SPACING) {
  const segments = new Map(routes.map(route => {
    let offset = 0;
    return [route.id, route.points.slice(1).map((end, index) => {
      const start = route.points[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const segment = { start, end, offset, length };
      offset += length;
      return segment;
    })];
  }));
  const constraints: { a: string; b: string; delta: number; length: number }[] = [];
  for (const route of routes) for (const id of nearby(route.points)) {
    if (id <= route.id || !segments.has(id)) continue;
    for (const a of segments.get(route.id)!) for (const b of segments.get(id)!) {
      if (!a.length || !b.length) continue;
      const horizontal = a.start.y === a.end.y;
      const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
      if (a.start[cross] !== a.end[cross] || b.start[cross] !== b.end[cross] || a.start[cross] !== b.start[cross]) continue;
      const direction = Math.sign(a.end[axis] - a.start[axis]);
      if (direction !== Math.sign(b.end[axis] - b.start[axis])) continue;
      const low = Math.max(Math.min(a.start[axis], a.end[axis]), Math.min(b.start[axis], b.end[axis]));
      const high = Math.min(Math.max(a.start[axis], a.end[axis]), Math.max(b.start[axis], b.end[axis]));
      if (high <= low) continue;
      constraints.push({ a: route.id, b: id, length: high - low,
        delta: b.offset + direction * (low - b.start[axis]) - a.offset - direction * (low - a.start[axis]) });
    }
  }
  const parent = new Map(routes.map(r => [r.id, r.id]));
  const offsets = new Map<string, number>();
  const root = (id: string): { id: string; offset: number } => {
    const p = parent.get(id)!;
    if (p === id) return { id, offset: 0 };
    const r = root(p), offset = (offsets.get(id) ?? 0) + r.offset;
    parent.set(id, r.id); offsets.set(id, offset);
    return { id: r.id, offset };
  };
  constraints.sort((a,b) => b.length-a.length || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  for (const c of constraints) {
    const a = root(c.a), b = root(c.b);
    if (a.id === b.id) continue;
    parent.set(b.id, a.id);
    offsets.set(b.id, modulo(a.offset + c.delta - b.offset, spacing));
  }
  return new Map(routes.map(route => {
    const r = root(route.id);
    const total = segments.get(r.id)!.reduce((sum, segment) => sum + segment.length, 0);
    return [route.id, modulo((total < spacing ? total / 2 : spacing / 2) + r.offset, spacing)];
  }));
}
