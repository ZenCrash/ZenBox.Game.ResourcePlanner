import {
  acceptedItemIds,
  type Item,
  type Recipe,
  type VariantSelection,
} from "./model";
import { machineOptions, machineTier, machineTiers } from "./machine-selection";
import { overclockRecipe } from "./recipe-overclock";
import { recipePowerInfo } from "./recipe-power";

export type PlannerOptions = {
  targetId: string;
  exactTarget?: boolean;
  inputId?: string;
  priority: "yield" | "eu";
  allowMultiblocks: boolean;
  maxTier: number;
  maxSteps: number;
  maxSuggestions: number;
  excludedRecipes: string[];
  excludedPlans: string[];
  nearInputIds?: string[];
  bannedMachineIds?: string[];
  recipeTypes?: string[];
  targetAmounts?: Record<string, number>;
  inputFactors?: Record<string, number>;
  packagingItemIds?: string[];
};
export type PlannerStep = {
  recipe: Recipe;
  machineId?: string;
  variants: VariantSelection;
  inputSlot?: number;
  outputSlot: number;
  cycles: number;
};
export type PlannerPlan = {
  key: string;
  steps: PlannerStep[];
  totalEu: number;
  inputAmount: number;
  supplies: { item: Item; amount: number }[];
  links: {
    source: number;
    target: number;
    sourceSlot: number;
    targetSlot: number;
  }[];
};
export type PlannerResult = {
  plans: PlannerPlan[];
  limited: boolean;
  examined: number;
};

export function isPlannerMultiblock(recipe: Recipe, machine?: Item) {
  if (machine && /^(minecraft|etfuturum|IC2):/.test(machine.registryId))
    return false;
  if (machine && machineTier(machine))
    return /multiblock|multi-block|multi block|controller/i.test(
      `${machine.name} ${machine.tooltip}`,
    );
  const text =
    `${recipe.handler} ${machine?.name ?? ""} ${machine?.tooltip ?? ""}`.replace(
      /§./g,
      "",
    );
  return (
    /multiblock|multi-block|multi block|controller|industrial|large |blast furnace|distillation tower|fusion reactor|processing array|assembly line|power forge/i.test(
      text,
    ) ||
    (!!machine?.registryId.startsWith("gregtech:") && !machineTier(machine))
  );
}

export function plannerMachine(
  recipe: Recipe,
  options: PlannerOptions,
): { machineId?: string; runtime: Recipe } | null {
  if (
    options.recipeTypes?.length &&
    !options.recipeTypes.includes(recipe.handler)
  )
    return null;
  const tier = recipePowerInfo(recipe).voltage?.match(/\((\w+)\)/)?.[1];
  if (tier && machineTiers.indexOf(tier) > options.maxTier) return null;
  const machines = machineOptions(recipe).options;
  const eligible = machines.filter((machine) => {
    const tier = machineTier(machine);
    return (
      !options.bannedMachineIds?.includes(machine.id) &&
      (!tier || machineTiers.indexOf(tier) <= options.maxTier) &&
      (options.allowMultiblocks || !isPlannerMultiblock(recipe, machine))
    );
  });
  if (machines.length && !eligible.length) return null;
  if (
    !machines.length &&
    !options.allowMultiblocks &&
    isPlannerMultiblock(recipe)
  )
    return null;
  const candidates = (eligible.length ? eligible : [undefined])
    .map((machine) => ({
      machineId: machine?.id,
      runtime: overclockRecipe(recipe, machine?.id),
    }))
    .filter(
      ({ runtime }) =>
        runtime.euPerTick >= 0 &&
        (runtime.euPerTick === 0 || runtime.durationTicks > 0),
    );
  candidates.sort(
    (a, b) =>
      a.runtime.euPerTick * a.runtime.durationTicks -
      b.runtime.euPerTick * b.runtime.durationTicks,
  );
  return candidates[0] ?? null;
}

/** Filling/draining carries the contents, not the empty packaging. Following
 * the empty bucket output can otherwise turn any bottled fluid into any other
 * one by buying the desired fluid externally and reusing the bucket.
 */
export function plannerConversionInputs(
  recipe: Recipe,
  outputSlot: number,
  packagingIsTarget = false,
) {
  const inputs = recipe.ingredients.filter(
    (i) => i.direction === "input" && i.consumed && i.amount > 0,
  );
  if (recipe.handler !== "Fluid Canner" && recipe.handler !== "Bottler")
    return inputs;
  const output = recipe.ingredients.find(
    (i) => i.direction === "output" && i.slot === outputSlot,
  );
  if (!output) return [];
  const fluidInput = inputs.filter((i) => i.item.kind === "fluid");
  const fluidOutput = recipe.ingredients.some(
    (i) => i.direction === "output" && i.item.kind === "fluid",
  );
  if (fluidInput.length) return fluidInput;
  if (fluidOutput)
    return output.item.kind === "fluid" || packagingIsTarget ? inputs : [];
  // Bottler exports without their fluid ingredient cannot establish a
  // material conversion from the empty bottle alone.
  return [];
}

