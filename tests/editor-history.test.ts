import { test } from "node:test";
import assert from "node:assert/strict";
import type { Node, Edge } from "@xyflow/react";
import {
  graphHistoryReducer as reduce,
  type GraphHistory,
} from "../lib/editor-history";
import { copySelection, pasteSelection } from "../lib/editor-clipboard";
import {
  connectionRoute,
  mergeRouteCorner,
  moveRouteCorner,
  draggableRouteSegments,
  moveRouteSegment,
} from "../lib/diagram-geometry";
import { supplyColor, connectionColors } from "../lib/model";
import { edgeSchema } from "../lib/model";
import {
  selectionArea,
  cardInSelection,
  routeInSelection,
  moveConnectedEdges,
} from "../lib/canvas-interactions";

const nodes: Node[] = [
  { id: "a", position: { x: 100, y: 200 }, data: {}, selected: true },
  { id: "b", position: { x: 500, y: 400 }, data: {}, selected: true },
  { id: "c", position: { x: 900, y: 400 }, data: {} },
];
const edges: Edge[] = [
  {
    id: "ab",
    source: "a",
    target: "b",
    data: {
      bend: { x: 400, y: 300 },
      targetBendX: 480,
      waypoints: [
        { x: 400, y: 200 },
        { x: 400, y: 400 },
      ],
    },
  },
  { id: "bc", source: "b", target: "c" },
];
const initial = (): GraphHistory<Node, Edge> => ({
  present: { nodes, edges },
  past: [],
  future: [],
  group: null,
});

test("a drag is one undo step and deletion restores nodes and connected edges together", () => {
  let state = initial();
  for (const x of [120, 140, 160])
    state = reduce(state, {
      type: "nodes",
      value: (ns) =>
        ns.map((n) =>
          n.id === "a" ? { ...n, position: { ...n.position, x } } : n,
        ),
      group: 1,
    });
  assert.equal(state.past.length, 1);
  state = reduce(state, { type: "undo" });
  assert.equal(state.present.nodes[0].position.x, 100);
  state = reduce(state, { type: "redo" });
  assert.equal(state.present.nodes[0].position.x, 160);
  state = reduce(state, {
    type: "nodes",
    value: (ns) => ns.filter((n) => n.id !== "a"),
    group: 2,
  });
  state = reduce(state, {
    type: "edges",
    value: (es) => es.filter((e) => e.source !== "a"),
    group: 2,
  });
  state = reduce(state, { type: "undo" });
  assert.equal(state.present.nodes.length, 3);
  assert.equal(state.present.edges.length, 2);
});

test("selection and measurements do not consume history; edits after undo discard redo", () => {
  let state = reduce(initial(), {
    type: "nodes",
    value: (ns) =>
      ns.map((n) => ({
        ...n,
        selected: false,
        measured: { width: 340, height: 240 },
      })),
    group: 1,
  });
  assert.equal(state.past.length, 0);
  state = reduce(state, { type: "nodes", value: [], group: 2 });
  state = reduce(state, { type: "undo" });
  state = reduce(state, { type: "edges", value: [], group: 3 });
  assert.equal(state.future.length, 0);
  state = reduce(state, { type: "reset" });
  assert.equal(state.past.length, 0);
  assert.equal(state.present.edges.length, 0);
});

test("copy/paste preserves relative layout and remaps only internal connections", () => {
  const copied = copySelection({ nodes, edges });
  let id = 0;
  const pasted = pasteSelection(copied, { x: -40, y: 60 }, () => `new-${id++}`);
  assert.equal(pasted.nodes.length, 2);
  assert.equal(pasted.edges.length, 1);
  assert.deepEqual(
    pasted.nodes.map((n) => n.position),
    [
      { x: -40, y: 60 },
      { x: 360, y: 260 },
    ],
  );
  assert.equal(pasted.edges[0].source, pasted.nodes[0].id);
  assert.equal(pasted.edges[0].target, pasted.nodes[1].id);
  assert.deepEqual(pasted.edges[0].data?.bend, { x: 260, y: 160 });
  assert.equal(pasted.edges[0].data?.targetBendX, 340);
  assert.deepEqual(pasted.edges[0].data?.waypoints, [
    { x: 260, y: 60 },
    { x: 260, y: 260 },
  ]);
  assert.deepEqual(nodes[0].position, { x: 100, y: 200 });
  assert.equal(
    copySelection({
      nodes: nodes.map((n) => ({ ...n, selected: false })),
      edges: [{ ...edges[0], selected: true }],
    }).nodes.length,
    2,
  );
});

