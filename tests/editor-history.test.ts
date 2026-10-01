import { test } from "node:test";
import assert from "node:assert/strict";
import type { Node, Edge } from "@xyflow/react";
import { diagramContent } from "../lib/diagram-content";
import { blankDiagram } from "../lib/model";
import { recipeInsideGroup } from "../lib/group-selection";

test("group selection includes contained recipe cards but not partial overlaps or other groups", () => {
  const group: Node = { id: "group", type: "summary", position: { x: 100, y: 100 }, width: 640, height: 480, data: {} };
  const recipe: Node = { id: "recipe", type: "recipe", position: { x: 100, y: 100 }, measured: { width: 340, height: 240 }, data: {} };
  assert.equal(recipeInsideGroup(recipe, group), true);
  assert.equal(recipeInsideGroup({ ...recipe, position: { x: 400, y: 340 } }, group), true);
  assert.equal(recipeInsideGroup({ ...recipe, position: { x: 401, y: 340 } }, group), false);
  assert.equal(recipeInsideGroup({ ...recipe, position: { x: 99, y: 100 } }, group), false);
  assert.equal(recipeInsideGroup({ ...recipe, type: "label" }, group), false);
  assert.equal(recipeInsideGroup(group, group), false);
});

test("adding, moving, connecting and deleting a temporary card returns to saved content", () => {
  const saved = { ...blankDiagram(), nodes: [{ id: "existing", recipeId: "recipe", machines: 1, position: { x: 0, y: 0 }, variants: {} }] };
  const baseline = diagramContent(saved);
  for (const itemId of [undefined, "iron"]) {
    const added = { ...saved, nodes: [...saved.nodes, { id: "temporary", recipeId: "other", itemId, machines: 1, position: { x: 200, y: 100 }, variants: {} }],
      edges: [{ id: "connection", source: "temporary", target: "existing", sourceHandle: "output:0", targetHandle: "input:0" }] };
    assert.notEqual(diagramContent(added), baseline);
    added.nodes[1].position = { x: 400, y: 300 };
    const deleted = { ...added, nodes: added.nodes.filter(node => node.id !== "temporary"), edges: added.edges.filter(edge => edge.source !== "temporary" && edge.target !== "temporary") };
    assert.equal(diagramContent(deleted), baseline);
    assert.notEqual(diagramContent({ ...deleted, nodes: deleted.nodes.map(node => ({ ...node, machines: 2 })) }), baseline);
  }
});

test("saved-content comparison ignores camera, revision, measurements and object key order", () => {
  const saved = { ...blankDiagram(), nodes: [{ id: "a", recipeId: "recipe", machines: 1, position: { x: 0, y: 0 }, variants: { one: "a", two: "b" } }] };
  assert.equal(diagramContent(saved), diagramContent({ ...saved, revision: 4, viewport: { x: 100, y: -80, zoom: 2 }, areas: [], labels: [], nodes: [{ ...saved.nodes[0], variants: { two: "b", one: "a" }, size: { width: 360, height: 240 }, disabledPorts: [] }] }));
  assert.notEqual(diagramContent(saved), diagramContent({ ...saved, nodes: [{ ...saved.nodes[0], position: { x: 20, y: 0 } }] }));
});

test("dragging cards without manual line geometry preserves the edge list identity", () => {
  const edges: Edge[] = [{ id: "ab", source: "a", target: "b" }];
  assert.equal(moveConnectedEdges(edges, new Map([["a", { x: 20, y: 0 }]])), edges);
  assert.equal(moveConnectedEdges(edges, new Map([["a", { x: 20, y: 0 }], ["b", { x: 20, y: 0 }]])), edges);
});

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

test("drag history never serializes recipe payloads and retains one undo step", () => {
  const state = initial();
  state.present.nodes = state.present.nodes.map(node => ({ ...node, data: {
    recipe: { toJSON() { throw new Error("Recipe serialization in drag path"); } },
  } }));
  let next = state;
  for (let i = 0; i < 30; i++) next = reduce(next, {
    type: "nodeChanges", group: 1,
    changes: [{ id: "a", type: "position", position: { x: 101 + i, y: 200 }, dragging: true }],
  });
  assert.equal(next.past.length, 1);
  assert.deepEqual(reduce(next, { type: "undo" }).present, state.present);
});

test("line-card visibility changes can be undone", () => {
  const state = initial();
  const next = reduce(state, { type: "edges", group: 1, value: edges => edges.map(edge => ({ ...edge, data: { ...edge.data, showLineCard: false } })) });
  assert.equal(next.past.length, 1);
  assert.deepEqual(reduce(next, { type: "undo" }).present, state.present);
});

