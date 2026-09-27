export const GRID_SIZE = 20;
export type Point = { x: number; y: number };

export function routeMidpoint(points: Point[]): Point {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (length > 0 && remaining <= length) {
      const fraction = remaining / length;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * fraction,
        y: points[index].y + (points[index + 1].y - points[index].y) * fraction,
      };
    }
    remaining -= length;
  }
  return points[0] ?? { x: 0, y: 0 };
}
export function snapPoint(point: Point): Point {
  return {
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
  };
}
export function connectionRoute(
  source: Point,
  target: Point,
  bend?: Point,
  targetBendX?: number,
  waypoints?: Point[],
) {
  const middle =
    bend ??
    snapPoint({ x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 });
  const approach =
    targetBendX ?? snapPoint({ x: target.x - GRID_SIZE, y: 0 }).x;
  const points = waypoints
    ? [source, ...waypoints.map((p) => ({ ...p })), target]
    : [
        source,
        { x: middle.x, y: source.y },
        middle,
        { x: approach, y: middle.y },
        { x: approach, y: target.y },
        target,
      ];
  if (waypoints) {
    points[1].y = source.y;
    points[points.length - 2].y = target.y;
  }
  return {
    middle,
    points,
    custom: !!waypoints,
    corners: points
      .slice(1, -1)
      .map((point, index) => ({ point, index }))
      .filter(({ point, index }) => {
        const previous = points[index],
          next = points[index + 2];
        return (
          (previous.x !== point.x || previous.y !== point.y) &&
          (next.x !== point.x || next.y !== point.y) &&
          !(previous.x === next.x || previous.y === next.y)
        );
      }),
    path: points
      .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
      .join(" "),
  };
}

export function moveRouteCorner(
  route: ReturnType<typeof connectionRoute>,
  index: number,
  point: Point,
  snapToGrid = true,
) {
  const snapped = snapToGrid ? snapPoint(point) : { ...point };
  if (route.custom) {
    const points = route.points.map((p) => ({ ...p }));
    const vertex = index + 1;
    const incomingVertical = index % 2 === 1;
    if (vertex === 1) snapped.y = points[0].y;
    if (vertex === points.length - 2) snapped.y = points.at(-1)!.y;
    points[vertex] = snapped;
    if (vertex > 1) {
      if (incomingVertical) points[vertex - 1].x = snapped.x;
      else points[vertex - 1].y = snapped.y;
    }
    if (vertex < points.length - 2) {
      if (incomingVertical) points[vertex + 1].y = snapped.y;
      else points[vertex + 1].x = snapped.x;
    }
    return {
      bend: route.middle,
      targetBendX: route.points[3].x,
      waypoints: points.slice(1, -1),
    };
  }
  return {
    bend: {
      x: index < 2 ? snapped.x : route.middle.x,
      y: index === 1 || index === 2 ? snapped.y : route.middle.y,
    },
    targetBendX: index >= 2 ? snapped.x : route.points[3].x,
  };
}

