import { after, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/auto-planner/route";
import { catalog } from "../lib/db";
import type { PlannerResult } from "../lib/auto-planner";
import {
  fluidLookupAmounts,
  emptyFluidContainers,
} from "../lib/fluid-containers";
import { plannerRecipes } from "../lib/planner-catalog";
const request = (body: unknown) =>
  new Request("http://localhost/api/auto-planner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const options = {
  targetId: "minecraft:cobblestone",
  inputId: "minecraft:stone",
  priority: "eu",
  allowMultiblocks: false,
  maxTier: 1,
  maxSteps: 1,
  maxSuggestions: 3,
};
after(() => catalog.$disconnect());
test("batched candidate loading preserves global ranking for a large output family", async () => {
  const [large] = await catalog.$queryRaw<
    { itemId: string; matches: number }[]
  >`SELECT itemId, COUNT(DISTINCT recipeId) AS matches FROM Ingredient WHERE direction = 'output' GROUP BY itemId ORDER BY matches DESC LIMIT 1`;
  assert(Number(large.matches) > 1000);
  const expected = await catalog.$queryRaw<
    { id: string }[]
  >`SELECT DISTINCT Recipe.id FROM Ingredient JOIN Recipe ON Recipe.id = Ingredient.recipeId WHERE Ingredient.itemId = ${large.itemId} AND Ingredient.direction = 'output' AND Recipe.enabled = 1 ORDER BY Recipe.euPerTick ASC, Recipe.durationTicks ASC, Recipe.id ASC LIMIT 200`;
  const loaded = await plannerRecipes(large.itemId);
  assert.equal(loaded.capped, true);
  assert.deepEqual(
    loaded.recipes.map((recipe) => recipe.id),
    expected.map((recipe) => recipe.id),
  );
});
test("oil cell to diesel cell searches do not exceed SQLite parameter limits", async () => {
  const diesel = await catalog.item.findFirstOrThrow({
    where: { name: "Diesel Cell" },
  });
  const response = await POST(
    request({
      ...options,
      inputId: "gregtech:gt.metaitem.01:30707",
      targetId: diesel.id,
      maxSteps: 10,
      maxSuggestions: 10,
    }),
  );
  assert.equal(response.status, 200);
  const result: PlannerResult = await response.json();
  assert(Array.isArray(result.plans));
  assert(Number.isFinite(result.examined));
  const targetForms = await fluidLookupAmounts(diesel.id);
  const packaging = await emptyFluidContainers(Object.keys(targetForms));
  for (const plan of result.plans) {
    assert(
      plan.steps.some(
        (step) => !["Fluid Canner", "Bottler"].includes(step.recipe.handler),
      ),
    );
    assert(
      !plan.supplies.some((supply) =>
        Object.hasOwn(targetForms, supply.item.id),
      ),
    );
    assert(
      plan.links.every(
        (link) =>
          !packaging.includes(
            plan.steps[link.source].recipe.ingredients.find(
              (i) => i.direction === "output" && i.slot === link.sourceSlot,
            )!.itemId,
          ),
      ),
    );
  }
});
test("light fuel lookup includes filled cells with real capacity in either direction", async () => {
  const fluid = await catalog.item.findFirstOrThrow({
    where: { name: "Light Fuel", kind: "fluid" },
  });
  const amounts = await fluidLookupAmounts(fluid.id);
  const cellId = Object.keys(amounts).find(
    (id) => id.startsWith("gregtech:") && amounts[id] === 0.001,
  );
  assert(cellId, JSON.stringify(amounts));
  const cellAmounts = await fluidLookupAmounts(cellId);
  assert.equal(cellAmounts[fluid.id], 1000);
  assert.equal(cellAmounts[cellId], 1);
  const result: PlannerResult = await (
    await POST(
      request({
        ...options,
        inputId: undefined,
        targetId: fluid.id,
        maxTier: 14,
        allowMultiblocks: true,
        maxSuggestions: 100,
      }),
    )
  ).json();
  assert(
    result.plans.some((plan) =>
      plan.steps
        .at(-1)!
        .recipe.ingredients.some(
          (i) => i.direction === "output" && i.itemId === cellId,
        ),
    ),
  );
  assert(
    result.plans.some((plan) =>
      plan.steps
        .at(-1)!
        .recipe.ingredients.some(
          (i) => i.direction === "output" && i.itemId === fluid.id,
        ),
    ),
  );
  assert.deepEqual(await fluidLookupAmounts("minecraft:stone"), {
    "minecraft:stone": 1,
  });
  for (const targetId of [fluid.id, cellId]) {
    const response = await POST(request({ ...options, inputId: undefined, targetId, exactTarget: true,
      maxTier: 14, allowMultiblocks: true, maxSuggestions: 100 }));
    assert.equal(response.status, 200);
    const exact: PlannerResult = await response.json();
    assert(exact.plans.length > 0);
    for (const plan of exact.plans) {
      const step = plan.steps[0];
      assert.equal(step.recipe.ingredients.find(i => i.direction === "output" && i.slot === step.outputSlot)?.itemId, targetId);
    }
  }
});
test("planner filter choices include actual catalog machines and recipe handlers", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert(
    data.machines.some(
      (item: { id: string }) => item.id === "etfuturum:blast_furnace",
    ),
  );
  assert(data.recipeTypes.includes("Forge Hammer"));
  assert.equal(
    new Set(data.machines.map((item: { id: string }) => item.id)).size,
    data.machines.length,
  );
});
test("planner validates limits and source requirements", async () => {
  assert.equal(
    (await POST(request({ ...options, maxSteps: 101 }))).status,
    400,
  );
  assert.equal(
    (await POST(request({ ...options, priority: "yield", inputId: undefined })))
      .status,
    400,
  );
  assert.equal(
    (await POST(request({ ...options, inputId: options.targetId }))).status,
    400,
  );
});
test("planner searches the installed catalog with hydrated machine choices", async () => {
  const response = await POST(request(options));
  assert.equal(response.status, 200);
  const result: PlannerResult = await response.json();
  assert(result.plans.length > 0);
  assert(result.plans.length <= 3);
  for (const plan of result.plans) {
    assert.equal(plan.steps.length, 1);
    assert(
      plan.steps[0].recipe.ingredients.some(
        (i) => i.itemId === "minecraft:cobblestone" && i.direction === "output",
      ),
    );
    assert(Number.isFinite(plan.totalEu));
  }
});
test("planner finds a multistep cobblestone-to-glass route", async () => {
  const response = await POST(
    request({
      ...options,
      targetId: "minecraft:glass",
      inputId: "minecraft:cobblestone",
      maxSteps: 4,
      maxTier: 3,
    }),
  );
  const result: PlannerResult = await response.json();
  assert(
    result.plans.some((plan) => plan.steps.length > 1),
    JSON.stringify({
      count: result.plans.length,
      examined: result.examined,
      limited: result.limited,
    }),
  );
});