/** A conversion route; other inputs are explicitly counted as external supplies.
 * Costs are expected EU per one target unit, including probabilistic outputs.
 * No free-energy credit is assigned to byproducts or cyclic conversions.
 */
async function findRoutes(
  options: PlannerOptions,
  recipesFor: (itemId: string) => Promise<Recipe[]>,
  interrupted: () => boolean = () => false,
  budget = 5000,
): Promise<PlannerResult> {
  type State = {
    itemId: string;
    amount: number;
    steps: PlannerStep[];
    eu: number;
    visited: string[];
  };
  const inputFactors =
    options.inputFactors ?? (options.inputId ? { [options.inputId]: 1 } : {});
  const isSource = (id: string) => Object.hasOwn(inputFactors, id);
  const queue: State[] = Object.entries(
    options.exactTarget ? { [options.targetId]: 1 } : options.targetAmounts ?? { [options.targetId]: 1 },
  ).map(([itemId, amount]) => ({
    itemId,
    amount,
    steps: [],
    eu: 0,
    visited: [],
  }));
  const found = new Map<string, PlannerPlan>();
  const cache = new Map<string, Promise<Recipe[]>>();
  const excluded = new Set(options.excludedRecipes);
  let examined = 0;
  let limited = false;
  const finish = (state: State) => {
    const steps = state.steps.toReversed();
    const key = steps
      .map(
        (step) =>
          `${step.recipe.id}:${step.inputSlot ?? "_"}:${step.outputSlot}:${JSON.stringify(step.variants)}`,
      )
      .join("|");
    if (options.excludedPlans.includes(key)) return;
    const supplies = new Map<string, { item: Item; amount: number }>();
    for (const step of steps)
      for (const input of step.recipe.ingredients) {
        if (
          input.direction !== "input" ||
          !input.consumed ||
          input.amount <= 0 ||
          input.slot === step.inputSlot
        )
          continue;
        const existing = supplies.get(input.itemId);
        supplies.set(input.itemId, {
          item: input.item,
          amount: (existing?.amount ?? 0) + input.amount * step.cycles,
        });
      }
    // A repeated source in an auxiliary slot still contributes to the yield denominator.
    let extraSource = 0;
    for (const [id, factor] of Object.entries(inputFactors)) {
      extraSource += (supplies.get(id)?.amount ?? 0) * factor;
      supplies.delete(id);
    }
    if (
      options.inputId &&
      Object.keys(options.targetAmounts ?? { [options.targetId]: 1 }).some(
        (id) => (supplies.get(id)?.amount ?? 0) > 0,
      )
    )
      return;
    const links = steps.slice(1).map((step, index) => ({
      source: index,
      target: index + 1,
      sourceSlot: steps[index].outputSlot,
      targetSlot: step.inputSlot!,
    }));
    found.set(key, {
      key,
      steps,
      links,
      totalEu: state.eu,
      inputAmount:
        state.amount * (inputFactors[state.itemId] ?? 1) + extraSource,
      supplies: [...supplies.values()],
    });
  };
  while (queue.length) {
    if (interrupted() || examined >= budget) {
      limited = true;
      break;
    }
    // EU is a nonnegative lower bound. Yield paths are explored by depth to avoid
    // repeatedly following a locally attractive recycling chain.
    queue.sort(
      (a, b) =>
        Number(options.nearInputIds?.includes(b.itemId) ?? false) -
          Number(options.nearInputIds?.includes(a.itemId) ?? false) ||
        (options.priority === "eu"
          ? a.eu - b.eu || a.steps.length - b.steps.length
          : a.steps.length - b.steps.length || a.amount - b.amount),
    );
    const state = queue.shift()!;
    if (state.steps.length && isSource(state.itemId)) {
      finish(state);
      continue;
    }
    if (
      state.steps.length >= options.maxSteps ||
      (state.steps.length > 0 &&
        options.packagingItemIds?.includes(state.itemId)) ||
      state.visited.includes(state.itemId)
    )
      continue;
    if (!cache.has(state.itemId))
      cache.set(state.itemId, recipesFor(state.itemId));
    for (const recipe of await cache.get(state.itemId)!) {
      if (++examined > budget) {
        limited = true;
        break;
      }
      if (
        excluded.has(recipe.id) ||
        state.steps.some((step) => step.recipe.id === recipe.id)
      )
        continue;
      const machine = plannerMachine(recipe, options);
      if (!machine) continue;
      const outputs = recipe.ingredients.filter(
        (i) =>
          i.direction === "output" &&
          i.itemId === state.itemId &&
          i.amount > 0 &&
          i.chance > 0,
      );
      if (!outputs.length) continue;
      outputs.sort((a, b) => b.amount * b.chance - a.amount * a.chance);
      const amount = outputs[0].amount * outputs[0].chance;
      const cycles = state.amount / amount;
      const eu =
        state.eu +
        cycles *
          machine.runtime.euPerTick *
          Math.max(0, machine.runtime.durationTicks);
      if (!Number.isFinite(eu) || !Number.isFinite(cycles)) continue;
      const step: PlannerStep = {
        recipe,
        machineId: machine.machineId,
        variants: {},
        outputSlot: outputs[0].slot,
        cycles,
      };
      if (!options.inputId) {
        finish({ ...state, steps: [...state.steps, step], eu });
        continue;
      }
      const inputs = plannerConversionInputs(
        recipe,
        step.outputSlot,
        state.steps.length === 0 && state.itemId === options.targetId,
      );
      for (const input of inputs) {
        for (const itemId of acceptedItemIds(input)) {
          if (state.visited.includes(itemId) || itemId === state.itemId)
            continue;
          if (
            !Number.isFinite(input.amount * cycles) ||
            input.amount * cycles <= 0
          )
            continue;
          const next = {
            ...step,
            inputSlot: input.slot,
            variants:
              itemId === input.itemId
                ? {}
                : { [`input:${input.slot}`]: itemId },
          };
          const nextState = {
            itemId,
            amount: input.amount * cycles,
            steps: [...state.steps, next],
            eu,
            visited: [...state.visited, state.itemId],
          };
          if (isSource(itemId)) finish(nextState);
          else queue.push(nextState);
          if (queue.length >= budget) {
            limited = true;
            break;
          }
        }
        if (queue.length >= budget) break;
      }
    }
  }
  const plans = [...found.values()].sort((a, b) => comparePlans(options, a, b));
  return { plans: plans.slice(0, options.maxSuggestions), limited, examined };
}

