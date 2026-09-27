import type { Point } from "./diagram-geometry";

/** Keep crossings straight; mask vertical routes beneath horizontal routes. */
export function crossingPath(points: Point[], others: Point[][], junctionOthers: Point[][] = others) {
  const commands = points.length ? [`M${points[0].x},${points[0].y}`] : [];
  const underpasses: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const junctions: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    commands.push(`L${b.x},${b.y}`);
    if (a.x !== b.x || a.y === b.y) continue;
    for (const other of others) {
      for (let j = 1; j < other.length; j++) {
        const c = other[j - 1], d = other[j];
        if (c.y !== d.y || c.x === d.x ||
            a.x <= Math.min(c.x, d.x) || a.x >= Math.max(c.x, d.x) ||
            c.y <= Math.min(a.y, b.y) || c.y >= Math.max(a.y, b.y)) continue;
        const key = `${a.x},${c.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          underpasses.push({ x: a.x, y: c.y });
        }
      }
    }
  }
  // At a bend joining a shared straight run, shade only the branching arm.
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    for (const [branch, shared] of [[points[index - 1], points[index + 1]], [points[index + 1], points[index - 1]]]) {
      const verticalBranch = branch.x === point.x && branch.y !== point.y;
      const horizontalBranch = branch.y === point.y && branch.x !== point.x;
      if (!(verticalBranch && shared.y === point.y && shared.x !== point.x) &&
          !(horizontalBranch && shared.x === point.x && shared.y !== point.y)) continue;
      const joins = junctionOthers.some((other) => other.slice(1).some((end, j) => {
        const start = other[j];
        return verticalBranch
          ? start.y === point.y && end.y === point.y && point.x > Math.min(start.x, end.x) && point.x < Math.max(start.x, end.x)
          : start.x === point.x && end.x === point.x && point.y > Math.min(start.y, end.y) && point.y < Math.max(start.y, end.y);
      }));
      if (joins) {
        const dx = Math.sign(branch.x - point.x), dy = Math.sign(branch.y - point.y);
        const key = `junction:${point.x},${point.y},${dx},${dy}`;
        if (!seen.has(key)) {
          seen.add(key);
          junctions.push({ ...point, dx, dy });
        }
      }
    }
  }
  return { path: commands.join(" "), underpasses, junctions };
}