test("overview image positions persist, undo, paste and follow group moves while endpoint edits reset them", () => {
  const imagePosition = { x: 300, y: 180 };
  let state = reduce(initial(), {
    type: "edges",
    group: 1,
    value: (values) =>
      values.map((edge) => ({
        ...edge,
        data: { ...edge.data, imagePosition },
      })),
  });
  const placed = state.present;
  state = reduce(state, { type: "undo" });
  assert.equal(state.present.edges[0].data?.imagePosition, undefined);
  state = reduce(state, { type: "redo" });
  assert.deepEqual(state.present, placed);
  const moved = moveConnectedEdges(
    placed.edges,
    new Map([
      ["a", { x: 40, y: -20 }],
      ["b", { x: 40, y: -20 }],
    ]),
  );
  assert.deepEqual(moved[0].data?.imagePosition, { x: 340, y: 160 });
  assert.equal(
    moveConnectedEdges(placed.edges, new Map([["a", { x: 20, y: 0 }]]))[0].data
      ?.imagePosition,
    undefined,
  );
  const pasted = pasteSelection(placed, { x: 200, y: 300 }, () =>
    crypto.randomUUID(),
  );
  assert.deepEqual(pasted.edges[0].data?.imagePosition, { x: 400, y: 280 });
  const edge = edgeSchema.parse({
    id: crypto.randomUUID(),
    source: crypto.randomUUID(),
    target: crypto.randomUUID(),
    sourceHandle: "output:0",
    targetHandle: "input:0",
    imagePosition,
  });
  assert.deepEqual(edge.imagePosition, imagePosition);
});

test("queued group drag updates translate routes exactly once and undo together", () => {
  let state = initial();
  state.present.edges = edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, labelPosition: { x: 300, y: 180 } },
  }));
  const original = state.present;
  // Absolute positions from consecutive pointer events, including the repeated
  // final position on pointer-up, must use the latest reducer state.
  for (const delta of [20, 40, 80, 80]) {
    state = reduce(state, {
      type: "nodeChanges",
      group: 1,
      changes: nodes.slice(0, 2).map((node) => ({
        type: "position",
        id: node.id,
        position: { x: node.position.x + delta, y: node.position.y - delta },
      })),
    });
  }
  assert.deepEqual(state.present.edges[0].data, {
    bend: { x: 480, y: 220 },
    targetBendX: 560,
    waypoints: [
      { x: 480, y: 120 },
      { x: 480, y: 320 },
    ],
    labelPosition: { x: 380, y: 100 },
  });
  assert.equal(state.present.edges[1].data?.labelPosition, undefined);
  assert.equal(state.past.length, 1);
  const moved = state.present;
  state = reduce(state, { type: "undo" });
  assert.deepEqual(state.present, original);
  state = reduce(state, { type: "redo" });
  assert.deepEqual(state.present, moved);
  state = reduce(state, {
    type: "nodeChanges",
    group: 2,
    changes: [{ type: "remove", id: "b" }],
  });
  assert.equal(state.present.edges.length, 0);
  state = reduce(state, { type: "undo" });
  assert.deepEqual(state.present, moved);
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
  assert.ok(mergeRouteCorner(route, 1, route.points[1]));
  assert.ok(mergeRouteCorner(route, 4, route.points[6]));
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
  assert.ok(mergeRouteCorner(route, 4, { x: 100, y: 100 }));
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

test("endpoint-adjacent angles collapse to one straight line without moving ports", () => {
  const source = { x: 0, y: 0 },
    target = { x: 200, y: 40 };
  const route = connectionRoute(source, target, undefined, undefined, [
    { x: 20, y: 0 },
    { x: 20, y: 40 },
    { x: 80, y: 40 },
    { x: 80, y: 40 },
  ]);
  const merged = mergeRouteCorner(route, 1, route.points[1]);
  assert.ok(merged);
  const result = connectionRoute(source, target, undefined, undefined, merged);
  assert.deepEqual(result.points[0], source);
  assert.deepEqual(result.points.at(-1), target);
  assert(
    result.points
      .slice(1)
      .every(
        (p, i) => p.x === result.points[i].x || p.y === result.points[i].y,
      ),
  );
});

test("line card visibility overrides persist independently and survive paste", () => {
  const id = "f027ac35-2fa9-4b54-9044-4ff5bec99875";
  const saved = edgeSchema.parse({ id, source: id, target: id, sourceHandle: "output:0", targetHandle: "input:0", showLineCard: false, showOverviewCard: true });
  assert.equal(saved.showLineCard, false);
  assert.equal(saved.showOverviewCard, true);
  const graph = { nodes: [{ id, position: { x: 0, y: 0 }, data: {} }], edges: [{ ...saved, data: { showLineCard: saved.showLineCard, showOverviewCard: saved.showOverviewCard } }] };
  const pasted = pasteSelection(graph, { x: 100, y: 100 }, () => id);
  assert.deepEqual(pasted.edges[0].data, { showLineCard: false, showOverviewCard: true });
});
