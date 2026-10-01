import { test } from "node:test";
import assert from "node:assert/strict";
import { networkMachineCounts, connectedMachines, type NetworkFlow } from "../lib/network-ratio";

test("network ratios balance upstream, downstream, shared inputs and branches together", () => {
  const flows: NetworkFlow[] = [
    { source: "a", target: "b", input: "0", supply: 2, demand: 3 },
    { source: "b", target: "c", input: "0", supply: 4, demand: 5 },
    { source: "a", target: "d", input: "0", supply: 2, demand: 7 },
  ];
  const counts = networkMachineCounts(flows)!;
  assert.ok(counts);
  for (const f of flows) assert.equal(f.supply * counts[f.source], f.demand * counts[f.target]);
  const joined: NetworkFlow[] = [
    { source: "a", target: "c", input: "0", supply: 2, demand: 5 },
    { source: "b", target: "c", input: "0", supply: 3, demand: 5 },
    { source: "b", target: "d", input: "0", supply: 3, demand: 1 },
  ];
  const combined = networkMachineCounts(joined)!;
  assert.ok(combined);
  assert.equal(2 * combined.a + 3 * combined.b, 5 * combined.c);
  assert.equal(3 * combined.b, combined.d);
});

test("network ratio rejects contradictory cycles and unsupported rates without partial counts", () => {
  const flows = [{ source: "a", target: "b", input: "0", supply: 2, demand: 1 }, { source: "b", target: "a", input: "0", supply: 1, demand: 2 }];
  assert.deepEqual(networkMachineCounts(flows), { a: 1, b: 2 });
  assert.equal(networkMachineCounts([flows[0], { ...flows[1], demand: 3 }]), null);
  assert.equal(networkMachineCounts([{ ...flows[0], supply: NaN }]), null);
  assert.equal(networkMachineCounts([]), null);
  assert.equal(networkMachineCounts([{ ...flows[0], demand: 4e9 }]), null);
});

test("network traversal includes branches at either end but excludes info-only neighbors", () => {
  const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "d", target: "a" }, { source: "x", target: "d", data: { reference: true } }];
  assert.deepEqual([...connectedMachines("b", edges)].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual([...connectedMachines("x", edges, true)].sort(), ["a", "b", "c", "d", "x"]);
});

test("network controls increase and decrease every machine in ratio units", () => {
  const base = networkMachineCounts([
    { source: "a", target: "b", input: "0", supply: 3, demand: 2 },
    { source: "b", target: "c", input: "0", supply: 4, demand: 3 },
  ])!;
  const twice = stepMachineRatio(base, base, 1)!;
  const three = stepMachineRatio(base, twice, 1)!;
  for (const id in base) { assert.equal(twice[id], base[id] * 2); assert.equal(three[id], base[id] * 3); }
  assert.deepEqual(stepMachineRatio(base, three, -1), twice);
  assert.deepEqual(stepMachineRatio(base, twice, -1), base);
  assert.deepEqual(stepMachineRatio(base, base, -1), Object.fromEntries(Object.keys(base).map(id => [id, 1])));
});
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

test("ratio controls step through whole multiples and reset below the base ratio", () => {
  const base = { a: 2, b: 3 };
  const twice = stepMachineRatio(base, base, 1)!;
  assert.deepEqual(twice, { a: 4, b: 6 });
  const triple = stepMachineRatio(base, twice, 1)!;
  assert.deepEqual(triple, { a: 6, b: 9 });
  assert.deepEqual(stepMachineRatio(base, triple, -1), twice);
  assert.deepEqual(stepMachineRatio(base, twice, -1), base);
  assert.deepEqual(stepMachineRatio(base, base, -1), Object.fromEntries(Object.keys(base).map(id => [id, 1])));
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


test("fixed scale amounts support decimals, multiple pins and incompatible constraints", () => {
  const flows = [{ source: "a", target: "b", input: "0", supply: 2, demand: 3 }, { source: "b", target: "c", input: "0", supply: 4, demand: 5 }];
  assert.deepEqual(networkMachineCounts(flows, { b: 2.5 }), { a: 3.75, b: 2.5, c: 2 });
  assert.deepEqual(networkMachineCounts(flows, { a: 3.75, c: 2 }), { a: 3.75, b: 2.5, c: 2 });
  assert.equal(networkMachineCounts(flows, { a: 3, c: 2 }), null);
  assert.deepEqual(networkMachineCounts([], { a: 0.25 }), { a: 0.25 });
  assert.equal(networkMachineCounts(flows, { a: 0 }), null);
});


test("decreasing without a lower perfect ratio resets only the affected machines", () => {
  assert.deepEqual(stepMachineRatio({ a: 2, b: 3 }, { a: 1, b: 2, other: 9 }, -1), { a: 1, b: 1 });
  assert.deepEqual(stepMachineRatio(null, { a: 8, b: 4, c: 2 }, -1), { a: 1, b: 1, c: 1 });
  assert.equal(stepMachineRatio(null, { a: 8, b: 4 }, 1), null);
  assert.deepEqual(stepMachineRatio({ a: 1, b: 1 }, { a: 1, b: 1 }, -1), { a: 1, b: 1 });
});

import { machineAmountRatio } from "../lib/perfect-ratio";
test("selected machine count ratios simplify normal and fractional amounts", () => {
  assert.equal(machineAmountRatio(100, 50), "2 : 1");
  assert.equal(machineAmountRatio(2.5, 3.75), "2 : 3");
  assert.equal(machineAmountRatio(0, 4), "0 : 1");
  assert.equal(machineAmountRatio(0, 0), "0 : 0");
});

test("selected count ratios support three or more machines and zero entries", () => {
  assert.equal(machineAmountRatio(10, 20, 30), "1 : 2 : 3");
  assert.equal(machineAmountRatio(2.5, 3.75, 5), "2 : 3 : 4");
  assert.equal(machineAmountRatio(0, 4, 6), "0 : 2 : 3");
});
