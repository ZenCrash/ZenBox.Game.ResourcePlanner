import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRoute,
  routeMidpoint,
  connectionLabelPosition,
  moveRouteCorner,
  draggableRouteSegments,
  moveRouteSegment,
  insertRouteBend,
  snapPoint,
} from "../lib/diagram-geometry";
import { edgeSchema } from "../lib/model";
test("overview item follows the halfway distance along bent and reversed routes", () => {
  assert.deepEqual(
    routeMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ]),
    { x: 100, y: 150 },
  );
  assert.deepEqual(
    routeMidpoint([
      { x: 200, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ]),
    { x: 100, y: 150 },
  );
  assert.deepEqual(
    routeMidpoint([
      { x: 40, y: 20 },
      { x: 40, y: 20 },
    ]),
    { x: 40, y: 20 },
  );
});
test("positions and line bends snap to the invisible grid in both directions", () => {
  assert.deepEqual(snapPoint({ x: 37, y: -33 }), { x: 40, y: -40 });
  assert.deepEqual(snapPoint({ x: 40, y: -40 }), { x: 40, y: -40 });
  const route = connectionRoute({ x: 340, y: 65 }, { x: 740, y: 107 });
  assert.equal(route.middle.x % 20, 0);
  assert.equal(route.middle.y % 20, 0);
  const fractionalPort = connectionRoute(
    { x: 345.1, y: 60 },
    { x: 654.9, y: 100 },
  );
  assert.equal(fractionalPort.points[3].x % 20, 0);
  assert.equal(fractionalPort.points[4].x % 20, 0);
  assert.deepEqual(fractionalPort.points.at(-1), { x: 654.9, y: 100 });
});
test("manual orthogonal routes retain their bend and exact port endpoints", () => {
  const route = connectionRoute(
    { x: 340, y: 65 },
    { x: 740, y: 107 },
    { x: 500, y: 200 },
  );
  assert.deepEqual(route.middle, { x: 500, y: 200 });
  assert.equal(
    route.path,
    "M340,65 L500,65 L500,200 L720,200 L720,107 L740,107",
  );
});

test("all four corners are movable while preserving orthogonal segments and ports", () => {
  const source = { x: 340, y: 60 },
    target = { x: 900, y: 180 };
  const route = connectionRoute(source, target, { x: 500, y: 120 });
  assert.equal(route.corners.length, 4);
  for (const { index, point } of route.corners) {
    const edit = moveRouteCorner(route, index, {
      x: point.x + 40,
      y: point.y + 40,
    });
    const moved = connectionRoute(source, target, edit.bend, edit.targetBendX);
    assert.notDeepEqual(moved.points[index + 1], point);
    assert.deepEqual(moved.points[0], source);
    assert.deepEqual(moved.points.at(-1), target);
    assert(
      moved.points
        .slice(1)
        .every(
          (point, i) =>
            point.x === moved.points[i].x || point.y === moved.points[i].y,
        ),
    );
  }
});

test("rate cards avoid recipe rectangles on horizontal and vertical routes", () => {
  const route = connectionRoute({ x: 0, y: 100 }, { x: 1000, y: 100 }, { x: 300, y: 100 });
  assert.deepEqual(connectionLabelPosition(route, 200, 60, [route.points], [{ x: 400, y: 0, width: 220, height: 90 }]), { x: 400, y: 116 });
  const blocked = connectionLabelPosition(route, 200, 60, [route.points], [{ x: 350, y: -100, width: 300, height: 400 }]);
  assert.ok(blocked.y + 60 <= -116 || blocked.y >= 316);
  const vertical = connectionRoute({ x: 100, y: 0 }, { x: 100, y: 1000 }, { x: 100, y: 300 });
  const position = connectionLabelPosition(vertical, 200, 60, [vertical.points], [{ x: -100, y: 350, width: 400, height: 300 }]);
  assert.ok(position.x + 200 <= -116 || position.x >= 316);
});

