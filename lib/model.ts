import { z } from "zod";
export type Item = {
  id: string;
  registryId: string;
  metadata: number;
  name: string;
  mod: string;
  group: string;
  tooltip: string;
  image: string | null;
  kind: string;
};
export type Ingredient = {
  itemId: string;
  item: Item;
  direction: string;
  amount: number;
  chance: number;
  consumed: boolean;
  slot: number;
  x: number | null;
  y: number | null;
  alternatives: string;
  alternativeItems?: Item[];
};
export type Recipe = {
  id: string;
  sourceItemId?: string;
  name: string;
  handler: string;
  durationTicks: number;
  euPerTick: number;
  layout: string;
  details: string;
  ingredients: Ingredient[];
  craftingMachines?: Item[];
};
export const nodeSchema = z.object({
  id: z.string().uuid(),
  recipeId: z.string().min(1),
  itemId: z.string().min(1).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  machines: z.number().finite().min(0).max(1e9),
  size: z
    .object({
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
    })
    .optional(),
  portRows: z
    .record(
      z.string().regex(/^(input|output):\d+$/),
      z.number().int().min(1).max(100000),
    )
    .optional(),
  variants: z
    .record(z.string().regex(/^input:\d+$/), z.string().min(1))
    .default({}),
});
export const edgeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().uuid(),
  target: z.string().uuid(),
  sourceHandle: z.string(),
  targetHandle: z.string(),
  bend: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  targetBendX: z.number().finite().optional(),
  labelPosition: z
    .object({ x: z.number().finite(), y: z.number().finite() })
    .optional(),
  waypoints: z
    .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
    .min(2)
    .max(1000)
    .optional(),
});
export const diagramSchema = z.object({
  schemaVersion: z.literal(1),
  game: z.literal("gtnh"),
  version: z.literal("2.8.4"),
  revision: z.number().int().min(0),
  nodes: z.array(nodeSchema).max(2000),
  edges: z.array(edgeSchema).max(10000),
  areas: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        width: z.number().finite().min(380).max(100000),
        height: z.number().finite().min(260).max(100000),
        calculators: z
          .array(
            z.object({
              id: z.string().uuid(),
              inputId: z.string(),
              outputId: z.string(),
              side: z.enum(["input", "output"]),
              value: z.string().max(100),
            }),
          )
          .max(100)
          .optional(),
      }),
    )
    .max(200)
    .optional(),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().min(0.05).max(5),
  }),
});
export type DiagramDocument = z.infer<typeof diagramSchema>;
export const blankDiagram = (): DiagramDocument => ({
  schemaVersion: 1,
  game: "gtnh",
  version: "2.8.4",
  revision: 0,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});
export function itemSourceRecipe(item: Item): Recipe {
  return {
    id: `item-source:${item.id}`,
    sourceItemId: item.id,
    name: item.name,
    handler: "Item source",
    durationTicks: 0,
    euPerTick: 0,
    layout: "{}",
    details: "[]",
    ingredients: [
      {
        itemId: item.id,
        item,
        direction: "output",
        amount: 1,
        chance: 1,
        consumed: true,
        slot: 0,
        x: null,
        y: null,
        alternatives: "[]",
      },
    ],
  };
}
export function hasRecipeTiming(recipe: Pick<Recipe, "durationTicks">) {
  return Number.isFinite(recipe.durationTicks) && recipe.durationTicks > 0;
}
export function recipeTabIcon(recipe: Recipe): string | null {
  try {
    const layout = JSON.parse(recipe.layout);
    if (
      typeof layout.tabIcon === "string" &&
      layout.tabIcon.startsWith("/assets/")
    )
      return layout.tabIcon;
  } catch {}
  return (
    recipe.ingredients.find((i) => i.direction === "output" && i.item.image)
      ?.item.image ??
    recipe.ingredients.find((i) => i.item.image)?.item.image ??
    null
  );
}
export function itemColor(id: string) {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
  return `hsl(${(hash >>> 0) % 360}, 70%, 65%)`;
}
type PortIdentity = Pick<Ingredient, "itemId" | "direction" | "alternatives">;
export function acceptedItemIds(input: PortIdentity): string[] {
  if (input.direction !== "input") return [input.itemId];
  try {
    const alternatives: unknown = JSON.parse(input.alternatives || "[]");
    if (Array.isArray(alternatives))
      return [
        ...new Set([
          input.itemId,
          ...alternatives.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ]),
      ];
  } catch {}
  return [input.itemId];
}
export function portsCompatible(output: PortIdentity, input: PortIdentity) {
  return (
    output.direction === "output" &&
    input.direction === "input" &&
    acceptedItemIds(input).includes(output.itemId)
  );
}

export type VariantSelection = Record<string, string>;
export function ingredientVariants(ingredient: Ingredient): Item[] {
  const items = new Map(
    [ingredient.item, ...(ingredient.alternativeItems ?? [])].map((item) => [
      item.id,
      item,
    ]),
  );
  return acceptedItemIds(ingredient).flatMap((id) =>
    items.has(id) ? [items.get(id)!] : [],
  );
}
export function cycleVariants(recipe: Recipe, frame: number): VariantSelection {
  return Object.fromEntries(
    recipe.ingredients
      .filter((i) => i.direction === "input")
      .map((i) => {
        const items = ingredientVariants(i);
        return [`input:${i.slot}`, items[frame % items.length]?.id ?? i.itemId];
      }),
  );
}
export function applyVariants(
  recipe: Recipe,
  variants: VariantSelection = {},
): Recipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => {
      const id = variants[`${ingredient.direction}:${ingredient.slot}`];
      if (!id || id === ingredient.itemId) return ingredient;
      const item = ingredientVariants(ingredient).find(
        (item) => item.id === id,
      );
      if (!item) throw new Error(`Unsupported recipe variant: ${id}`);
      return {
        ...ingredient,
        itemId: id,
        item,
        alternatives: JSON.stringify(acceptedItemIds(ingredient)),
      };
    }),
  };
}
/** Validate locked choices and reconcile inputs with their actual connected output.
 * One input cannot simultaneously consume two different concrete variants. */