function comparePlans(options: PlannerOptions, a: PlannerPlan, b: PlannerPlan) {
  return (
    a.supplies.length - b.supplies.length ||
    (options.priority === "yield"
      ? a.inputAmount - b.inputAmount
      : a.totalEu - b.totalEu) ||
    a.totalEu - b.totalEu ||
    a.steps.length - b.steps.length ||
    a.key.localeCompare(b.key)
  );
}

function reuseByproducts(plan: PlannerPlan): PlannerPlan {
  const links = [...plan.links];
  const connected = new Set(
    links.map((link) => `${link.target}:${link.targetSlot}`),
  );
  const reused = new Map<string, number>();
  const reaches = (
    from: number,
    to: number,
    seen = new Set<number>(),
  ): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return links.some(
      (link) => link.source === from && reaches(link.target, to, seen),
    );
  };
  plan.steps.forEach((producer, source) => {
    for (const output of producer.recipe.ingredients) {
      if (
        output.direction !== "output" ||
        output.slot === producer.outputSlot ||
        !plan.supplies.some((supply) => supply.item.id === output.itemId)
      )
        continue;
      let available = output.amount * output.chance * producer.cycles;
      plan.steps.forEach((consumer, target) => {
        if (reaches(target, source)) return;
        for (const input of consumer.recipe.ingredients) {
          if (
            input.direction !== "input" ||
            !input.consumed ||
            input.amount <= 0 ||
            input.itemId !== output.itemId ||
            connected.has(`${target}:${input.slot}`)
          )
            continue;
          const required = input.amount * consumer.cycles;
          if (available + 1e-9 < required) continue;
          available -= required;
          connected.add(`${target}:${input.slot}`);
          links.push({
            source,
            target,
            sourceSlot: output.slot,
            targetSlot: input.slot,
          });
          reused.set(input.itemId, (reused.get(input.itemId) ?? 0) + required);
        }
      });
    }
  });
  if (!reused.size) return plan;
  return {
    ...plan,
    links,
    key: `${plan.key}~reuse`,
    supplies: plan.supplies
      .map((supply) => ({
        ...supply,
        amount: Math.max(0, supply.amount - (reused.get(supply.item.id) ?? 0)),
      }))
      .filter((supply) => supply.amount > 1e-9),
  };
}