test("rate card prefers above on a tie and switches below when an upper line blocks it", () => {
  const route = connectionRoute(
    { x: 0, y: 100 },
    { x: 1000, y: 100 },
    { x: 300, y: 100 },
  );
  assert.equal(connectionLabelPosition(route, 200, 60).y, 24);
  const upper = [
    { x: 500, y: 40 },
    { x: 800, y: 40 },
  ];
  assert.equal(
    connectionLabelPosition(route, 200, 60, [route.points, upper]).y,
    116,
  );
  const lower = [
    { x: 500, y: 160 },
    { x: 800, y: 160 },
  ];
  assert.equal(
    connectionLabelPosition(route, 200, 60, [route.points, lower]).y,
    24,
  );
  const tied = connectionLabelPosition(route, 200, 60, [
    route.points,
    upper,
    lower,
  ]);
  assert.equal(tied.y, -36);
});

test("rate card clears a vertical line and ignores distant horizontal segments", () => {
  const route = connectionRoute(
    { x: 0, y: 100 },
    { x: 1000, y: 100 },
    { x: 300, y: 100 },
  );
  const vertical = [
    { x: 500, y: -100 },
    { x: 500, y: 130 },
  ];
  assert.equal(
    connectionLabelPosition(route, 200, 60, [route.points, vertical]).y,
    146,
  );
  assert.equal(
    connectionLabelPosition(route, 200, 60, [
      route.points,
      [
        { x: -500, y: 40 },
        { x: -400, y: 40 },
      ],
    ]).y,
    24,
  );
});

test("horizontal cards stay centered over the full route, including reversed routes", () => {
  for (const [source, target] of [
    [
      { x: 0, y: 100 },
      { x: 1000, y: 100 },
    ],
    [
      { x: 1000, y: 100 },
      { x: 0, y: 100 },
    ],
  ]) {
    const route = connectionRoute(source, target, { x: 300, y: 100 }, 700);
    assert.equal(connectionLabelPosition(route, 200, 60).x, 400);
  }
});

test("vertical cards stay vertically centered and switch sides around blocking lines", () => {
  const route = connectionRoute(
    { x: 0, y: 0 },
    { x: 0, y: 1000 },
    { x: 300, y: 200 },
    300,
  );
  const position = connectionLabelPosition(route, 200, 60);
  assert.deepEqual(position, { x: 316, y: 470 });
  const blocked = connectionLabelPosition(route, 200, 60, [
    route.points,
    [
      { x: 400, y: 400 },
      { x: 400, y: 600 },
    ],
  ]);
  assert.deepEqual(blocked, { x: 84, y: 470 });
  const reversed = connectionRoute(
    { x: 0, y: 1000 },
    { x: 0, y: 0 },
    { x: 300, y: 200 },
    300,
  );
  assert.equal(connectionLabelPosition(reversed, 200, 60).y, 470);
});

test("internal segments move perpendicular to their direction and keep both ports fixed", () => {
  const source = { x: 340, y: 60 },
    target = { x: 900, y: 180 };
  const route = connectionRoute(source, target, { x: 500, y: 120 });
  const segments = draggableRouteSegments(route);
  assert.deepEqual(
    segments.map((segment) => segment.indexes),
    [[1], [2], [3]],
  );
  for (const segment of segments) {
    const edit = moveRouteSegment(route, segment, {
      x: segment.start.x + 43,
      y: segment.start.y + 63,
    });
    const moved = connectionRoute(source, target, edit.bend, edit.targetBendX);
    const index = segment.indexes[0];
    const start = moved.points[index],
      end = moved.points[index + 1];
    if (segment.vertical) {
      assert.equal(start.x, segment.start.x + 40);
      assert.equal(end.x, start.x);
      assert.equal(start.y, segment.start.y);
      assert.equal(end.y, segment.end.y);
    } else {
      assert.equal(start.y, segment.start.y + 60);
      assert.equal(end.y, start.y);
      assert.equal(start.x, segment.start.x);
      assert.equal(end.x, segment.end.x);
    }
    assert.deepEqual(moved.points[0], source);
    assert.deepEqual(moved.points.at(-1), target);
  }
});