export function resolveDiagramVariants(
  document: DiagramDocument,
  recipes: Recipe[],
): DiagramDocument {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const nodes = document.nodes.map((node) => ({
    ...node,
    variants: { ...node.variants },
  }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const recipe = recipeMap.get(node.recipeId);
    if (!recipe) throw new Error("Unknown recipe");
    if (recipe.sourceItemId !== node.itemId)
      throw new Error("Invalid item source");
    for (const [handle, id] of Object.entries(node.variants)) {
      const input = port(recipe, handle);
      if (
        !input ||
        input.direction !== "input" ||
        !acceptedItemIds(input).includes(id)
      )
        throw new Error("Unsupported recipe variant");
    }
  }
  const supplied = new Map<string, string>();
  for (const edge of document.edges) {
    const source = nodeMap.get(edge.source),
      target = nodeMap.get(edge.target);
    const output =
      source && port(recipeMap.get(source.recipeId)!, edge.sourceHandle);
    const input =
      target && port(recipeMap.get(target.recipeId)!, edge.targetHandle);
    if (
      !source ||
      !target ||
      source === target ||
      !output ||
      !input ||
      !portsCompatible(output, input)
    )
      throw new Error("Connections must join compatible outputs and inputs");
    const key = `${target.id}/${edge.targetHandle}`;
    if (supplied.has(key) && supplied.get(key) !== output.itemId)
      throw new Error(
        "An input cannot be connected to different item variants",
      );
    supplied.set(key, output.itemId);
    target.variants[edge.targetHandle] = output.itemId;
  }
  return { ...document, nodes };
}

/** Color accepted substitutions together within a diagram. This is a visual
 * grouping only: connection validation always checks the receiving slot itself.
 * Sharing a broad Ore Dictionary group must not relax an exact-item recipe. */
export function createPortColorResolver(
  recipes: Pick<Recipe, "ingredients">[],
) {
  const parents = new Map<string, string>();
  const root = (id: string) => {
    let current = id;
    while (parents.has(current) && parents.get(current) !== current)
      current = parents.get(current)!;
    let next = id;
    while (parents.has(next) && parents.get(next) !== current) {
      const previous = parents.get(next)!;
      parents.set(next, current);
      next = previous;
    }
    return current;
  };
  for (const recipe of recipes)
    for (const ingredient of recipe.ingredients) {
      for (const id of acceptedItemIds(ingredient)) {
        const a = root(ingredient.itemId),
          b = root(id);
        if (a !== b) parents.set(a < b ? b : a, a < b ? a : b);
      }
    }
  return (itemId: string) => itemColor(root(itemId));
}
export function rate(ingredient: Ingredient, recipe: Recipe, machines = 1) {
  return recipe.durationTicks > 0 && ingredient.consumed
    ? ((ingredient.amount *
        (ingredient.direction === "output" ? ingredient.chance : 1) *
        20) /
        recipe.durationTicks) *
        machines
    : 0;
}
export const connectionColors = {
  unrated: "#9ca3af",
  shortage: "#ef4444",
  balanced: "#22c55e",
  surplus: "#3b82f6",
};
export function connectionColor(
  output: Ingredient,
  producer: Recipe,
  producerMachines: number,
  input: Ingredient,
  consumer: Recipe,
  consumerMachines: number,
) {
  if (!hasRecipeTiming(producer) || !hasRecipeTiming(consumer))
    return connectionColors.unrated;
  const supplied = rate(output, producer, producerMachines);
  const needed = rate(input, consumer, consumerMachines);
  return supplyColor(supplied, needed);
}
export function supplyColor(supplied: number, needed: number) {
  if (!Number.isFinite(supplied) || !Number.isFinite(needed))
    return connectionColors.unrated;
  // Ignore floating-point arithmetic noise, without rounding small flows to zero.
  const tolerance =
    Number.EPSILON * 16 * Math.max(Math.abs(supplied), Math.abs(needed));
  if (Math.abs(supplied - needed) <= tolerance)
    return connectionColors.balanced;
  return supplied < needed
    ? connectionColors.shortage
    : connectionColors.surplus;
}
export function ratio(
  output: Ingredient,
  producer: Recipe,
  input: Ingredient,
  consumer: Recipe,
) {
  const a = rate(output, producer),
    b = rate(input, consumer);
  if (!a || !b) return "Unrated";
  const value = b / a;
  for (let denominator = 1; denominator <= 1000; denominator++) {
    const numerator = Math.round(value * denominator);
    if (numerator > 0 && Math.abs(numerator / denominator - value) < 1e-8)
      return `${numerator} : ${denominator}`;
  }
  return `${Number(value.toFixed(3))} : 1`;
}
export function hasIngredientPort(ingredient: Ingredient) {
  return !(
    ingredient.direction === "input" &&
    ingredient.item.registryId === "gregtech:gt.integrated_circuit"
  );
}
export function port(recipe: Recipe, handle: string | null | undefined) {
  return recipe.ingredients.find((i) => `${i.direction}:${i.slot}` === handle);
}
