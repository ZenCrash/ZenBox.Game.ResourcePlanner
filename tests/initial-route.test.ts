import { test } from "node:test";
import assert from "node:assert/strict";
import { initialRoute, type RouteObstacle } from "../lib/initial-route";

const source = { x: 100, y: 40 },
  target = { x: 500, y: 40 };
const cards: RouteObstacle[] = [
  { id: "a", x: 0, y: 0, width: 100, height: 100 },
  { id: "b", x: 500, y: 0, width: 100, height: 100 },
];
function check(
  points: { x: number; y: number }[],
  obstacles: RouteObstacle[],
  clearance: number,
) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    assert(a.x === b.x || a.y === b.y, "orthogonal segments");
    for (const box of obstacles) {
      const hit =
        a.y === b.y
          ? a.y > box.y - clearance &&
            a.y < box.y + box.height + clearance &&
            Math.max(a.x, b.x) > box.x - clearance &&
            Math.min(a.x, b.x) < box.x + box.width + clearance
          : a.x > box.x - clearance &&
            a.x < box.x + box.width + clearance &&
            Math.max(a.y, b.y) > box.y - clearance &&
            Math.min(a.y, b.y) < box.y + box.height + clearance;
      assert(!hit, "clear of expanded obstacle");
    }
  }
}
test("aligned cards connect without bends", () => {
  const path = initialRoute(source, target, "a", "b", cards)!;
  assert(path.every((p) => p.y === 40));
  check(path, cards, 40);
});
test("routes around an intervening card with two-grid clearance", () => {
  const obstacles = [
    ...cards,
    { id: "c", x: 240, y: -40, width: 100, height: 160 },
  ];
  const path = initialRoute(source, target, "a", "b", obstacles)!;
  assert(path);
  check(path, obstacles, 40);
  assert.equal(path.length, 4); // horizontal port legs plus four turns
});
test("backward connections leave to the right and enter from the left", () => {
  const path = initialRoute(
    { x: 600, y: 40 },
    { x: 0, y: 40 },
    "b",
    "a",
    cards,
  )!;
  assert(path[0].x >= 640);
  assert(path.at(-1)!.x <= -40);
  check(path, cards, 40);
});
test("tight gaps can fall back to avoiding the actual cards", () => {
  const tight = [cards[0], { id: "b", x: 140, y: 0, width: 100, height: 100 }];
  assert.equal(
    initialRoute(source, { x: 140, y: 40 }, "a", "b", tight),
    undefined,
  );
  const path = initialRoute(source, { x: 140, y: 40 }, "a", "b", tight, 0)!;
  assert(path);
  check(path, tight, 0);
});
test("does not mutate the supplied endpoint positions", () => {
  const start = { ...source },
    end = { ...target };
  initialRoute(start, end, "a", "b", cards);
  assert.deepEqual(start, source);
  assert.deepEqual(end, target);
});
