import test from "node:test";
import assert from "node:assert/strict";
import { readCatalogBatch, type CatalogStorage } from "../lib/persistent-catalog";
import { RouteSpatialIndex } from "../lib/route-spatial-index";
import { crossingPath } from "../lib/line-crossings";
import { outsideViewport } from "../lib/viewport-visibility";
import { GraphGeometry } from "../lib/graph-geometry";
import type { ReactFlowState } from "@xyflow/react";

test("persistent catalog reuses entries and rejects another catalog revision", async () => {
  const entries = new Map<string, { revision: string; value: { id: string } }>();
  const storage: CatalogStorage = {
    async get<T extends { id: string }>(kind: string, revision: string, ids: string[]) {
      return ids.flatMap(id => { const entry = entries.get(`${kind}:${id}`); return entry?.revision === revision ? [entry.value as T] : []; });
    },
    async put(kind, revision, values) { values.forEach(value => entries.set(`${kind}:${value.id}`, { revision, value })); },
  };
  const calls: string[][] = [];
  const read = async (ids: string[]) => { calls.push(ids); return ids.map(id => ({ id })); };
  await readCatalogBatch("recipes", "v1", ["a", "b"], read, storage);
  assert.deepEqual(await readCatalogBatch("recipes", "v1", ["b", "a", "c"], read, storage), [{ id: "b" }, { id: "a" }, { id: "c" }]);
  await readCatalogBatch("recipes", "v2", ["a"], read, storage);
  await readCatalogBatch("items", "v2", ["a"], read, storage);
  assert.deepEqual(calls, [["a", "b"], ["c"], ["a"], ["a"]]);
});

test("unavailable browser storage and quota failures fall back to the API", async () => {
  const storage: CatalogStorage = { get: async () => { throw new Error("blocked"); }, put: async () => { throw new Error("quota"); } };
  assert.deepEqual(await readCatalogBatch("items", "v1", ["a"], async ids => ids.map(id => ({ id })), storage), [{ id: "a" }]);
  await assert.rejects(readCatalogBatch("items", "v1", ["a"], async () => { throw new Error("network"); }, storage), /network/);
});

test("indexed crossing candidates preserve brute-force crossings and T junctions", () => {
  const routes = Array.from({ length: 80 }, (_, i) => [
    { x: (i % 8) * 100 - 300, y: Math.floor(i / 8) * 100 - 400 },
    { x: (i % 8) * 100 + 150, y: Math.floor(i / 8) * 100 - 400 },
    { x: (i % 8) * 100 + 150, y: Math.floor(i / 8) * 100 - 50 },
  ]);
  const index = new RouteSpatialIndex(128);
  routes.forEach((route, i) => index.set(String(i), route));
  routes.forEach((route, i) => {
    const all = routes.filter((_, j) => j !== i);
    const nearby = index.query(route).map(Number).filter(j => j !== i).sort((a, b) => a - b).map(j => routes[j]);
    assert.deepEqual(crossingPath(route, nearby), crossingPath(route, all));
  });
  index.set("far", [{ x: -1e8, y: 0 }, { x: 1e8, y: 0 }]);
  assert.ok(index.query([{ x: 0, y: -1 }, { x: 0, y: 1 }]).includes("far"));
  index.remove("far");
  assert.ok(!index.query([{ x: 0, y: -1 }, { x: 0, y: 1 }]).includes("far"));
});

test("offscreen checks retain cards in the preload margin and unmeasured cards", () => {
  assert.equal(outsideViewport({ x: 1100, y: 100, width: 300, height: 200 }, [0, 0, 1], 1000, 800), false);
  assert.equal(outsideViewport({ x: 1600, y: 100, width: 300, height: 200 }, [0, 0, 1], 1000, 800), true);
  assert.equal(outsideViewport({ x: 1600, y: 100, width: 300, height: 200 }, [-800, 0, 1], 1000, 800), false);
  assert.equal(outsideViewport({ x: 10000, y: 10000, width: 0, height: 0 }, [0, 0, 1], 1000, 800), false);
});