test("dropping corners with a shared neighbor removes their detour but protects endpoint corners", () => {
  const route = connectionRoute(
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    undefined,
    undefined,
    [
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 80 },
      { x: 100, y: 80 },
      { x: 100, y: 100 },
    ],
  );
  const merged = mergeRouteCorner(route, 1, route.points[4]);
  assert.ok(merged);
  assert.equal(merged.length, 4);
  const result = connectionRoute(
    route.points[0],
    route.points.at(-1)!,
    undefined,
    undefined,
    merged,
  );
  result.points
    .slice(1)
    .forEach((p, i) =>
      assert.ok(p.x === result.points[i].x || p.y === result.points[i].y),
    );
  assert.equal(mergeRouteCorner(route, 0, route.points[3]), null);
  assert.equal(mergeRouteCorner(route, 3, route.points[6]), null);
  assert.equal(mergeRouteCorner(route, 1, route.points[5]), null);
  assert.deepEqual(mergeRouteCorner(route, 3, route.points[2]), [
    route.points[1],
    route.points[2],
    { x: 100, y: 40 },
    route.points[6],
  ]);
});

test("directly connected corners merge in either direction without leaving duplicate angles", () => {
  const route = connectionRoute(
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    undefined,
    undefined,
    [
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 80 },
      { x: 100, y: 80 },
      { x: 100, y: 100 },
    ],
  );
  const check = (points: { x: number; y: number }[]) => {
    assert.deepEqual(points[0], route.points[0]);
    assert.deepEqual(points.at(-1), route.points.at(-1));
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      assert.ok(point.x === previous.x || point.y === previous.y);
    });
  };
  for (const [from, to] of [
    [1, 2],
    [2, 1],
    [2, 3],
    [3, 2],
  ]) {
    const merged = mergeRouteCorner(route, from, route.points[to + 1]);
    assert.ok(merged);
    assert.equal(merged.length, 4);
    const result = connectionRoute(
      route.points[0],
      route.points.at(-1)!,
      undefined,
      undefined,
      merged,
    );
    check(result.points);
    assert.equal(result.corners.length, route.corners.length - 2);
    assert.equal(
      new Set(result.points.map((p) => `${p.x},${p.y}`)).size,
      result.points.length,
    );
    for (const corner of result.corners) {
      const moved = moveRouteCorner(result, corner.index, {
        x: corner.point.x + 20,
        y: corner.point.y + 20,
      });
      check(
        connectionRoute(
          result.points[0],
          result.points.at(-1)!,
          undefined,
          undefined,
          moved.waypoints,
        ).points,
      );
    }
    for (const segment of draggableRouteSegments(result)) {
      const moved = moveRouteSegment(result, segment, {
        x: segment.start.x + 20,
        y: segment.start.y + 20,
      });
      check(
        connectionRoute(
          result.points[0],
          result.points.at(-1)!,
          undefined,
          undefined,
          moved.waypoints,
        ).points,
      );
    }
  }
  assert.equal(mergeRouteCorner(route, 0, route.points[2]), null);
  assert.equal(mergeRouteCorner(route, 1, route.points[1]), null);
  assert.equal(mergeRouteCorner(route, 4, route.points[6]), null);
  assert.equal(mergeRouteCorner(route, 5, route.points[5]), null);
});

test("combined input supply uses the balanced and surplus colors with rounding tolerance", () => {
  assert.equal(supplyColor(0.1 + 0.2, 0.3), connectionColors.balanced);
  assert.equal(supplyColor(0.2 + 0.2, 0.3), connectionColors.surplus);
  assert.equal(supplyColor(0.1 + 0.1, 0.3), connectionColors.shortage);
  assert.equal(supplyColor(NaN, 0.3), connectionColors.unrated);
});

test("off-grid neighboring corners merge near the drop without creating diagonal segments", () => {
  const route = connectionRoute(
    { x: 0, y: 0 },
    { x: 200, y: 100 },
    undefined,
    undefined,
    [
      { x: 20, y: 0 },
      { x: 20, y: 43.5 },
      { x: 63.25, y: 43.5 },
      { x: 63.25, y: 83.5 },
      { x: 100, y: 83.5 },
      { x: 100, y: 100 },
    ],
  );
  for (const [from, to] of [
    [1, 2],
    [2, 1],
    [2, 3],
    [3, 2],
    [1, 3],
  ]) {
    const target = route.points[to + 1];
    for (const drop of [
      target,
      { x: Math.round(target.x / 20) * 20, y: Math.round(target.y / 20) * 20 },
    ]) {
      const merged = mergeRouteCorner(route, from, drop);
      assert.ok(merged);
      assert.equal(merged.length, 4);
      const result = connectionRoute(
        route.points[0],
        route.points.at(-1)!,
        undefined,
        undefined,
        merged,
      );
      result.points.slice(1).forEach((p, i) => {
        const previous = result.points[i];
        assert.ok(
          p.x === previous.x || p.y === previous.y,
          "merged segments stay orthogonal at the exact off-grid coordinate",
        );
        assert.notDeepEqual(p, previous);
      });
      assert.deepEqual(result.points[0], route.points[0]);
      assert.deepEqual(result.points.at(-1), route.points.at(-1));
    }
  }
  assert.equal(mergeRouteCorner(route, 1, { x: 76, y: 43.5 }), null);
  assert.equal(mergeRouteCorner(route, 0, { x: 20, y: 43.5 }), null);
  assert.equal(mergeRouteCorner(route, 4, { x: 100, y: 100 }), null);
});