// Collapse a dropped pair only when its outside legs become one straight line.
export function mergeRouteCorner(
  route: ReturnType<typeof connectionRoute>,
  index: number,
  point: Point,
): Point[] | null {
  const vertex = index + 1;
  if (vertex < 1 || vertex >= route.points.length - 1) return null;
  const tolerance = GRID_SIZE / 2;
  const candidates = route.corners
    .filter(
      (corner) =>
        [1, 2].includes(Math.abs(corner.index - index)) &&
        Math.abs(corner.point.x - point.x) <= tolerance &&
        Math.abs(corner.point.y - point.y) <= tolerance,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.point.x - point.x, a.point.y - point.y) -
        Math.hypot(b.point.x - point.x, b.point.y - point.y),
    );
  for (const target of candidates) {
    const moved = moveRouteCorner(
      { ...route, custom: true },
      index,
      target.point,
      false,
    ).waypoints!;
    const points = [route.points[0], ...moved, route.points.at(-1)!];
    const lower = Math.min(vertex, target.index + 1),
      upper = Math.max(vertex, target.index + 1);
    const joint = points[lower];
    if (Math.abs(target.index - index) === 2) {
      // Retain the existing shared-neighbor detour collapse. It leaves one
      // corner because the two outside legs are perpendicular in this case.
      if (lower <= 1 || upper >= points.length - 2) continue;
      points.splice(lower + 1, 2);
      return points.slice(1, -1);
    }
    if (
      !points
        .slice(lower, upper + 1)
        .every((p) => p.x === joint.x && p.y === joint.y)
    )
      continue;
    const before = points[lower - 1],
      after = points[upper + 1];
    const horizontal = before.y === joint.y && after.y === joint.y;
    const vertical = before.x === joint.x && after.x === joint.x;
    if (!horizontal && !vertical) continue;
    points.splice(lower, upper - lower + 1);
    const simplified: Point[] = [];
    for (const p of points) {
      while (simplified.length > 1) {
        const a = simplified.at(-2)!,
          b = simplified.at(-1)!;
        if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))
          simplified.pop();
        else break;
      }
      simplified.push(p);
    }
    const waypoints = simplified.slice(1, -1);
    return waypoints.length >= 2
      ? waypoints
      : [{ ...points[0] }, { ...points.at(-1)! }];
  }
  return null;
}

export function draggableRouteSegments(
  route: ReturnType<typeof connectionRoute>,
) {
  const segments: {
    start: Point;
    end: Point;
    indexes: number[];
    vertical: boolean;
  }[] = [];
  route.points.slice(1).forEach((end, index) => {
    const start = route.points[index];
    if (start.x === end.x && start.y === end.y) return;
    const vertical = start.x === end.x;
    const previous = segments.at(-1);
    if (previous && previous.vertical === vertical) {
      previous.end = end;
      previous.indexes.push(index);
    } else segments.push({ start, end, indexes: [index], vertical });
  });
  // Merge visually continuous sections before excluding the two sections
  // touching recipe ports, including routes with collapsed/zero-length legs.
  return segments
    .slice(1, -1)
    .filter(({ start, end }) => start.x !== end.x || start.y !== end.y);
}

export function moveRouteSegment(
  route: ReturnType<typeof connectionRoute>,
  segment: ReturnType<typeof draggableRouteSegments>[number],
  point: Point,
) {
  const snapped = snapPoint(point);
  if (route.custom) {
    const points = route.points.map((p) => ({ ...p }));
    for (const index of segment.indexes) {
      for (const vertex of [index, index + 1]) {
        if (segment.vertical) points[vertex].x = snapped.x;
        else points[vertex].y = snapped.y;
      }
    }
    return {
      bend: route.middle,
      targetBendX: route.points[3].x,
      waypoints: points.slice(1, -1),
    };
  }
  return {
    bend: {
      x:
        segment.vertical && segment.indexes.includes(1)
          ? snapped.x
          : route.middle.x,
      y: !segment.vertical ? snapped.y : route.middle.y,
    },
    targetBendX:
      segment.vertical && segment.indexes.includes(3)
        ? snapped.x
        : route.points[3].x,
  };
}

