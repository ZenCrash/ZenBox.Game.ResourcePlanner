import { connectionColors, fluidReferenceCompatible, hasRecipeTiming, rate, supplyColor, type Ingredient, type Recipe } from "./model";

/** Compare both ends in liters without treating this reference as actual supply. */
export function fluidReferenceFlow(output: Ingredient, producer: Recipe, producerMachines: number, input: Ingredient, consumer: Recipe, consumerMachines: number) {
  const fluid = output.item.kind === "fluid" ? output.item : input.item;
  const container = output.item.kind === "fluid" ? input.item : output.item;
  const liters = container.fluidContents?.find((content) => content.fluidId === fluid.id)?.liters;
  if (!fluidReferenceCompatible(output, input) || !liters || !Number.isFinite(liters) || liters <= 0)
    return { color: connectionColors.unrated, liters: undefined, supplied: undefined, needed: undefined };
  const supplied = hasRecipeTiming(producer) && output.consumed
    ? rate(output, producer, producerMachines) * (output.item.kind === "fluid" ? 1 : liters) : undefined;
  const needed = hasRecipeTiming(consumer) && input.consumed
    ? rate(input, consumer, consumerMachines) * (input.item.kind === "fluid" ? 1 : liters) : undefined;
  return { liters, supplied, needed, color: supplyColor(supplied ?? NaN, needed ?? NaN) };
}

// Ratio groups must use the receiving slot's units, including when real and
// informational suppliers share a container input.
export function fluidReferenceInputRates(output: Ingredient, producer: Recipe, input: Ingredient, consumer: Recipe) {
  const flow = fluidReferenceFlow(output, producer, 1, input, consumer, 1);
  const divisor = input.item.kind === "fluid" ? 1 : flow.liters;
  return {
    supply: divisor && flow.supplied !== undefined ? flow.supplied / divisor : NaN,
    demand: divisor && flow.needed !== undefined ? flow.needed / divisor : NaN,
  };
}
