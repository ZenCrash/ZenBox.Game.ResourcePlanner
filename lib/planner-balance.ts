import type { PlannerPlan } from "./auto-planner";
import { applyVariants, hasRecipeTiming } from "./model";
import { overclockRecipe } from "./recipe-overclock";

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
function fraction(value: number): [number, number] | undefined {
  let x = value, h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x), h = a * h1 + h0, k = a * k1 + k0;
    if (!Number.isSafeInteger(h) || k > 1e6) return;
    if (Math.abs(h / k - value) <= 1e-10 * Math.max(1, value)) return [h, k];
    [h0, h1, k0, k1] = [h1, h, k1, k];
    x = 1 / (x - a);
  }
}

/** Cycles are normalized per target item. Multiplying by runtime gives the
 * concurrent machines needed at a common target throughput, including branches.
 * Scale the whole route up; never round individual machines independently. */
export function plannerBalance(plan: PlannerPlan) {
  const runtimes = plan.steps.map(step => overclockRecipe(applyVariants(step.recipe, step.variants), step.machineId, step.multiblock));
  const weights = plan.steps.map((step, index) => hasRecipeTiming(runtimes[index])
    ? step.cycles * (runtimes[index].cycleDurationTicks ?? runtimes[index].durationTicks) / (runtimes[index].parallel ?? 1)
    : 0);
  const positive = weights.filter(value => value > 0 && Number.isFinite(value));
  if (!positive.length) return { machines: weights.map(() => 1), targetPerSecond: undefined };
  const minimum = Math.min(...positive);
  const ratios = weights.map(value => value > 0 ? value / minimum : 1);
  const fractions = ratios.map(fraction);
  let multiple = 1;
  for (const value of fractions) {
    if (!value) { multiple = 0; break; }
    multiple = multiple / gcd(multiple, value[1]) * value[1];
    if (!Number.isSafeInteger(multiple) || Math.max(...ratios) * multiple > 1e9) { multiple = 0; break; }
  }
  // Retain exact decimal proportions if whole counts would exceed diagram limits.
  const machines = multiple ? ratios.map(value => Math.round(value * multiple)) : ratios;
  return { machines, targetPerSecond: 20 * (multiple || 1) / minimum };
}