// An orthogonal detour adds real, independently draggable corners without
// moving either recipe endpoint or changing the rest of the route.
export function insertRouteBend(
  route: ReturnType<typeof connectionRoute>,
  click: Point,
): Point[] {
  const candidates = route.points
    .slice(1)
    .flatMap((end, index) => {
      const start = route.points[index];
      if (start.x === end.x && start.y === end.y) return [];
      const vertical = start.x === end.x;
      const position = vertical
        ? {
            x: start.x,
            y: Math.max(
              Math.min(start.y, end.y),
              Math.min(Math.max(start.y, end.y), click.y),
            ),
          }
        : {
            x: Math.max(
              Math.min(start.x, end.x),
              Math.min(Math.max(start.x, end.x), click.x),
            ),
            y: start.y,
          };
      return [
        {
          start,
          end,
          index,
          vertical,
          position,
          distance: (position.x - click.x) ** 2 + (position.y - click.y) ** 2,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
  const segment = candidates[0];
  if (!segment) return route.points.slice(1, -1);
  const { start, end, index, vertical, position } = segment;
  const axis = vertical ? "y" : "x",
    cross = vertical ? "x" : "y";
  const direction = Math.sign(end[axis] - start[axis]);
  const length = Math.abs(end[axis] - start[axis]);
  const span = Math.min(GRID_SIZE, length / 3);
  const along = Math.max(
    span,
    Math.min(
      length - span * 2,
      direction * (snapPoint(position)[axis] - start[axis]),
    ),
  );
  const first = { ...position, [axis]: start[axis] + direction * along };
  const second = { ...first, [cross]: first[cross] + GRID_SIZE };
  const third = { ...second, [axis]: first[axis] + direction * span };
  const fourth = { ...third, [cross]: first[cross] };
  return [
    ...route.points.slice(0, index + 1),
    first,
    second,
    third,
    fourth,
    ...route.points.slice(index + 1),
  ].slice(1, -1);
}

// Center along the route's dominant axis. Move only across that axis to avoid
// lines: above/below horizontal routes, left/right vertical routes.
export function connectionLabelPosition(
  route: ReturnType<typeof connectionRoute>,
  width: number,
  height: number,
  routes: Point[][] = [route.points],
) {
  const gap = 16;
  const extent = (values: number[]) =>
    Math.max(...values) - Math.min(...values);
  const vertical =
    extent(route.points.map((p) => p.y)) > extent(route.points.map((p) => p.x));
  // Rotate vertical routes into the same placement problem, then rotate back.
  const project = (point: Point) =>
    vertical ? { x: point.y, y: point.x } : point;
  const points = route.points.map(project);
  const alongSize = vertical ? height : width;
  const acrossSize = vertical ? width : height;
  const center =
    (Math.min(...points.map((p) => p.x)) +
      Math.max(...points.map((p) => p.x))) /
    2;
  const x = center - alongSize / 2;
  const middle = project(route.middle);
  const crossing = points
    .slice(1)
    .map((b, index) => ({ a: points[index], b }))
    .filter(
      ({ a, b }) =>
        a.y === b.y &&
        a.x !== b.x &&
        center >= Math.min(a.x, b.x) &&
        center <= Math.max(a.x, b.x),
    )
    .sort((a, b) => Math.abs(a.a.y - middle.y) - Math.abs(b.a.y - middle.y));
  const y = crossing[0]?.a.y ?? middle.y;
  const segments = routes
    .map((points) => points.map(project))
    .flatMap((points) =>
      points.slice(1).map((b, index) => {
        const a = points[index];
        return {
          left: Math.min(a.x, b.x),
          right: Math.max(a.x, b.x),
          top: Math.min(a.y, b.y),
          bottom: Math.max(a.y, b.y),
        };
      }),
    )
    .filter(
      (segment) =>
        segment.right >= x - gap && segment.left <= x + alongSize + gap,
    );
  const find = (above: boolean) => {
    let top = above ? y - gap - acrossSize : y + gap;
    for (let attempt = 0; attempt <= segments.length; attempt++) {
      const collisions = segments.filter(
        (s) => top + acrossSize > s.top - gap && top < s.bottom + gap,
      );
      if (!collisions.length) return top;
      top = above
        ? Math.min(...collisions.map((s) => s.top - gap - acrossSize))
        : Math.max(...collisions.map((s) => s.bottom + gap));
    }
    return top;
  };
  const above = find(true),
    below = find(false);
  const beforeDistance = y - (above + acrossSize),
    afterDistance = below - y;
  const across = (
    vertical ? beforeDistance < afterDistance : beforeDistance <= afterDistance
  )
    ? above
    : below;
  return vertical ? { x: across, y: x } : { x, y: across };
}
