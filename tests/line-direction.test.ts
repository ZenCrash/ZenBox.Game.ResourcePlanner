import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDirectionMarkers, animatedDirectionMarkers, ARROW_SPACING } from "../lib/line-direction";

test("static arrows use the x+y world lattice, including negative coordinates", () => {
  assert.deepEqual(lineDirectionMarkers([{ x: 2, y: 0 }, { x: 2, y: 400 }]), [
    { x: 2, y: 158, angle: 90 }, { x: 2, y: 318, angle: 90 },
  ]);
  for (const marker of lineDirectionMarkers([{ x: -322, y: -500 }, { x: -322, y: 500 }]))
    assert.equal(Math.abs((marker.x + marker.y) % ARROW_SPACING), 0);
});
test("independent overlapping routes align immediately at every animation time", () => {
  const routes = [
    [{ x: 0, y: 20 }, { x: 900, y: 20 }],
    [{ x: -90, y: 40 }, { x: -90, y: 20 }, { x: 900, y: 20 }],
    [{ x: 150, y: -200 }, { x: 150, y: 20 }, { x: 900, y: 20 }],
  ];
  for (const time of [0, 1, 3, 19, 12345]) {
    const shared = routes.map(points => animatedDirectionMarkers(points, time).filter(m => m.y === 20 && m.x > 170 && m.x < 880).map(m => m.x));
    assert(shared[0].length > 0);
    assert.deepEqual(shared[0], shared[1]); assert.deepEqual(shared[0], shared[2]);
  }
});
test("animation starts at static positions and moves toward the target in all four directions", () => {
  for (const [start, end, axis, sign] of [
    [{ x: 0, y: 2 }, { x: 700, y: 2 }, "x", 1],
    [{ x: 700, y: 2 }, { x: 0, y: 2 }, "x", -1],
    [{ x: 2, y: 0 }, { x: 2, y: 700 }, "y", 1],
    [{ x: 2, y: 700 }, { x: 2, y: 0 }, "y", -1],
  ] as const) {
    const points = [start, end];
    assert.deepEqual(animatedDirectionMarkers(points, 0).map(({ opacity, ...m }) => m), lineDirectionMarkers(points));
    const early = animatedDirectionMarkers(points, 1), later = animatedDirectionMarkers(points, 1.1);
    assert(Math.abs(later[0][axis] - early[0][axis] - sign * 2.4) < 1e-8);
    assert(early.every(m => m.opacity >= 0 && m.opacity <= 1));
  }
});
test("reverse turns keep world alignment rather than route-distance spacing", () => {
  const points = [{ x: 5, y: 25 }, { x: 245, y: 25 }, { x: 245, y: -500 }, { x: -600, y: -500 }];
  for (const marker of lineDirectionMarkers(points)) assert.equal(Math.abs((marker.x + marker.y) % ARROW_SPACING), 0);
  const shared = lineDirectionMarkers([{ x: 245, y: -50 }, { x: 245, y: -500 }]);
  assert.deepEqual(lineDirectionMarkers(points).filter(m => m.x === 245 && m.y < -50 && m.y > -500), shared);
});
test("reversing a segment shares static positions and degenerate routes stay empty", () => {
  const points = [{ x: 2, y: -400 }, { x: 2, y: 400 }];
  const coordinates = (p: typeof points) => lineDirectionMarkers(p).map(m => m.y).sort((a,b) => a-b);
  assert.deepEqual(coordinates(points), coordinates([...points].reverse()));
  assert.deepEqual(animatedDirectionMarkers([], 0), []);
  assert.deepEqual(animatedDirectionMarkers([{x:0,y:0},{x:0,y:0}], 0), []);
});