test("straight and collapsed endpoint sections cannot be dragged", () => {
  assert.deepEqual(
    draggableRouteSegments(
      connectionRoute(
        { x: 0, y: 100 },
        { x: 1000, y: 100 },
        { x: 300, y: 100 },
      ),
    ),
    [],
  );
  const route = connectionRoute(
    { x: 0, y: 0 },
    { x: 500, y: 300 },
    { x: 0, y: 100 },
  );
  assert.deepEqual(
    draggableRouteSegments(route).map((segment) => segment.indexes),
    [[2], [3]],
  );
  const merged = connectionRoute(
    { x: 0, y: 0 },
    { x: 500, y: 300 },
    { x: 200, y: 100 },
    200,
  );
  const segments = draggableRouteSegments(merged);
  assert.equal(segments.length, 1);
  assert.deepEqual(segments[0].indexes, [1, 3]);
  const edit = moveRouteSegment(merged, segments[0], { x: 240, y: 0 });
  assert.equal(edit.bend.x, 240);
  assert.equal(edit.targetBendX, 240);
});

test("right-click bends preserve orthogonality and endpoints through repeated edits", () => {
  const source = { x: 0, y: 60 },
    target = { x: 800, y: 300 };
  let route = connectionRoute(source, target, { x: 300, y: 180 });
  for (const click of [
    { x: 120, y: 60 },
    { x: 300, y: 120 },
    { x: 780, y: 260 },
    { x: 790, y: 300 },
  ]) {
    const waypoints = insertRouteBend(route, click);
    assert.equal(waypoints.length, route.points.length + 2);
    route = connectionRoute(source, target, undefined, undefined, waypoints);
    assert.deepEqual(route.points[0], source);
    assert.deepEqual(route.points.at(-1), target);
    assert(
      route.points
        .slice(1)
        .every(
          (p, i) => p.x === route.points[i].x || p.y === route.points[i].y,
        ),
    );
  }
  for (const corner of route.corners) {
    const edit = moveRouteCorner(route, corner.index, {
      x: corner.point.x + 20,
      y: corner.point.y + 20,
    });
    const moved = connectionRoute(
      source,
      target,
      undefined,
      undefined,
      edit.waypoints,
    );
    assert(
      moved.points
        .slice(1)
        .every(
          (p, i) => p.x === moved.points[i].x || p.y === moved.points[i].y,
        ),
    );
  }
  for (const segment of draggableRouteSegments(route)) {
    const edit = moveRouteSegment(route, segment, {
      x: segment.start.x + 20,
      y: segment.start.y + 20,
    });
    const moved = connectionRoute(
      source,
      target,
      undefined,
      undefined,
      edit.waypoints,
    );
    assert(
      moved.points
        .slice(1)
        .every(
          (p, i) => p.x === moved.points[i].x || p.y === moved.points[i].y,
        ),
    );
  }
  const movedPorts = connectionRoute(
    { ...source, y: 80 },
    { ...target, y: 320 },
    undefined,
    undefined,
    route.points.slice(1, -1),
  );
  assert.equal(movedPorts.points[1].y, 80);
  assert.equal(movedPorts.points.at(-2)!.y, 320);
});

test("right-side corner edits survive diagram serialization", () => {
  const edge = {
    id: crypto.randomUUID(),
    source: crypto.randomUUID(),
    target: crypto.randomUUID(),
    sourceHandle: "output:0",
    targetHandle: "input:0",
    bend: { x: 500, y: 200 },
    targetBendX: 800,
    waypoints: [
      { x: 500, y: 60 },
      { x: 500, y: 200 },
      { x: 800, y: 200 },
      { x: 800, y: 300 },
    ],
  };
  assert.deepEqual(edgeSchema.parse(JSON.parse(JSON.stringify(edge))), edge);
  assert.equal(
    edgeSchema.parse({ ...edge, targetBendX: undefined }).targetBendX,
    undefined,
  );
});
