import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDirectionMarkers, animatedDirectionMarkers, animatedRoutePhases, staticDirectionDistances, directionPhase } from "../lib/line-direction";

test("new overlapping routes share positions immediately and join the current animation clock", () => {
  const a = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
  const b = [{ x: -90, y: 40 }, { x: -90, y: 0 }, { x: 500, y: 0 }];
  const overlap = (markers: { x: number; y: number }[]) => markers.filter((marker) => marker.y === 0 && marker.x > 12 && marker.x < 488).map((marker) => Math.round(marker.x * 1e6));
  assert.deepEqual(overlap(lineDirectionMarkers(a, [b])), overlap(lineDirectionMarkers(b, [a])));
  for (const elapsed of [0, 3, 19]) {
    assert.deepEqual(
      overlap(animatedDirectionMarkers(a, elapsed, directionPhase(a, [b]))),
      overlap(animatedDirectionMarkers(b, elapsed, directionPhase(b, [a]))),
    );
  }
});

test("animation starts at exactly the static positions including crossings and short routes", () => {
  for (const points of [
    [{ x: 0, y: 0 }, { x: 500, y: 0 }],
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 350 }],
  ]) {
    const others = [[{ x: 240, y: -50 }, { x: 240, y: 50 }]];
    const seeds = staticDirectionDistances(points, others);
    assert.deepEqual(animatedDirectionMarkers(points, 0, 80, seeds).map(({ opacity, ...marker }) => marker), lineDirectionMarkers(points, others));
  }
});

test("animated arrows follow output-to-input direction and synchronize overlapping segments", () => {
  const straight = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
  const early = animatedDirectionMarkers(straight, 1);
  const later = animatedDirectionMarkers(straight, 2);
  assert.equal(later[0].x - early[0].x, 24);
  assert.equal(early[0].angle, 0);
  const other = [{ x: -90, y: 40 }, { x: -90, y: 0 }, { x: 400, y: 0 }];
  const phases = animatedRoutePhases([straight, other]);
  const overlapping = animatedDirectionMarkers(other, 1, phases[1]);
  assert.deepEqual(overlapping.filter((m) => m.y === 0 && m.x >= 0).map((m) => m.x), early.filter((m) => m.x < 400).map((m) => m.x));
  assert.ok(early.every((m) => m.y === 0));
  const reversed = animatedDirectionMarkers([...straight].reverse(), 1);
  assert.ok(reversed.every((m) => m.angle === 180));
  assert.equal(animatedDirectionMarkers([...straight].reverse(), 2)[0].x - reversed[0].x, -24);
});

test("animated arrows retain 160px path spacing through corners and short segments", () => {
  const route = [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 70 }, { x: 90, y: 70 }, { x: 450, y: 70 }];
  for (const time of [0, 1, 3, 5, 9]) {
    const markers = animatedDirectionMarkers(route, time);
    const distances = markers.map((m) => m.y === 0 ? m.x : m.x === 90 ? 90 + m.y : 160 + m.x - 90);
    for (let index = 1; index < distances.length; index++) assert.equal(distances[index] - distances[index - 1], 160);
  }
});

test("arrows have generous spacing and follow the route toward its target", () => {
  assert.deepEqual(lineDirectionMarkers([{ x: 0, y: 0 }, { x: 400, y: 0 }]), [
    { x: 80, y: 0, angle: 0 }, { x: 240, y: 0, angle: 0 },
  ]);
  assert.deepEqual(lineDirectionMarkers([{ x: 100, y: 0 }, { x: 0, y: 0 }]), [{ x: 50, y: 0, angle: 180 }]);
  assert.deepEqual(lineDirectionMarkers([{ x: 0, y: 100 }, { x: 0, y: 0 }]), [{ x: 0, y: 50, angle: -90 }]);
});
test("static spacing carries the remaining distance around corners without skipping crossings", () => {
  assert.deepEqual(lineDirectionMarkers([{ x: 0, y: 0 }, { x: 30, y: 0 }]), []);
  assert.deepEqual(lineDirectionMarkers([{ x: 0, y: 0 }, { x: 100, y: 0 }], [[{ x: 50, y: -50 }, { x: 50, y: 50 }]]), [{ x: 50, y: 0, angle: 0 }]);
  assert.deepEqual(lineDirectionMarkers([{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }]), [{ x: 80, y: 0, angle: 90 }]);
  const markers = lineDirectionMarkers([{ x: 0, y: 0 }, { x: 155, y: 0 }, { x: 155, y: 250 }]);
  assert.deepEqual(markers, [{ x: 80, y: 0, angle: 0 }, { x: 155, y: 85, angle: 90 }, { x: 155, y: 245, angle: 90 }]);
  assert.equal((155 - markers[0].x) + markers[1].y, 160);
});
