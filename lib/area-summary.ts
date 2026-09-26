import {
  applyVariants,
  hasRecipeTiming,
  rate,
  recipeTabIcon,
  type Item,
  type Recipe,
  type VariantSelection,
} from "./model";
import { recipePowerInfo } from "./recipe-power";

export type SummaryBounds = {
  position: { x: number; y: number };
  width: number;
  height: number;
};
export type SummaryRecipe = SummaryBounds & {
  recipe: Recipe;
  machines: number;
  variants: VariantSelection;
};
export function summarizeArea(area: SummaryBounds, recipes: SummaryRecipe[]) {
  const inside = recipes.filter(
    (node) =>
      !node.recipe.sourceItemId &&
      node.position.x >= area.position.x &&
      node.position.y >= area.position.y &&
      node.position.x + node.width <= area.position.x + area.width &&
      node.position.y + node.height <= area.position.y + area.height,
  );
  const machines = new Map<
    string,
    { name: string; tier: string; image: string | null; count: number }
  >();
  const flows = new Map<
    string,
    { item: Item; input: number; output: number }
  >();
  let euPerTick = 0,
    totalEu = 0,
    machineCount = 0,
    untimed = 0;
  for (const node of inside) {
    const recipe = applyVariants(node.recipe, node.variants);
    euPerTick += Math.max(0, recipe.euPerTick) * node.machines;
    machineCount += node.machines;
    const tier =
      recipePowerInfo(recipe).voltage?.match(/\(([^)]+)\)/)?.[1] ??
      (recipe.euPerTick > 0 ? "Unknown tier" : "Non-EU");
    const key = `${recipe.handler}/${tier}`;
    const machine = machines.get(key) ?? {
      name: recipe.handler,
      tier,
      image:
        recipe.craftingMachines?.find((item) =>
          new RegExp(`\\b${tier}\\b`, "i").test(item.name),
        )?.image ??
        recipe.craftingMachines?.[0]?.image ??
        recipeTabIcon(recipe),
      count: 0,
    };
    machine.count += node.machines;
    machines.set(key, machine);
    if (!hasRecipeTiming(recipe)) {
      if (node.machines > 0) untimed++;
      continue;
    }
    totalEu +=
      Math.max(0, recipe.euPerTick) * recipe.durationTicks * node.machines;
    for (const ingredient of recipe.ingredients) {
      if (!ingredient.consumed) continue;
      const amount = rate(ingredient, recipe, node.machines);
      if (!Number.isFinite(amount)) continue;
      const flow = flows.get(ingredient.itemId) ?? {
        item: ingredient.item,
        input: 0,
        output: 0,
      };
      if (ingredient.direction === "input") flow.input += amount;
      else flow.output += amount;
      flows.set(ingredient.itemId, flow);
    }
  }
  const inputs: { item: Item; rate: number }[] = [],
    outputs: { item: Item; rate: number }[] = [];
  for (const flow of flows.values()) {
    const net = flow.output - flow.input;
    const tolerance = Number.EPSILON * 16 * Math.max(flow.input, flow.output);
    if (Math.abs(net) <= tolerance) continue;
    (net < 0 ? inputs : outputs).push({ item: flow.item, rate: Math.abs(net) });
  }
  const recursiveInputIds = inputs
    .filter(({ item }) => (flows.get(item.id)?.output ?? 0) > 0)
    .map(({ item }) => item.id);
  inputs.sort(
    (a, b) =>
      Number(recursiveInputIds.includes(a.item.id)) -
        Number(recursiveInputIds.includes(b.item.id)) ||
      a.item.name.localeCompare(b.item.name),
  );
  outputs.sort((a, b) => a.item.name.localeCompare(b.item.name));
  return {
    recipeCount: inside.length,
    euPerTick,
    totalEu,
    machineCount,
    machines: [...machines.values()].filter((m) => m.count > 0),
    inputs,
    recursiveInputIds,
    outputs,
    untimed,
  };
}
export type AreaSummary = ReturnType<typeof summarizeArea>;
export const summaryRecipe: Recipe = {
  id: "summary-area",
  name: "Area summary",
  handler: "Area summary",
  durationTicks: 0,
  euPerTick: 0,
  layout: "{}",
  details: "[]",
  ingredients: [],
};
