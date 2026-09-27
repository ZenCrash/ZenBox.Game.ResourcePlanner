import { test } from "node:test";
import assert from "node:assert/strict";
import { crossingPath } from "../lib/line-crossings";

const horizontal = [
  { x: 0, y: 50 },
  { x: 100, y: 50 },
];
const vertical = [
  { x: 50, y: 0 },
  { x: 50, y: 100 },
];

test("T junctions shade the branching arm in all four directions", () => {
  for (const direction of [-1, 1]) {
    const verticalBranch = [{ x: 50, y: 50 + direction * 40 }, { x: 50, y: 50 }, { x: 90, y: 50 }];
    assert.deepEqual(crossingPath(verticalBranch, [horizontal]).junctions, [{ x: 50, y: 50, dx: 0, dy: direction }]);
    const horizontalBranch = [{ x: 50 + direction * 40, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 90 }];
    assert.deepEqual(crossingPath(horizontalBranch, [vertical]).junctions, [{ x: 50, y: 50, dx: direction, dy: 0 }]);
    assert.deepEqual(crossingPath(horizontalBranch, []).junctions, []);
  }
});
test("crossings stay straight with vertical underpasses in both travel directions", () => {
  assert.equal(crossingPath(horizontal, [vertical]).path, "M0,50 L100,50");
  assert.equal(
    crossingPath([...horizontal].reverse(), [vertical]).path,
    "M100,50 L0,50",
  );
  assert.deepEqual(crossingPath(vertical, [horizontal]).underpasses, [
    { x: 50, y: 50 },
  ]);
});
test("shared endpoints and parallel lines do not create bridges", () => {
  assert.equal(
    crossingPath(horizontal, [
      [
        { x: 50, y: 50 },
        { x: 50, y: 100 },
      ],
    ]).path,
    "M0,50 L100,50",
  );
  assert.equal(
    crossingPath(horizontal, [
      [
        { x: 0, y: 60 },
        { x: 100, y: 60 },
      ],
    ]).path,
    "M0,50 L100,50",
  );
});
test("nearby crossings stay straight and duplicate crossings share one shadow", () => {
  const second = vertical.map((point) => ({ ...point, x: 60 }));
  assert.equal(crossingPath(horizontal, [vertical, second]).path, "M0,50 L100,50");
  assert.deepEqual(crossingPath(vertical, [horizontal, horizontal, second]).underpasses, [
    { x: 50, y: 50 },
  ]);
});

test("info routes can be excluded from T-junction shadows while retaining crossing shadows", () => {
  const branch = [{ x: 50, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 50 }];
  assert.equal(crossingPath(branch, [horizontal]).junctions.length, 1);
  // Empty eligible routes covers either an info branch or an info trunk.
  assert.deepEqual(crossingPath(branch, [horizontal], []).junctions, []);
  assert.deepEqual(crossingPath(vertical, [horizontal], []).underpasses, [{ x: 50, y: 50 }]);
  assert.equal(crossingPath(branch, [horizontal, vertical], [horizontal]).junctions.length, 1);
});
