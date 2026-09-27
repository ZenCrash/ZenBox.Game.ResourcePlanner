import { GRID_SIZE, type Point } from "./diagram-geometry";

export type RouteObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Search an orthogonal visibility grid, comparing bends before total distance.
// Only the short horizontal legs joining the ports may enter their own clearance.
export function initialRoute(
  source: Point,
  target: Point,
  sourceId: string,
  targetId: string,
  cards: RouteObstacle[],
  clearance = GRID_SIZE * 2,
): Point[] | undefined {
  const boxes = cards.map((card) => ({
    id: card.id,
    left: Math.floor((card.x - clearance) / GRID_SIZE) * GRID_SIZE,
    right: Math.ceil((card.x + card.width + clearance) / GRID_SIZE) * GRID_SIZE,
    top: Math.floor((card.y - clearance) / GRID_SIZE) * GRID_SIZE,
    bottom:
      Math.ceil((card.y + card.height + clearance) / GRID_SIZE) * GRID_SIZE,
  }));
  const start = {
    x: Math.max(
      source.x,
      boxes.find((b) => b.id === sourceId)?.right ?? source.x + clearance,
    ),
    y: source.y,
  };
  const end = {
    x: Math.min(
      target.x,
      boxes.find((b) => b.id === targetId)?.left ?? target.x - clearance,
    ),
    y: target.y,
  };
  const clear = (a: Point, b: Point, except?: string) =>
    !boxes.some(
      (box) =>
        box.id !== except &&
        (a.y === b.y
          ? a.y > box.top &&
            a.y < box.bottom &&
            Math.max(a.x, b.x) > box.left &&
            Math.min(a.x, b.x) < box.right
          : a.x > box.left &&
            a.x < box.right &&
            Math.max(a.y, b.y) > box.top &&
            Math.min(a.y, b.y) < box.bottom),
    );
  if (!clear(source, start, sourceId) || !clear(end, target, targetId))
    return undefined;
  const xs = [
    ...new Set([start.x, end.x, ...boxes.flatMap((b) => [b.left, b.right])]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([start.y, end.y, ...boxes.flatMap((b) => [b.top, b.bottom])]),
  ].sort((a, b) => a - b);
  type State = {
    x: number;
    y: number;
    direction: number;
    bends: number;
    length: number;
    previous?: State;
  };
  const compare = (a: State, b: State) =>
    a.bends - b.bends || a.length - b.length;
  const heap: State[] = [];
  const push = (state: State) => {
    let index = heap.length;
    heap.push(state);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compare(heap[parent], state) <= 0) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = state;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          compare(heap[child + 1], heap[child]) < 0
        )
          child++;
        if (compare(last, heap[child]) <= 0) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const key = (s: State) => `${s.x},${s.y},${s.direction}`;
  const best = new Map<string, State>();
  const first: State = {
    x: xs.indexOf(start.x),
    y: ys.indexOf(start.y),
    direction: 0,
    bends: 0,
    length: 0,
  };
  best.set(key(first), first);
  push(first);
  const steps = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  let winner: State | undefined;
  let winnerBends = Infinity;
  while (heap.length) {
    const current = pop();
    if (best.get(key(current)) !== current) continue;
    if (current.bends > winnerBends) break;
    const point = { x: xs[current.x], y: ys[current.y] };
    if (point.x === end.x && point.y === end.y && current.direction !== 2) {
      const bends = current.bends + (current.direction === 0 ? 0 : 1);
      if (
        bends < winnerBends ||
        (bends === winnerBends && current.length < (winner?.length ?? Infinity))
      ) {
        winner = current;
        winnerBends = bends;
      }
    }
    for (let direction = 0; direction < 4; direction++) {
      if (direction === (current.direction + 2) % 4) continue;
      const x = current.x + steps[direction][0],
        y = current.y + steps[direction][1];
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
      const nextPoint = { x: xs[x], y: ys[y] };
      if (!clear(point, nextPoint)) continue;
      const next: State = {
        x,
        y,
        direction,
        bends: current.bends + (direction === current.direction ? 0 : 1),
        length:
          current.length +
          Math.abs(point.x - nextPoint.x) +
          Math.abs(point.y - nextPoint.y),
        previous: current,
      };
      const old = best.get(key(next));
      if (!old || compare(next, old) < 0) {
        best.set(key(next), next);
        push(next);
      }
    }
  }
  if (!winner) return undefined;
  const path: Point[] = [];
  for (let state: State | undefined = winner; state; state = state.previous)
    path.push({ x: xs[state.x], y: ys[state.y] });
  path.reverse();
  const simplified: Point[] = [];
  for (const point of [source, ...path, target]) {
    const last = simplified.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    while (simplified.length > 1) {
      const a = simplified.at(-2)!,
        b = simplified.at(-1)!;
      if ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))
        simplified.pop();
      else break;
    }
    simplified.push(point);
  }
  // Keep two endpoint waypoints, including for a straight connection.
  const waypoints = simplified.slice(1, -1);
  return waypoints.length >= 2 ? waypoints : [start, end];
}
