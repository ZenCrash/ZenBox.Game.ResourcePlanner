import {
  hasRecipeTiming,
  rate,
  ratio,
  type Ingredient,
  type Recipe,
} from "./model";

export function isSupplyLimited(ingredient: Ingredient, recipe: Recipe, utilization: number) {
  return ingredient.consumed && hasRecipeTiming(recipe) && utilization < 1 - 1e-9;
}

export function connectionSummary(
  output: Ingredient,
  producer: Recipe,
  producerMachines: number,
  input: Ingredient,
  consumer: Recipe,
  consumerMachines: number,
  producerUtilization = 1,
  consumerUtilization = 1,
) {
  const rateText = (
    ingredient: Ingredient,
    recipe: Recipe,
    machines: number,
  ) =>
    !ingredient.consumed
      ? "Reusable"
      : !hasRecipeTiming(recipe)
        ? "Unspecified"
        : `${rate(ingredient, recipe, machines).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${ingredient.item.kind === "fluid" ? "mB" : "items"}/s`;
  return {
    item: output.item.name.replace(/§[0-9a-fk-or]/gi, ""),
    ratio: ratio(output, producer, input, consumer),
    from: rateText(output, producer, producerMachines * producerUtilization),
    target: rateText(input, consumer, consumerMachines * consumerUtilization),
    ...(isSupplyLimited(output, producer, producerUtilization) || isSupplyLimited(input, consumer, consumerUtilization)
      ? { fullSupply: { from: rateText(output, producer, producerMachines), target: rateText(input, consumer, consumerMachines) } }
      : {}),
  };
}