test("moving one endpoint only recomputes its connected route", () => {
  const internal = (id: string, x: number) => ({ id, measured: { width: 100, height: 100 }, internals: {
    positionAbsolute: { x, y: 0 }, handleBounds: { source: [{ id: "out", x: 100, y: 50, width: 12, height: 12 }], target: [{ id: "in", x: 0, y: 50, width: 12, height: 12 }] },
  } });
  const state = { nodes: [], edges: [{ id: "ab", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }, { id: "cd", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }], nodeLookup: new Map([internal("a", 0), internal("b", 400), internal("c", 2000), internal("d", 2400)].map(node => [node.id, node])) } as unknown as ReactFlowState;
  const scene = new GraphGeometry();
  scene.update(state);
  const ab = scene.records.get("ab")!.points, cd = scene.records.get("cd")!.points;
  const updated = { ...state, nodeLookup: new Map(state.nodeLookup) };
  updated.nodeLookup.set("a", internal("a", 50) as never);
  scene.update(updated);
  assert.notEqual(scene.records.get("ab")!.points, ab);
  assert.equal(scene.records.get("cd")!.points, cd);
  scene.update({ ...updated, edges: [updated.edges[1]] });
  assert.equal(scene.records.has("ab"), false);
});

test("unrelated lines keep their render dependencies during dragging, then refresh placement on release", () => {
  const internal = (id: string, x: number) => ({ id, measured: { width: 100, height: 100 }, internals: {
    positionAbsolute: { x, y: 0 }, handleBounds: { source: [{ id: "out", x: 100, y: 50, width: 12, height: 12 }], target: [{ id: "in", x: 0, y: 50, width: 12, height: 12 }] },
  } });
  const state = { nodes: [{ id: "a", dragging: true }], edges: [{ id: "ab", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" }, { id: "cd", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" }], nodeLookup: new Map([internal("a", 0), internal("b", 400), internal("c", 2000), internal("d", 2400)].map(node => [node.id, node])) } as unknown as ReactFlowState;
  const scene = new GraphGeometry();
  scene.update(state);
  const before = scene.dependencies("cd", false, true, true);
  const connected = scene.dependencies("ab", false, true, true);
  const updated = { ...state, nodes: [...state.nodes], nodeLookup: new Map(state.nodeLookup) };
  updated.nodeLookup.set("a", internal("a", 40) as never);
  scene.update(updated);
  assert.deepEqual(scene.dependencies("cd", false, true, true), before);
  assert.notDeepEqual(scene.dependencies("ab", false, true, true), connected);
  scene.update({ ...updated, nodes: updated.nodes.map(node => ({ ...node, dragging: false })) });
  assert.notDeepEqual(scene.dependencies("cd", false, true, true), before);
  assert.equal(scene.moving, false);
});


test("arrow synchronization refreshes when overlapping lines are added, moved, hidden or removed", () => {
  const internal = (id: string, x: number) => ({ id, measured: { width: 100, height: 100 }, internals: {
    positionAbsolute: { x, y: 0 }, handleBounds: { source: [{ id: "out", x: 100, y: 50, width: 12, height: 12 }], target: [{ id: "in", x: 0, y: 50, width: 12, height: 12 }] },
  } });
  const edge = (id: string, source: string, target: string) => ({ id, source, target, sourceHandle: "out", targetHandle: "in" });
  let state = { nodes: [], edges: [edge('a','a0','a1')], nodeLookup: new Map([internal('a0',0),internal('a1',800),internal('b0',50),internal('b1',800)].map(n=>[n.id,n])) } as unknown as ReactFlowState;
  const scene = new GraphGeometry(); scene.update(state);
  assert.equal(scene.arrowPhase('a'),80);
  state={...state,edges:[...state.edges,edge('b','b0','b1')]};scene.update(state);
  assert.equal(scene.arrowPhase('b'),30);
  state={...state,nodeLookup:new Map(state.nodeLookup)};
  state.nodeLookup.set('b0',internal('b0',70) as never);scene.update(state);
  assert.equal(scene.arrowPhase('b'),10);
  state={...state,edges:state.edges.map(e=>e.id==='a'?{...e,hidden:true}:e)};scene.update(state);
  assert.equal(scene.arrowPhase('b'),80);
  state={...state,edges:state.edges.filter(e=>e.id==='b')};scene.update(state);
  assert.equal(scene.arrowPhase('b'),80);
});