test("area selection requires more than a quarter of a card and the whole line", () => {
  const card = { left: 0, top: 0, right: 100, bottom: 100 };
  const area = selectionArea({ x: 50, y: 50 }, { x: 0, y: 0 });
  assert.deepEqual(area, { left: 0, top: 0, right: 50, bottom: 50 });
  assert.equal(cardInSelection(card, area), false);
  assert.equal(cardInSelection(card, { ...area, right: 51 }), true);
  assert.equal(cardInSelection(card, { ...area, right: 49 }), false);
  assert.equal(cardInSelection(card, card), true);
  assert.equal(
    cardInSelection(card, { left: 100, top: 0, right: 200, bottom: 100 }),
    false,
  );
  assert.equal(cardInSelection({ ...card, right: 0 }, card), false);
  assert.equal(
    routeInSelection(
      [
        { x: 0, y: 20 },
        { x: 50, y: 20 },
      ],
      area,
    ),
    true,
  );
  assert.equal(
    routeInSelection(
      [
        { x: -1, y: 20 },
        { x: 50, y: 20 },
      ],
      area,
    ),
    false,
  );
  assert.equal(
    routeInSelection(
      [
        { x: 10, y: 10 },
        { x: 60, y: 10 },
        { x: 60, y: 30 },
        { x: 30, y: 30 },
      ],
      area,
    ),
    false,
  );
  assert.equal(routeInSelection([], area), false);
});
test("manual line cards follow group moves and reset for a single endpoint move", () => {
  const line: Edge = {
    ...edges[0],
    data: { ...edges[0].data, labelPosition: { x: 300, y: 180 } },
  };
  const group = moveConnectedEdges(
    [line],
    new Map([
      ["a", { x: 40, y: -20 }],
      ["b", { x: 40, y: -20 }],
    ]),
  )[0];
  assert.deepEqual(group.data?.labelPosition, { x: 340, y: 160 });
  assert.deepEqual(group.data?.bend, { x: 440, y: 280 });
  assert.equal(group.data?.targetBendX, 520);
  assert.deepEqual(group.data?.waypoints, [
    { x: 440, y: 180 },
    { x: 440, y: 380 },
  ]);
  const single = moveConnectedEdges(
    [line],
    new Map([["a", { x: 40, y: -20 }]]),
  )[0];
  assert.equal(single.data?.labelPosition, undefined);
  assert.deepEqual(single.data?.bend, line.data?.bend);
  assert.equal(
    moveConnectedEdges([line], new Map([["c", { x: 40, y: 0 }]]))[0],
    line,
  );
  const divergent = moveConnectedEdges(
    [line],
    new Map([
      ["a", { x: 20, y: 0 }],
      ["b", { x: 40, y: 0 }],
    ]),
  )[0];
  assert.equal(divergent.data?.labelPosition, undefined);
});

test("manual card placement survives undo, paste and diagram serialization", () => {
  let state = initial();
  state = reduce(state, {
    type: "edges",
    group: 9,
    value: (es) =>
      es.map((e) => ({
        ...e,
        data: { ...e.data, labelPosition: { x: 300, y: 180 } },
      })),
  });
  assert.equal(state.past.length, 1);
  state = reduce(state, { type: "undo" });
  assert.equal(state.present.edges[0].data?.labelPosition, undefined);
  state = reduce(state, { type: "redo" });
  assert.deepEqual(state.present.edges[0].data?.labelPosition, {
    x: 300,
    y: 180,
  });
  const pasted = pasteSelection(
    copySelection(state.present),
    { x: 0, y: 0 },
    () => crypto.randomUUID(),
  );
  assert.deepEqual(pasted.edges[0].data?.labelPosition, { x: 200, y: -20 });
  const edge = {
    id: crypto.randomUUID(),
    source: crypto.randomUUID(),
    target: crypto.randomUUID(),
    sourceHandle: "output:0",
    targetHandle: "input:0",
    labelPosition: { x: 300, y: 180 },
  };
  assert.deepEqual(
    edgeSchema.parse(JSON.parse(JSON.stringify(edge))).labelPosition,
    edge.labelPosition,
  );
});
