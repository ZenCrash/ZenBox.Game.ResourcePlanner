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
