import { test } from "node:test";
import assert from "node:assert/strict";
import { perfectMachineCounts, increaseMachineCounts, stepMachineRatio, catchupMachineCounts, availableCatchup } from "../lib/perfect-ratio";

test("catchup rounds producers up and consumers down, preferring exact balances", () => {
  assert.deepEqual(catchupMachineCounts(3, 2, 1, 2), { a: 2, b: 1 });
  assert.deepEqual(catchupMachineCounts(3, 2, 2, 2), { a: 2, b: 3 });
  assert.deepEqual(catchupMachineCounts(3, 2, 1, 3), { a: 2, b: 1 });
  assert.equal(catchupMachineCounts(3, 2, 2, 3), null);
});

test("catchup respects count limits and floating-point equality", () => {
  assert.deepEqual(catchupMachineCounts(1, 5, 1, 1), { a: 5, b: null });
  assert.deepEqual(catchupMachineCounts(0.1, 0.3, 1, 1), { a: 3, b: null });
  assert.deepEqual(catchupMachineCounts(0.3, 0.1, 1, 1), { a: 1, b: 3 });
  assert.equal(catchupMachineCounts(0, 1, 1, 1), null);
  assert.equal(catchupMachineCounts(NaN, 1, 1, 1), null);
  assert.equal(catchupMachineCounts(1, 2e9, 1, 1)?.a, null);
});

test("ratio controls step through whole multiples and stop at the base ratio", () => {
  const base = { a: 2, b: 3 };
  const twice = stepMachineRatio(base, base, 1)!;
  assert.deepEqual(twice, { a: 4, b: 6 });
  const triple = stepMachineRatio(base, twice, 1)!;
  assert.deepEqual(triple, { a: 6, b: 9 });
  assert.deepEqual(stepMachineRatio(base, triple, -1), twice);
  assert.deepEqual(stepMachineRatio(base, twice, -1), base);
  assert.deepEqual(stepMachineRatio(base, base, -1), base);
});

test("adjust first balances a shortage without increasing an already sufficient consumer count", () => {
  const base = { a: 2, b: 3 };
  const balanced = stepMachineRatio(base, { a: 1, b: 3 }, 1)!;
  assert.deepEqual(balanced, base);
  assert.deepEqual(stepMachineRatio(base, balanced, 1), { a: 4, b: 6 });
  assert.deepEqual(stepMachineRatio(base, { a: 1, b: 6 }, 1), { a: 4, b: 6 });
  assert.deepEqual(stepMachineRatio(base, { a: 1, b: 4 }, 1), { a: 4, b: 6 });
  assert.deepEqual(stepMachineRatio(base, { a: 5, b: 6 }, -1), { a: 4, b: 6 });
  assert.deepEqual(stepMachineRatio({ a: 2, b: 3, c: 5 }, { a: 1, b: 3, c: 2 }, 1), { a: 2, b: 3, c: 5 });
});

test("connected-input ratio controls scale the entire group together", () => {
  const base = { a: 2, b: 3, c: 5 };
  assert.deepEqual(stepMachineRatio(base, base, 1), { a: 4, b: 6, c: 10 });
  assert.deepEqual(stepMachineRatio(base, { a: 6, b: 9, c: 15 }, -1), { a: 4, b: 6, c: 10 });
  assert.equal(stepMachineRatio(base, { a: 1e9, b: 1e9, c: 1e9 }, 1), null);
});
import { connectionColors, supplyColor } from "../lib/model";

test("pair ratios use the smallest whole machine counts", () => {
  assert.deepEqual(perfectMachineCounts("b", [{ source: "a", input: "input:0", supply: 2, demand: 3 }]), { b: 2, a: 3 });
});

test("all receiving inputs balance, including multiple suppliers on one port", () => {
  const flows = [
    { source: "a", input: "input:0", supply: 2, demand: 3 },
    { source: "c", input: "input:0", supply: 1, demand: 3 },
    { source: "d", input: "input:1", supply: 4, demand: 2 },
  ];
  const counts = perfectMachineCounts("b", flows)!;
  assert.deepEqual(counts, { b: 2, a: 2, c: 2, d: 1 });
  for (const input of new Set(flows.map((flow) => flow.input))) {
    const group = flows.filter((flow) => flow.input === input);
    const supplied: number = group.reduce((sum, flow): number => sum + flow.supply * (counts as Record<string, number>)[flow.source], 0);
    assert.equal(supplyColor(supplied, group[0].demand * counts.b), connectionColors.balanced);
  }
  assert.deepEqual(increaseMachineCounts(counts, { b: 2, a: 2, c: 7, d: 1 }, "b"), { b: 8, a: 8, c: 8, d: 4 });
});

test("increasing an already perfect ratio advances to the next multiple", () => {
  assert.deepEqual(increaseMachineCounts({ a: 3, b: 2 }, { a: 6, b: 4 }, "b"), { a: 9, b: 6 });
  assert.equal(increaseMachineCounts({ a: 3, b: 2 }, { a: 1e9, b: 1e9 }, "b"), null);
});

test("unknown timing, reusable inputs and incompatible shared suppliers cannot silently change counts", () => {
  for (const supply of [0, NaN, Infinity]) {
    assert.equal(perfectMachineCounts("b", [{ source: "a", input: "input:0", supply, demand: 3 }]), null);
  }
  assert.equal(perfectMachineCounts("b", [
    { source: "a", input: "input:0", supply: 2, demand: 3 },
    { source: "a", input: "input:1", supply: 2, demand: 4 },
  ]), null);
});


test("catchup options follow the displayed line status including combined supply", () => {
  const counts = { a: 4, b: 6 };
  assert.equal(availableCatchup(counts, "#22c55e"), null);
  assert.deepEqual(availableCatchup(counts, "#3b82f6"), { a: null, b: 6 });
  assert.deepEqual(availableCatchup(counts, "#facc15"), { a: 4, b: null });
  assert.equal(availableCatchup(counts, "#9ca3af"), null);
});
