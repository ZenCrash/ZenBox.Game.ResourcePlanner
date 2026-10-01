import assert from "node:assert/strict";
import test from "node:test";
import { BatchCache } from "../lib/batch-cache";

test("progress counts unique completed entries including cached reads", async () => {
  const cache = new BatchCache(async ids => ids.map(id => ({ id })));
  await cache.get(["a"]);
  const progress: number[][] = [];
  await cache.get(["a", "b", "b"], (done, total) => progress.push([done, total]));
  assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2]]);
  const empty: number[][] = [];
  await cache.get([], (done, total) => empty.push([done, total]));
  assert.deepEqual(empty, [[0, 0]]);
});

test("overlapping diagrams reuse cached and pending items", async () => {
  const calls: string[][] = [];
  const cache = new BatchCache(async ids => { calls.push(ids); return ids.map(id => ({ id })); });
  const first = cache.get(["a", "b", "a"]);
  const second = cache.get(["b", "c"]);
  assert.deepEqual(await first, [{ id: "a" }, { id: "b" }]);
  assert.deepEqual(await second, [{ id: "b" }, { id: "c" }]);
  await cache.get(["c", "a"]);
  assert.deepEqual(calls, [["a", "b"], ["c"]]);
});

test("batches run concurrently within the limit", async () => {
  const releases: (() => void)[] = [];
  let running = 0, peak = 0;
  const cache = new BatchCache(async ids => {
    peak = Math.max(peak, ++running);
    await new Promise<void>(resolve => releases.push(resolve));
    running--;
    return ids.map(id => ({ id }));
  }, 20, 300000, 2, 2);
  const result = cache.get(["a", "b", "c", "d", "e"]);
  assert.equal(releases.length, 2);
  releases.splice(0).forEach(release => release());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases.length, 1);
  releases[0]();
  assert.equal((await result).length, 5);
  assert.equal(peak, 2);
});

test("failed and missing reads retry; expired and evicted values refresh", async () => {
  let calls = 0;
  const cache = new BatchCache(async ids => {
    calls++;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) return [];
    return ids.map(id => ({ id }));
  }, 1);
  await assert.rejects(cache.get(["a"]), /offline/);
  assert.deepEqual(await cache.get(["a"]), []);
  assert.deepEqual(await cache.get(["a"]), [{ id: "a" }]);
  await cache.get(["b"]);
  await cache.get(["a"]);
  assert.equal(calls, 5);
  const expired = new BatchCache(async ids => { calls++; return ids.map(id => ({ id })); }, 1, 0);
  await expired.get(["a"]);
  await expired.get(["a"]);
  assert.equal(calls, 7);
});
