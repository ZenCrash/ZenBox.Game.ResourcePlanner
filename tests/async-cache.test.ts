import assert from "node:assert/strict";
import test from "node:test";
import { AsyncCache } from "../lib/async-cache";

test("concurrent page reads share a request and failed reads can retry", async () => {
  const cache = new AsyncCache<number>(2);
  let calls = 0;
  const read = async () => ++calls;
  assert.deepEqual(
    await Promise.all([cache.get("page", read), cache.get("page", read)]),
    [1, 1],
  );
  await assert.rejects(
    cache.get("failed", async () => {
      throw new Error("offline");
    }),
  );
  assert.equal(await cache.get("failed", read), 2);
});

test("cache evicts least recently used pages and expires stale data", async () => {
  const cache = new AsyncCache<number>(2);
  await cache.get("a", async () => 1);
  await cache.get("b", async () => 2);
  await cache.get("a", async () => 99);
  await cache.get("c", async () => 3);
  assert.equal(await cache.get("a", async () => 99), 1);
  assert.equal(await cache.get("b", async () => 4), 4);
  const expired = new AsyncCache<number>(2, 0);
  await expired.get("a", async () => 1);
  assert.equal(await expired.get("a", async () => 2), 2);
});
