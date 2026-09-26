import { test } from "node:test";
import { convertSummaryRate } from "../lib/summary-rate";
import assert from "node:assert/strict";
import {
  summarizeArea,
  summaryRecipe,
  type SummaryRecipe,
} from "../lib/area-summary";
import {
  blankDiagram,
  diagramSchema,
  type Ingredient,
  type Item,
  type Recipe,
} from "../lib/model";
import { graphHistoryReducer, type GraphHistory } from "../lib/editor-history";
import type { Node, Edge } from "@xyflow/react";

const item = (id: string, kind = "item") =>
  ({
    id,
    name: id,
    kind,
    image: null,
    registryId: id,
    metadata: 0,
    tooltip: "[]",
    mod: "test",
    group: "",
  }) as Item;
const ingredient = (
  id: string,
  direction: string,
  amount: number,
): Ingredient => ({
  itemId: id,
  item: item(id),
  direction,
  amount,
  chance: 1,
  consumed: true,
  slot: 0,
  x: null,
  y: null,
  alternatives: "[]",
});
const recipe = (
  id: string,
  ingredients: Ingredient[],
  euPerTick = 30,
): Recipe => ({
  ...summaryRecipe,
  id,
  handler: "Mixer",
  euPerTick,
  durationTicks: 20,
  ingredients,
  craftingMachines: [
    { ...item("lv-mixer"), name: "LV Mixer", image: "/assets/lv.png" },
  ],
});
const card = (recipe: Recipe, machines = 1): SummaryRecipe => ({
  position: { x: 100, y: 100 },
  width: 100,
  height: 100,
  recipe,
  machines,
  variants: {},
});
const area = { position: { x: 0, y: 0 }, width: 500, height: 500 };

test("summary calculator converts both directions and handles invalid rates", () => {
  assert.equal(convertSummaryRate(1000, 250, 100), 400);
  assert.equal(convertSummaryRate(400, 100, 250), 1000);
  assert.equal(convertSummaryRate(0, 250, 100), 0);
  assert.equal(convertSummaryRate(10, 0, 100), null);
  assert.equal(convertSummaryRate(-1, 250, 100), null);
  assert.equal(convertSummaryRate(Infinity, 250, 100), null);
});

test("area totals cancel internal flows and include only remaining shortages and surpluses", () => {
  const make = card(
    recipe("make", [
      ingredient("ore", "input", 3),
      ingredient("dust", "output", 5),
    ]),
    2,
  );
  const use = card(
    recipe("use", [
      ingredient("dust", "input", 6),
      ingredient("ingot", "output", 2),
    ]),
  );
  const extra = card(recipe("extra", [ingredient("dust", "input", 3)]));
  const summary = summarizeArea(area, [make, use, extra]);
  assert.equal(summary.euPerTick, 120);
  assert.equal(summary.totalEu, 2400);
  assert.deepEqual(summary.recursiveInputIds, []);
  assert.equal(summary.machineCount, 4);
  assert.deepEqual(
    summary.inputs.map((flow) => [flow.item.id, flow.rate]),
    [["ore", 6]],
  );
  assert.deepEqual(
    summary.outputs.map((flow) => [flow.item.id, flow.rate]),
    [
      ["dust", 1],
      ["ingot", 2],
    ],
  );
  assert.equal(summary.machines[0].tier, "LV");
  assert.equal(summary.machines[0].count, 4);
  assert.equal(summary.machines[0].image, "/assets/lv.png");
  const balanced = summarizeArea(area, [
    make,
    card(recipe("use-all", [ingredient("dust", "input", 10)])),
  ]);
  assert.equal(balanced.outputs.length, 0);
  assert.deepEqual(balanced.recursiveInputIds, []);
  const shortage = summarizeArea(area, [
    make,
    card(recipe("more", [ingredient("dust", "input", 12)])),
  ]);
  assert.equal(
    shortage.inputs.find((flow) => flow.item.id === "dust")?.rate,
    2,
  );
  assert.deepEqual(shortage.recursiveInputIds, ["dust"]);
  assert.deepEqual(
    shortage.inputs.map(({ item }) => item.id),
    ["ore", "dust"],
  );
});

test("summary containment, zero machines, untimed sources, catalysts and chance outputs", () => {
  const catalyst = { ...ingredient("circuit", "input", 1), consumed: false };
  const output = { ...ingredient("dust", "output", 4), chance: 0.25 };
  const normal = card(recipe("normal", [catalyst, output]));
  const outside = { ...normal, position: { x: 450, y: 100 } };
  const source = card({
    ...recipe("source", [ingredient("dust", "output", 99)]),
    sourceItemId: "dust",
    durationTicks: 0,
  });
  const untimed = card({
    ...recipe("manual", [ingredient("dust", "input", 99)], 0),
    durationTicks: 0,
  });
  const summary = summarizeArea(area, [
    normal,
    outside,
    source,
    untimed,
    { ...normal, machines: 0 },
  ]);
  assert.equal(summary.recipeCount, 3);
  assert.equal(summary.machineCount, 2);
  assert.equal(summary.untimed, 1);
  assert.deepEqual(summary.inputs, []);
  assert.equal(summary.outputs[0].rate, 1);
});

test("total EU accounts for different cycle lengths and excludes untimed recipes", () => {
  const summary = summarizeArea(area, [
    card({ ...recipe("short", [], 30), durationTicks: 40 }, 2),
    card({ ...recipe("long", [], 120), durationTicks: 100 }, 3),
    card({ ...recipe("untimed", [], 60), durationTicks: 0 }),
    card({ ...recipe("disabled", [], 120), durationTicks: 100 }, 0),
  ]);
  assert.equal(summary.totalEu, 38400);
  assert.equal(summary.euPerTick, 480);
  assert.equal(summarizeArea(area, []).totalEu, 0);
});

test("area dimensions persist in diagrams and resize undo is one operation", () => {
  const calculation = {
    id: crypto.randomUUID(),
    inputId: "oil",
    outputId: "fuel",
    side: "input" as const,
    value: "1000",
  };
  const areaNode: Node = {
    id: crypto.randomUUID(),
    type: "summary",
    position: { x: 20, y: 40 },
    width: 640,
    height: 480,
    data: { recipe: summaryRecipe, calculators: [calculation] },
  };
  const document = diagramSchema.parse({
    ...blankDiagram(),
    areas: [
      {
        id: areaNode.id,
        position: areaNode.position,
        width: areaNode.width,
        height: areaNode.height,
        calculators: [calculation],
      },
    ],
  });
  assert.equal(document.areas?.[0].width, 640);
  assert.deepEqual(
    diagramSchema.parse(JSON.parse(JSON.stringify(document))).areas?.[0]
      .calculators,
    [calculation],
  );
  assert.equal(diagramSchema.parse(blankDiagram()).areas, undefined);
  let history: GraphHistory<Node, Edge> = {
    present: { nodes: [areaNode], edges: [] },
    past: [],
    future: [],
    group: null,
  };
  for (const width of [680, 720, 800])
    history = graphHistoryReducer(history, {
      type: "nodes",
      group: 1,
      value: (nodes) => nodes.map((node) => ({ ...node, width })),
    });
  assert.equal(history.past.length, 1);
  history = graphHistoryReducer(history, { type: "undo" });
  assert.equal(history.present.nodes[0].width, 640);
});
