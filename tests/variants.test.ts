import { test } from "node:test";
import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import path from "node:path";
import {
  applyVariants,
  blankDiagram,
  cycleVariants,
  ingredientVariants,
  diagramSchema,
  resolveDiagramVariants,
  itemSourceRecipe,
  hasRecipeTiming,
  connectionColor,
  connectionColors,
  type Item,
  type Ingredient,
  type Recipe,
} from "../lib/model";
import { readDiagram, writeDiagram } from "../lib/storage";
const a = { id: "a", name: "Wood A", image: "/a.png" } as Item;
const b = { id: "b", name: "Wood B", image: "/b.png" } as Item;
const input = {
  itemId: "a",
  item: a,
  direction: "input",
  slot: 0,
  alternatives: '["b"]',
  alternativeItems: [a, b],
  amount: 2,
} as Ingredient;
const consumer = { id: "consumer", ingredients: [input] } as Recipe;
test("blood orbs cycle by LP capacity, including the Eldritch orb", () => {
  const weak = { ...a, id: "weak", name: "Weak Blood Orb", tooltip: '["Capacity: 5,000 LP"]' };
  const apprentice = { ...a, id: "apprentice", name: "Apprentice Blood Orb", tooltip: '["Capacity: 25,000 LP"]' };
  const eldritch = { ...a, id: "eldritch", name: "Eldritch Blood Orb", registryId: "ForbiddenMagic:EldritchOrb", tooltip: "[]" };
  const armok = { ...a, id: "armok", name: "Blood Orb of Armok", tooltip: '["Capacity: 1,000,000,000 LP"]' };
  const orbs = [armok, apprentice, eldritch, weak];
  const recipe = { ...consumer, ingredients: [{ ...input, item: armok, itemId: armok.id, alternatives: JSON.stringify(orbs.map(i => i.id)), alternativeItems: orbs }] };
  const order = ["weak", "apprentice", "eldritch", "armok"];
  assert.deepEqual(ingredientVariants(recipe.ingredients[0]).map(i => i.id), order);
  for (let frame = 0; frame <= order.length; frame++)
    assert.equal(cycleVariants(recipe, frame)["input:0"], order[frame % order.length]);
});
test("cycling follows the fixed accepted-item order and wraps", () => {
  const reversed = { ...consumer, ingredients: [{ ...input, itemId: b.id, item: b, alternatives: '["b","a"]', alternativeItems: [b, a] }] };
  const order = ingredientVariants(reversed.ingredients[0]).map(item => item.id);
  assert.deepEqual(order, ["a", "b"]);
  for (let frame = 0; frame < 5; frame++) {
    const displayed = applyVariants(reversed, cycleVariants(reversed, frame)).ingredients[0];
    assert.equal(displayed.itemId, order[frame % order.length]);
    assert.deepEqual(ingredientVariants(displayed).map(item => item.id), order);
  }
});
const producer = {
  id: "producer",
  ingredients: [{ ...input, itemId: "b", item: b, direction: "output" }],
} as Recipe;
function fixture() {
  const source = crypto.randomUUID(),
    target = crypto.randomUUID();
  return diagramSchema.parse({
    ...blankDiagram(),
    nodes: [
      {
        id: source,
        recipeId: producer.id,
        machines: 1,
        position: { x: 0, y: 0 },
      },
      {
        id: target,
        recipeId: consumer.id,
        machines: 1,
        position: { x: 100, y: 0 },
        variants: { "input:0": "a" },
      },
    ],
    edges: [
      {
        id: crypto.randomUUID(),
        source,
        target,
        sourceHandle: "output:0",
        targetHandle: "input:0",
      },
    ],
  });
}
test("cycling chooses real variant images and a captured frame stays locked", () => {
  assert.equal(cycleVariants(consumer, 0)["input:0"], "a");
  const selected = cycleVariants(consumer, 1);
  assert.equal(selected["input:0"], "b");
  assert.equal(cycleVariants(consumer, 2)["input:0"], "a");
  assert.equal(
    applyVariants(consumer, selected).ingredients[0].item.image,
    "/b.png",
  );
  assert.equal(consumer.ingredients[0].itemId, "a");
});
test("connecting a permitted output switches the locked input and rejects unsupported choices", () => {
  const doc = fixture();
  const resolved = resolveDiagramVariants(doc, [producer, consumer]);
  assert.equal(resolved.nodes[1].variants["input:0"], "b");
  assert.equal(doc.nodes[1].variants["input:0"], "a");
  doc.nodes[1].variants["input:0"] = "invalid";
  assert.throws(
    () => resolveDiagramVariants(doc, [producer, consumer]),
    /Unsupported/,
  );
  assert.throws(
    () => applyVariants(consumer, { "input:0": "invalid" }),
    /Unsupported/,
  );
});
test("one input cannot simultaneously receive different variants", () => {
  const doc = fixture();
  const another = {
    ...producer,
    id: "another",
    ingredients: [{ ...producer.ingredients[0], itemId: "a", item: a }],
  };
  const id = crypto.randomUUID();
  doc.nodes.push({ ...doc.nodes[0], id, recipeId: another.id });
  doc.edges.push({ ...doc.edges[0], id: crypto.randomUUID(), source: id });
  assert.throws(
    () => resolveDiagramVariants(doc, [producer, consumer, another]),
    /different item variants/,
  );
});
test("locked variants survive diagram JSON file save and reload", async () => {
  const id = crypto.randomUUID();
  const resolved = resolveDiagramVariants(fixture(), [producer, consumer]);
  try {
    await writeDiagram(id, resolved);
    const loaded = await readDiagram(id);
    assert.equal(loaded.nodes[1].variants["input:0"], "b");
    assert.equal(
      applyVariants(consumer, loaded.nodes[1].variants).ingredients[0].item
        .name,
      "Wood B",
    );
  } finally {
    await unlink(path.resolve("data/diagrams", `${id}.json`)).catch(() => {});
  }
});

test("item sources connect to accepted variants without inventing recipe timing", () => {
  const source = itemSourceRecipe(b);
  const doc = fixture();
  doc.nodes[0].recipeId = source.id;
  doc.nodes[0].itemId = b.id;
  const resolved = resolveDiagramVariants(doc, [source, consumer]);
  assert.equal(resolved.nodes[1].variants["input:0"], "b");
  assert.equal(source.ingredients.length, 1);
  assert.equal(source.ingredients[0].direction, "output");
  assert.equal(hasRecipeTiming(source), false);
  assert.equal(
    connectionColor(source.ingredients[0], source, 1, input, consumer, 1),
    connectionColors.unrated,
  );
  doc.nodes[0].itemId = "unknown";
  assert.throws(
    () => resolveDiagramVariants(doc, [source, consumer]),
    /Invalid item source/,
  );
});

test("item cards and adjusted line bends survive diagram save and reload", async () => {
  const id = crypto.randomUUID();
  const source = itemSourceRecipe(b);
  const doc = fixture();
  doc.nodes[0].recipeId = source.id;
  doc.nodes[0].itemId = b.id;
  doc.edges[0].bend = { x: 200, y: 120 };
  try {
    await writeDiagram(id, resolveDiagramVariants(doc, [source, consumer]));
    const loaded = await readDiagram(id);
    assert.equal(loaded.nodes[0].itemId, b.id);
    assert.deepEqual(loaded.edges[0].bend, { x: 200, y: 120 });
  } finally {
    await unlink(path.resolve("data/diagrams", `${id}.json`)).catch(() => {});
  }
});
