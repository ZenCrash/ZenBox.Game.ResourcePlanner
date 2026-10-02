import type { Recipe } from './model';
import { recipePowerInfo } from './recipe-power';
import { machineTiers } from './machine-selection';
type TierRecipe = Pick<Recipe, 'handler' | 'euPerTick' | 'details'>;
export function recipeTier(recipe: TierRecipe): string | undefined {
  const tier = recipePowerInfo(recipe).voltage?.match(/\((\w+)\)/)?.[1];
  return machineTiers.find(value => value.toLowerCase() === tier?.toLowerCase());
}
export function compareRecipeTiers(a: TierRecipe, b: TierRecipe) {
  return machineTiers.indexOf(recipeTier(a) ?? '') - machineTiers.indexOf(recipeTier(b) ?? '');
}

function recipeSpecialValue(recipe: TierRecipe): number | undefined {
  let details: unknown;
  try { details = JSON.parse(recipe.details); } catch { return undefined; }
  if (!Array.isArray(details)) return undefined;
  const lines = details.filter((line): line is string => typeof line === 'string').map(line => line.replace(/§./g, '').trim());
  // Some handlers label this requirement as heat capacity, others as special value.
  for (const label of [/^(?:Required\s+)?Heat(?:\s+Capacity)?:\s*([+-]?[\d,]+(?:\.\d+)?)/i, /^Special value:\s*([+-]?[\d,]+(?:\.\d+)?)/i]) {
    for (const line of lines) {
      const match = line.match(label);
      if (!match) continue;
      const value = Number(match[1].replaceAll(',', ''));
      if (Number.isFinite(value)) return value;
    }
  }
}
export function comparePickerRecipes(a: TierRecipe & Pick<Recipe, 'durationTicks'>, b: TierRecipe & Pick<Recipe, 'durationTicks'>) {
  const tier = compareRecipeTiers(a, b);
  if (tier) return tier;
  const left = recipeSpecialValue(a), right = recipeSpecialValue(b);
  return Number(left !== undefined) - Number(right !== undefined) ||
    (left ?? 0) - (right ?? 0) ||
    a.euPerTick * a.durationTicks - b.euPerTick * b.durationTicks ||
    a.durationTicks - b.durationTicks;
}
