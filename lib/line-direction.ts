import type { Point } from "./diagram-geometry";

/** Follow cumulative route distance so spacing stays constant through bends. */
export function animatedDirectionMarkers(points: Point[], seconds: number, phaseOffset = 0, initialDistances?: number[]) {
  const markers: (Point & { angle: number; opacity: number })[] = [];
  const lengths = points.slice(1).map((end, index) => Math.hypot(end.x - points[index].x, end.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const travel = seconds * 24;
  const distances = initialDistances?.map((distance) => distance + travel).filter((distance) => distance < total) ?? [];
  for (let distance = ((travel + phaseOffset) % 160 + 160) % 160; distance < total; distance += 160) {
    // Existing arrows start exactly where they were; new ones enter only at the source.
    if (!initialDistances || distance - travel < 0) distances.push(distance);
  }
  distances.sort((a, b) => a - b);
  let offset = 0;
  let cursor = 0;
  for (let index = 0; index < lengths.length; index++) {
    const start = points[index], end = points[index + 1], length = lengths[index];
    if (!length) continue;
    while (cursor < distances.length && distances[cursor] < offset + length) {
      const distance = distances[cursor];
      const fraction = (distance - offset) / length;
      markers.push({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
        angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
        opacity: Math.max(0, Math.min(1, distance / 12, (total - distance) / 12)),
      });
      cursor++;
    }
    offset += length;
  }
  return markers;
}

export function staticDirectionDistances(points: Point[], others: Point[][] = []) {
  return lineDirectionMarkers(points, others).map((marker) => {
    let offset = 0;
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1], end = points[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (marker.x >= Math.min(start.x, end.x) && marker.x <= Math.max(start.x, end.x) &&
          marker.y >= Math.min(start.y, end.y) && marker.y <= Math.max(start.y, end.y))
        return offset + Math.hypot(marker.x - start.x, marker.y - start.y);
      offset += length;
    }
    return offset;
  });
}

/** Align whole-route phases using shared segments, prioritizing longest overlaps.
 * Conflicting loop lengths cannot all synchronize without breaking spacing. */
export function animatedRoutePhases(routes: Point[][], initialPhases?: number[]) {
  const segments = routes.map((points) => {
    let distance = 0;
    return points.slice(1).map((end, index) => {
      const start = points[index];
      const horizontal = start.y === end.y;
      const from = horizontal ? start.x : start.y;
      const to = horizontal ? end.x : end.y;
      const segment = { horizontal, from, to, fixed: horizontal ? start.y : start.x, distance, sign: Math.sign(to - from) };
      distance += Math.abs(to - from);
      return segment;
    }).filter((segment) => segment.sign);
  });
  const constraints: { a: number; b: number; delta: number; overlap: number }[] = [];
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      for (const first of segments[a]) for (const second of segments[b]) {
        if (first.horizontal !== second.horizontal || first.fixed !== second.fixed || first.sign !== second.sign) continue;
        const low = Math.max(Math.min(first.from, first.to), Math.min(second.from, second.to));
        const high = Math.min(Math.max(first.from, first.to), Math.max(second.from, second.to));
        if (high <= low) continue;
        constraints.push({ a, b, overlap: high - low, delta: second.distance + Math.abs(low - second.from) - first.distance - Math.abs(low - first.from) });
      }
    }
  }
  const phases = routes.map((_, index) => initialPhases?.[index] ?? 0);
  const groups = routes.map((_, index) => index);
  for (const { a, b, delta } of constraints.sort((a, b) => b.overlap - a.overlap)) {
    if (groups[a] === groups[b]) continue;
    const oldGroup = groups[b];
    const shift = phases[a] + delta - phases[b];
    for (let index = 0; index < groups.length; index++) {
      if (groups[index] === oldGroup) {
        phases[index] += shift;
        groups[index] = groups[a];
      }
    }
  }
  return phases;
}

export function lineDirectionColor(color: string) {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return color;
  return `#${match[1].match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16);
    return Math.round(value + (255 - value) * 0.45).toString(16).padStart(2, "0");
  }).join("")}`;
}

/** Use continuous path spacing, including across bends and crossings. */
export function directionPhase(points: Point[], others: Point[][] = []) {
  const key = JSON.stringify(points);
  const keys = [...new Set([key, ...others.map((route) => JSON.stringify(route))])].sort();
  const routes = keys.map((value) => JSON.parse(value) as Point[]);
  const initialPhases = routes.map((route) => {
    const total = route.slice(1).reduce((sum, end, index) => sum + Math.hypot(end.x - route[index].x, end.y - route[index].y), 0);
    return total < 160 ? total / 2 : 80;
  });
  return animatedRoutePhases(routes, initialPhases)[keys.indexOf(key)];
}

export function lineDirectionMarkers(points: Point[], others: Point[][] = []) {
  const total = points.slice(1).reduce((sum, end, index) =>
    sum + Math.hypot(end.x - points[index].x, end.y - points[index].y), 0);
  if (total < 40) return [];
  return animatedDirectionMarkers(points, 0, directionPhase(points, others))
    .map(({ opacity, ...marker }) => marker);
}
