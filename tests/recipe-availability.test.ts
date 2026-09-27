import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/recipes/route";
import { catalog } from "../lib/db";

test("empty recipe and usage lookups report no availability", async () => {
  for (const mode of ["recipes", "uses"]) {
    const url = `http://localhost/api/recipes?item=nonexistent-test-item&mode=${mode}`;
    assert.deepEqual(await (await GET(new Request(url))).json(), []);
    assert.deepEqual(await (await GET(new Request(`${url}&availability=1`))).json(), { exists: false });
  }
});

test("enabled recipe ingredients report availability in the matching direction", async () => {
  for (const [direction, mode] of [["input", "uses"], ["output", "recipes"]]) {
    const ingredient = await catalog.ingredient.findFirst({ where: { direction, recipe: { enabled: true } } });
    assert.ok(ingredient, "Installed catalog must contain recipe ingredients");
    const response = await GET(new Request(`http://localhost/api/recipes?item=${encodeURIComponent(ingredient.itemId)}&mode=${mode}&availability=1`));
    assert.deepEqual(await response.json(), { exists: true });
  }
});
