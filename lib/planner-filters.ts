import { z } from "zod";
import { machineTiers } from "./machine-selection";

export const plannerFiltersKey = "resource-planner:auto-planner-filters:v1";
const item = z.object({
  id: z.string(),
  name: z.string(),
  registryId: z.string(),
  metadata: z.number(),
  mod: z.string(),
  group: z.string(),
  tooltip: z.string(),
  image: z.string().nullable(),
  kind: z.string(),
});
const count = z
  .string()
  .refine(
    (value) =>
      /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100,
  )
  .catch("10");
const filters = z.object({
  target: item.optional().catch(undefined),
  input: item.optional().catch(undefined),
  priority: z.enum(["eu", "yield"]).catch("eu"),
  allowMultiblocks: z.boolean().catch(false),
  maxTier: z
    .number()
    .int()
    .min(0)
    .max(machineTiers.length - 1)
    .catch(1),
  maxSteps: count,
  maxSuggestions: count,
  bannedMachineIds: z.array(z.string()).max(10000).catch([]),
  recipeTypes: z.array(z.string()).max(1000).catch([]),
});
export function parsePlannerFilters(value: unknown) {
  return filters.parse(value && typeof value === "object" ? value : {});
}
export function readPlannerFilters() {
  try {
    return parsePlannerFilters(
      JSON.parse(sessionStorage.getItem(plannerFiltersKey) ?? "null"),
    );
  } catch {
    return parsePlannerFilters(null);
  }
}
