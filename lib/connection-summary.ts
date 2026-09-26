import {
  hasRecipeTiming,
  rate,
  ratio,
  type Ingredient,
  type Recipe,
} from "./model";

export function connectionSummary(
  output: Ingredient,
  producer: Recipe,
  producerMachines: number,
  input: Ingredient,
  consumer: Recipe,
  consumerMachines: number,
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
        : `${Number(rate(ingredient, recipe, machines).toFixed(2))} ${ingredient.item.kind === "fluid" ? "mB" : "items"}/s`;
  return {
    item: output.item.name.replace(/§[0-9a-fk-or]/gi, ""),
    ratio: ratio(output, producer, input, consumer),
    from: rateText(output, producer, producerMachines),
    target: rateText(input, consumer, consumerMachines),
  };
}
