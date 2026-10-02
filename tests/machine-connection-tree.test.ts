import { test } from "node:test";
import assert from "node:assert/strict";
import { machineConnectionTree } from "../lib/machine-connection-tree";
test("production tree orders branches and merges before their consumers", () => {
  const graph = machineConnectionTree(["D", "C", "B", "A"], [{source:"A",target:"B"},{source:"A",target:"C"},{source:"B",target:"D"},{source:"C",target:"D"}]);
  const row = (id:string) => graph.order.indexOf(id);
  for (const edge of graph.lines) assert(row(edge.source) < row(edge.target));
  for (const a of graph.lines) for (const b of graph.lines) if(a !== b && a.lane === b.lane) assert(Math.max(a.from,a.to) < Math.min(b.from,b.to) || Math.max(b.from,b.to) < Math.min(a.from,a.to));
});
test("recycling loops retain every row and mark returning connections", () => {
  const graph = machineConnectionTree(["E","A","B","C"], [{source:"A",target:"B"},{source:"B",target:"C"},{source:"C",target:"B"},{source:"C",target:"E"}]);
  assert.deepEqual(graph.order,["A","B","C","E"]);
  assert.equal(graph.lines.filter(e=>e.feedback).length,1);
});
test("outside connections are excluded and duplicate connections collapse", () => {
  const graph = machineConnectionTree(["A","B","C"], [{source:"A",target:"B",data:{reference:true}},{source:"A",target:"B"},{source:"Z",target:"A"}]);
  assert.equal(graph.lines.length,1);
  assert.equal(graph.lines[0].data?.reference,true);
  assert.equal(graph.order.length,3);
});


test("independent recipe copies and separate connected pairs retain their own rows", () => {
  const ids = ['original-canner', 'original-mixer', 'copied-canner', 'paired-canner', 'paired-mixer'];
  const graph = machineConnectionTree(ids, [
    {source:'original-canner',target:'original-mixer'},
    {source:'paired-canner',target:'paired-mixer'},
  ]);
  assert.deepEqual(new Set(graph.order),new Set(ids));
  assert.equal(graph.order.length,5);
  assert.equal(graph.lines.length,2);
  assert(!graph.lines.some(line=>line.source==='copied-canner'||line.target==='copied-canner'));
  assert(graph.lines.some(line=>line.source==='paired-canner'&&line.target==='paired-mixer'));
});


test("unconnected machines stay at the bottom, including alongside recycling networks", () => {
  const graph = machineConnectionTree(['isolated-first','B','isolated-middle','A','C','isolated-last'], [
    {source:'A',target:'B'}, {source:'B',target:'C'}, {source:'C',target:'A'},
  ]);
  assert.deepEqual(graph.order.slice(-3), ['isolated-first','isolated-middle','isolated-last']);
  assert(graph.lines.every(line => line.from < 3 && line.to < 3));
  assert.deepEqual(machineConnectionTree(['B','A'], []).order, ['B','A']);
});


test("separate networks remain contiguous after the main network despite interleaved recipe order", () => {
  const graph = machineConnectionTree(['pair-output','main-output','solo','main-input','pair-input','main-middle'], [
    {source:'main-input',target:'main-middle'}, {source:'main-middle',target:'main-output'},
    {source:'pair-input',target:'pair-output'},
  ]);
  assert.deepEqual(graph.order,['main-input','main-middle','main-output','pair-input','pair-output','solo']);
});

test("separate networks do not interrupt a recycling network", () => {
  const graph = machineConnectionTree(['A','X','B','Y','C'], [
    {source:'A',target:'B'}, {source:'B',target:'C'}, {source:'C',target:'A'}, {source:'X',target:'Y'},
  ]);
  assert.deepEqual(graph.order,['A','B','C','X','Y']);
});
