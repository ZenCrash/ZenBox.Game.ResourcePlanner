import type { Point } from "./diagram-geometry";

export const ARROW_SPACING = 160;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Shared world-space lattice: x + y = n * spacing at rest.
 * A signed offset advances each segment toward its target. No neighboring
 * routes or stored phases are needed to align overlapping segments.
 */
export function animatedDirectionMarkers(points: Point[], seconds: number) {
  const markers: (Point & { angle: number; opacity: number })[] = [];
  const lengths = points.slice(1).map((end, i) => Math.hypot(end.x - points[i].x, end.y - points[i].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total < 40) return markers;
  const travel = modulo(seconds * 24, ARROW_SPACING);
  let offset = 0;
  for (let index = 0; index < lengths.length; index++) {
    const start = points[index], end = points[index + 1], length = lengths[index];
    if (!length) continue;
    // Routes are orthogonal; ignore invalid segments instead of placing
    // misaligned arrows along a diagonal.
    if (start.x !== end.x && start.y !== end.y) { offset += length; continue; }
    const sign = Math.sign(end.x - start.x || end.y - start.y);
    const first = modulo(travel - sign * (start.x + start.y), ARROW_SPACING);
    for (let distance = first; distance < length; distance += ARROW_SPACING) {
      const lattice = Math.round((start.x + start.y + sign * distance - sign * travel) / ARROW_SPACING);
      const coordinateSum = lattice * ARROW_SPACING + sign * travel;
      const routeDistance = offset + distance;
      markers.push({
        x: start.y === end.y ? coordinateSum - start.y : start.x,
        y: start.x === end.x ? coordinateSum - start.x : start.y,
        angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI,
        opacity: Math.max(0, Math.min(1, routeDistance / 12, (total - routeDistance) / 12)),
      });
    }
    offset += length;
  }
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


export function lineDirectionMarkers(points: Point[]) {
  return animatedDirectionMarkers(points, 0).map(({ opacity, ...marker }) => marker);
}
