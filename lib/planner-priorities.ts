export const plannerPriorityIds = ["eu", "output", "yield", "singleblock"] as const;
export type PlannerPriority = typeof plannerPriorityIds[number];
export const plannerPriorityLabels: Record<PlannerPriority, string> = {
  eu: "Cheapest total EU per target output",
  output: "Most output",
  yield: "Most output from input",
  singleblock: "Singleblocks over multiblocks",
};
export function defaultPlannerPriorities(first: "eu" | "output" | "yield" = "eu"): PlannerPriority[] {
  return [...new Set<PlannerPriority>([first, "eu", "output", "yield", "singleblock"])];
}
