import type { Recipe } from "./model";
import { machineTier, machineTiers } from "./machine-selection";
import { multiblockProfile, multiblockOptions, multiblockHatchLimits, multiblockSetup, type MultiblockConfig } from "./multiblock";
import { overclockRecipe } from "./recipe-overclock";
import { plannerCoilAllowed } from './planner-progression';

export function plannerMachineConfigurations(recipe: Recipe, machineId: string | undefined, maxTier: number) {
  const profile = multiblockProfile(recipe, machineId);
  if (!profile || profile.kind === "hatch-only") return [{ machineId, runtime: overclockRecipe(recipe, machineId), multiblock: undefined as MultiblockConfig | undefined }];
  const { coils, hatches } = multiblockOptions(recipe, machineId);
  const limits = multiblockHatchLimits(recipe, machineId);
  const candidates: { machineId?: string; runtime: Recipe; multiblock?: MultiblockConfig }[] = [];
  for (const hatch of hatches) {
    const tier = machineTier(hatch);
    if (!tier || machineTiers.indexOf(tier) > maxTier) continue;
    for (let count = limits.min; count <= limits.max; count++) {
      for (const coil of profile.coils ? coils : [undefined]) {
        if (coil && !plannerCoilAllowed(coil, maxTier)) continue;
        const multiblock: MultiblockConfig = { energyHatchId: hatch.id, energyHatches: count, ...(coil ? { coilId: coil.id } : {}) };
        const setup = multiblockSetup(recipe, machineId, multiblock);
        if (!setup || setup.error || setup.parallel <= 0) continue;
        candidates.push({ machineId, multiblock, runtime: overclockRecipe(recipe, machineId, multiblock) });
      }
    }
  }
  return candidates;
}
