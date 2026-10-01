import { test } from "node:test";
import assert from "node:assert/strict";
import { plannerPositions } from "../lib/planner-columns";
const chain = [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 2, target: 3 }, { source: 3, target: 4 }];
test("D to F to G to C places F above A and G above B", () => {
  const links = [...chain, { source: 3, target: 5 }, { source: 5, target: 6 }, { source: 6, target: 2 }];
  const positions = plannerPositions(7, links, new Set([5, 6]));
  for (let i = 0; i < 5; i++) assert.deepEqual(positions.get(i), { column: i, row: 0 });
  assert.deepEqual(positions.get(5), { column: 0, row: -1 });
  assert.deepEqual(positions.get(6), { column: 1, row: -1 });
  assert.equal(links.length, 7);
});
test("separate recovery branches have separate upper rows and align before their consumers", () => {
  const positions = plannerPositions(8, [...chain, { source: 3, target: 5 }, { source: 5, target: 6 }, { source: 6, target: 2 }, { source: 4, target: 7 }, { source: 7, target: 1 }], new Set([5, 6, 7]));
  assert.deepEqual(positions.get(7), { column: 0, row: -2 });
  assert.equal(new Set([...positions.values()].map(p => p.column + ':' + p.row)).size, 8);
});
test("ordinary production branches retain their columns and separate rows", () => {
  const positions = plannerPositions(4, [{ source: 0, target: 2 }, { source: 1, target: 2 }, { source: 2, target: 3 }], new Set());
  assert.deepEqual([...positions.values()], [{ column: 0, row: 0 }, { column: 0, row: 1 }, { column: 1, row: 0 }, { column: 2, row: 0 }]);
});
