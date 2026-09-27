import type { Recipe } from "./model";
import { smeltingRuntime } from "./smelting-runtime";
import {
  selectedMachine,
  machineTier,
  machineTiers,
  machineVoltage,
  machineOptions,
} from "./machine-selection";

/** Derive runtime values without changing the catalog recipe saved by the diagram. */
export function overclockRecipe(recipe: Recipe, machineId?: string): Recipe {
  recipe = recipeMachineBaseline(recipe, machineId);
  if (recipe.euPerTick <= 0 || recipe.durationTicks <= 0) return recipe;
  const machine = selectedMachine(recipe, machineId);
  if (!machine) return recipe;
  const tier = machineTier(machine);
  const voltage = machineVoltage(machine);
  // Untiered multiblocks need energy-hatch configuration; their controller alone
  // cannot determine how much power is available.
  if (!tier || voltage === undefined) return recipe;
  const requiredTier = Math.max(
    1,
    Math.ceil(Math.log(recipe.euPerTick / 8) / Math.log(4)),
  );
  const tierLimit = Math.max(1, machineTiers.indexOf(tier)) - requiredTier;
  const powerLimit = Math.floor(
    Math.log(voltage / Math.max(recipe.euPerTick, 32)) / Math.log(4),
  );
  const overclocks = Math.max(0, Math.min(tierLimit, powerLimit));
  if (!overclocks) return recipe;
  let details: string[] = [];
  try {
    const parsed: unknown = JSON.parse(recipe.details);
    if (Array.isArray(parsed))
      details = parsed.filter(
        (line): line is string => typeof line === "string",
      );
  } catch {}
  return {
    ...recipe,
    euPerTick: recipe.euPerTick * 4 ** overclocks,
    durationTicks: Math.max(
      1,
      Math.floor(recipe.durationTicks / 2 ** overclocks),
    ),
    // Recorded catalog voltage must not override the derived voltage label.
    details: JSON.stringify(
      details.filter((line) => !/^(Voltage|Usage):/i.test(line)),
    ),
  };
}

export function recipeMachineBaseline(
  recipe: Recipe,
  machineId?: string,
): Recipe {
  return smeltingRuntime(recipe, selectedMachine(recipe, machineId));
}

/** Fuel and steam machines do not define the electric comparison baseline. */
export function recipeComparison(recipe: Recipe, machineId?: string) {
  const machine = selectedMachine(recipe, machineId);
  const baseline = recipeMachineBaseline(recipe, machineId);
  const lv = baseline.euPerTick > 0
    ? machineOptions(recipe).options.find((option) =>
        machineTier(option) === "LV" && recipeMachineBaseline(recipe, option.id).euPerTick > 0)
    : undefined;
  return {
    referenceRecipe: lv ? overclockRecipe(recipe, lv.id) : baseline,
    referenceTimeTicks: lv ? overclockRecipe(recipe, lv.id).durationTicks
      : baseline.euPerTick > 0 ? baseline.durationTicks
      : overclockRecipe(recipe).durationTicks,
    isDefaultMachine: machine?.id === (lv ?? selectedMachine(recipe))?.id,
  };
}
