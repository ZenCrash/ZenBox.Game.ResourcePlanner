import { z } from "zod";
import { catalog } from "@/lib/db";
import { isGtnhInstalled } from "@/lib/game-packs";
import { hydrateRecipeVariants } from "@/lib/recipe-data";
import { findAutoPlans } from "@/lib/auto-planner";
import { machineTiers } from "@/lib/machine-selection";
import { plannerRecipes } from "@/lib/planner-catalog";
import {
  fluidLookupAmounts,
  emptyFluidContainers,
} from "@/lib/fluid-containers";

const schema = z.object({
  targetId: z.string().min(1).max(500),
  exactTarget: z.boolean().default(false),
  inputId: z.string().min(1).max(500).optional(),
  priority: z.enum(["yield", "eu"]),
  allowMultiblocks: z.boolean(),
  maxTier: z
    .number()
    .int()
    .min(0)
    .max(machineTiers.length - 1),
  maxSteps: z.number().int().min(1).max(100),
  maxSuggestions: z.number().int().min(1).max(100),
  excludedRecipes: z.array(z.string().max(500)).max(1000).default([]),
  excludedPlans: z.array(z.string().max(100000)).max(1000).default([]),
  bannedMachineIds: z.array(z.string().max(500)).max(10000).default([]),
  recipeTypes: z.array(z.string().max(500)).max(1000).default([]),
});

export async function POST(request: Request) {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid planner request." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    return Response.json(
      { error: "Choose valid items and limits (1–100 steps and suggestions)." },
      { status: 400 },
    );
  const options = parsed.data;
  if (options.targetId === options.inputId)
    return Response.json(
      { error: "Choose different input and target items." },
      { status: 400 },
    );
  if (options.priority === "yield" && !options.inputId)
    return Response.json(
      { error: "Choose an input item to compare output yield." },
      { status: 400 },
    );
  const started = Date.now();
  let capped = false;
  const [targetAmounts, inputAmounts] = await Promise.all([
    options.exactTarget ? Promise.resolve({ [options.targetId]: 1 }) : fluidLookupAmounts(options.targetId),
    options.inputId
      ? fluidLookupAmounts(options.inputId)
      : Promise.resolve({} as Record<string, number>),
  ]);
  const inputIds = Object.keys(inputAmounts);
  const packagingItemIds = await emptyFluidContainers([
    ...new Set([...Object.keys(targetAmounts), ...inputIds]),
  ]);
  const inputFactors = Object.fromEntries(
    Object.entries(inputAmounts).map(([id, amount]) => [id, 1 / amount]),
  );
  const sourceRecipes: { recipeId: string }[] = [];
  for (let start = 0; start < inputIds.length; start += 300) {
    const batch = inputIds.slice(start, start + 300);
    sourceRecipes.push(
      ...(await catalog.ingredient.findMany({
        where: { itemId: { in: batch }, direction: "input" },
        select: { recipeId: true },
        distinct: ["recipeId"],
        take: 500,
      })),
    );
    const variants = await catalog.ingredientVariant.findMany({
      where: { itemId: { in: batch }, ingredient: { direction: "input" } },
      select: { ingredient: { select: { recipeId: true } } },
      take: 500,
    });
    sourceRecipes.push(
      ...variants.map((variant) => ({ recipeId: variant.ingredient.recipeId })),
    );
  }
  const sourceIds = [
    ...new Set(sourceRecipes.map((recipe) => recipe.recipeId)),
  ];
  const nearInputIds = new Set<string>();
  for (let start = 0; start < sourceIds.length; start += 300) {
    const nearby = await catalog.ingredient.findMany({
      where: {
        recipeId: { in: sourceIds.slice(start, start + 300) },
        direction: "output",
      },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    nearby.forEach((item) => nearInputIds.add(item.itemId));
  }
  const result = await findAutoPlans(
    {
      ...options,
      targetAmounts,
      inputFactors,
      packagingItemIds,
      nearInputIds: [...nearInputIds],
    },
    async (itemId) => {
      const loaded = await plannerRecipes(
        itemId,
        options.recipeTypes,
        options.excludedRecipes,
      );
      capped ||= loaded.capped;
      return loaded.recipes;
    },
    () => request.signal.aborted || Date.now() - started > 20000,
  );
  const selected = [
    ...new Map(
      result.plans.flatMap((plan) =>
        plan.steps.map((step) => [step.recipe.id, step.recipe] as const),
      ),
    ).values(),
  ];
  const hydrated = new Map<string, (typeof selected)[number]>();
  for (let start = 0; start < selected.length; start += 100) {
    for (const recipe of await hydrateRecipeVariants(
      selected.slice(start, start + 100),
    ))
      hydrated.set(recipe.id, recipe);
  }
  for (const plan of result.plans)
    for (const step of plan.steps) step.recipe = hydrated.get(step.recipe.id)!;
  return Response.json({ ...result, limited: result.limited || capped });
}

export async function GET() {
  if (!isGtnhInstalled())
    return Response.json(
      { error: "Install the GTNH game pack first." },
      { status: 409 },
    );
  const [rows, handlers] = await Promise.all([
    catalog.$queryRaw<
      { id: string }[]
    >`SELECT DISTINCT machine.value AS id FROM Recipe, json_each(CASE WHEN json_valid(Recipe.layout) THEN Recipe.layout ELSE '{}' END, '$.machineIds') AS machine WHERE Recipe.enabled = 1 AND machine.type = 'text'`,
    catalog.recipe.findMany({
      where: { enabled: true },
      distinct: ["handler"],
      select: { handler: true },
    }),
  ]);
  const ids = [
    ...new Set([
      ...rows.map((row) => row.id),
      "etfuturum:blast_furnace",
      "gregtech:gt.blockmachines:1000",
      "gregtech:gt.blockmachines:15412",
    ]),
  ];
  const machines = [];
  for (let start = 0; start < ids.length; start += 500)
    machines.push(
      ...(await catalog.item.findMany({
        where: { id: { in: ids.slice(start, start + 500) } },
      })),
    );
  machines.sort((a, b) =>
    a.name.replace(/§./g, "").localeCompare(b.name.replace(/§./g, "")),
  );
  return Response.json({
    machines,
    recipeTypes: handlers
      .map((row) => row.handler)
      .sort((a, b) => a.localeCompare(b)),
  });
}