/** Extend a conversion route with ingredient branches when doing so reduces
 * external dependencies. All branch costs and source consumption are included.
 * This bounded search reports its limits rather than claiming global optimality.
 */
export async function findAutoPlans(
  options: PlannerOptions,
  recipesFor: (id: string) => Promise<Recipe[]>,
  interrupted: () => boolean = () => false,
  budget = 5000,
): Promise<PlannerResult> {
  const cache = new Map<string, Promise<Recipe[]>>();
  const lookup = (id: string) => {
    if (!cache.has(id)) cache.set(id, recipesFor(id));
    return cache.get(id)!;
  };
  const primaryDeadline = Date.now() + 8000;
  const primary = await findRoutes(
    { ...options, maxSuggestions: Math.min(100, options.maxSuggestions * 5) },
    lookup,
    () => interrupted() || Date.now() > primaryDeadline,
    Math.max(1, Math.floor(budget / 2)),
  );
  let examined = primary.examined;
  let limited = primary.limited;
  const plans: PlannerPlan[] = [];
  for (const original of primary.plans) {
    let plan = reuseByproducts(original);
    const attempted = new Set<string>();
    while (options.inputId && plan.steps.length < options.maxSteps) {
      const supply = plan.supplies.find(
        (supply) => !attempted.has(supply.item.id),
      );
      if (!supply || interrupted() || examined >= budget) break;
      attempted.add(supply.item.id);
      const sub = await findRoutes(
        {
          ...options,
          targetId: supply.item.id,
          targetAmounts: undefined,
          maxSteps: options.maxSteps - plan.steps.length,
          maxSuggestions: 10,
          excludedRecipes: [
            ...options.excludedRecipes,
            ...plan.steps.map((step) => step.recipe.id),
          ],
          excludedPlans: [],
        },
        lookup,
        interrupted,
        Math.min(400, budget - examined),
      );
      examined += sub.examined;
      limited ||= sub.limited;
      const alternatives = sub.plans
        .map((branch): PlannerPlan => {
          const offset = plan.steps.length;
          const supplies = new Map(
            plan.supplies
              .filter((value) => value.item.id !== supply.item.id)
              .map((value) => [value.item.id, { ...value }]),
          );
          for (const extra of branch.supplies) {
            const amount = extra.amount * supply.amount;
            supplies.set(extra.item.id, {
              item: extra.item,
              amount: amount + (supplies.get(extra.item.id)?.amount ?? 0),
            });
          }
          const suppliedPorts = new Set(
            plan.links.map((link) => `${link.target}:${link.targetSlot}`),
          );
          const links = [
            ...plan.links,
            ...branch.links.map((link) => ({
              ...link,
              source: link.source + offset,
              target: link.target + offset,
            })),
          ];
          plan.steps.forEach((step, target) =>
            step.recipe.ingredients.forEach((ingredient) => {
              if (
                ingredient.direction === "input" &&
                ingredient.consumed &&
                ingredient.amount > 0 &&
                ingredient.itemId === supply.item.id &&
                !suppliedPorts.has(`${target}:${ingredient.slot}`)
              ) {
                links.push({
                  source: offset + branch.steps.length - 1,
                  sourceSlot: branch.steps.at(-1)!.outputSlot,
                  target,
                  targetSlot: ingredient.slot,
                });
              }
            }),
          );
          return {
            key: `${plan.key}+[${branch.key}]`,
            steps: [
              ...plan.steps,
              ...branch.steps.map((step) => ({
                ...step,
                cycles: step.cycles * supply.amount,
              })),
            ],
            links,
            totalEu: plan.totalEu + branch.totalEu * supply.amount,
            inputAmount: plan.inputAmount + branch.inputAmount * supply.amount,
            supplies: [...supplies.values()],
          };
        })
        .filter(
          (candidate) => candidate.supplies.length < plan.supplies.length,
        );
      alternatives.sort((a, b) => comparePlans(options, a, b));
      if (alternatives[0]) plan = alternatives[0];
    }
    // Keep the unbranched alternative too: dismissing a plan must not suppress
    // another valid configuration using the same target recipe.
    for (const candidate of [plan, original])
      if (
        !options.excludedPlans.includes(candidate.key) &&
        !plans.some((p) => p.key === candidate.key)
      )
        plans.push(candidate);
  }
  limited ||= interrupted() || examined >= budget;
  plans.sort((a, b) => comparePlans(options, a, b));
  return { plans: plans.slice(0, options.maxSuggestions), examined, limited };
}
