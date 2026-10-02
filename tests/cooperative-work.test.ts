import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCooperatively, runCooperatively } from "../lib/cooperative-work";
import { blankDiagram, resolveDiagramVariants, resolveDiagramVariantsSteps } from "../lib/model";

test("cooperative mapping preserves order and yields during long work", async () => {
  let browserRan = false;
  const timer = setTimeout(() => { browserRan = true; }, 0);
  const result = await mapCooperatively([1,2,3], value => {
    const until = performance.now() + 10;
    while(performance.now() < until) { /* Simulate expensive preparation. */ }
    return value * 2;
  }, () => false);
  clearTimeout(timer);
  assert.deepEqual(result,[2,4,6]);
  assert.equal(browserRan,true);
});

test("superseded preparation stops without returning a partial diagram", async () => {
  let cancelled = false, processed = 0;
  await assert.rejects(mapCooperatively([1,2,3], value => {
    processed++; cancelled = true; return value;
  }, () => cancelled), /superseded/);
  assert.equal(processed,1);
});

test("cooperative variant validation retains synchronous results and errors", async () => {
  const document = blankDiagram();
  assert.deepEqual(await runCooperatively(resolveDiagramVariantsSteps(document, [])),resolveDiagramVariants(document, []));
  document.nodes.push({ id: 'unknown', recipeId: 'missing', position: {x:0,y:0},machines:1,variants:{} });
  await assert.rejects(runCooperatively(resolveDiagramVariantsSteps(document, [])), /Unknown recipe/);
});
