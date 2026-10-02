import type { Item, Recipe } from './model';
import { selectedMachine, machineVoltage, machineTiers } from './machine-selection';

export type MultiblockConfig = { coilId?: string; energyHatchId?: string; energyHatches?: number };
// Rules verified against the installed GT5-Unofficial 5.09.51.482 classes.
// Do not infer compatibility/bonuses from a controller name containing "multi".
const profiles = {
  'Electric Blast Furnace': { kind: 'blast', coils: 16 },
  'Pyrolyse Oven': { kind: 'pyrolyse', coils: 9 },
  'Oil Cracking Unit': { kind: 'cracking', coils: 16 },
  'Large Chemical Reactor': { kind: 'perfect', coils: 0 },
  'Vacuum Freezer': { kind: 'standard', coils: 0 },
  'Distillation Tower': { kind: 'standard', coils: 0 },
} as const;
export function multiblockProfile(recipe: Recipe, machineId?: string) {
  const name = selectedMachine(recipe, machineId)?.name.replace(/§./g, '');
  return name ? profiles[name as keyof typeof profiles] : undefined;
}
export const multiblockPartIds = [
  ...Array.from({ length: 14 }, (_, i) => `gregtech:gt.blockcasings5${i ? ':' + i : ''}`),
  ...Array.from({ length: 10 }, (_, i) => `gregtech:gt.blockmachines:${40 + i}`),
  ...Array.from({ length: 5 }, (_, i) => `gregtech:gt.blockmachines:${11300 + i}`),
];
export function coilHeat(item: Item) {
  return Number(item.tooltip.replace(/§./g, '').match(/Base Heating Capacity\s*=\s*(\d+)/)?.[1] ?? 0);
}
export function requiredHeat(recipe: Recipe) {
  let lines: string[] = [];
  try { lines = JSON.parse(recipe.details); } catch {}
  return Number(lines.find(x => /^(Heat Capacity|Required Heat|Special value):/i.test(x.replace(/§./g, '')))?.replace(/§./g, '').match(/:\s*([\d,]+)/)?.[1].replaceAll(',', '') ?? 0);
}
export function multiblockOptions(recipe: Recipe) {
  const parts = recipe.multiblockParts ?? [];
  return {
    coils: parts.filter(x => coilHeat(x) > 0).sort((a, b) => coilHeat(a) - coilHeat(b)),
    hatches: parts.filter(x => /^(\w+) Energy Hatch$/.test(x.name)).sort((a, b) => (machineVoltage(a) ?? 0) - (machineVoltage(b) ?? 0)),
  };
}
export function multiblockSetup(recipe: Recipe, machineId?: string, config: MultiblockConfig = {}) {
  const profile = multiblockProfile(recipe, machineId);
  if (!profile || recipe.euPerTick <= 0 || recipe.durationTicks <= 0) return;
  const { coils, hatches } = multiblockOptions(recipe);
  const count = config.energyHatches === 2 ? 2 : 1;
  // A single normal 2A hatch is limited to 1A by ProcessingLogic. Two supply 4A.
  const amps = count === 1 ? 1 : 4;
  const hatch = hatches.find(x => x.id === config.energyHatchId) ?? hatches.find(x => (machineVoltage(x) ?? 0) * amps >= recipe.euPerTick);
  if (!hatch) return;
  const voltage = machineVoltage(hatch)!;
  const heatBonus = 100 * (Math.ceil(Math.log(voltage * count / 8) / Math.log(4)) - 2);
  const coil = profile.coils ? coils.find(x => x.id === config.coilId) ?? coils.find(x => profile.kind !== 'blast' || coilHeat(x) + heatBonus >= requiredHeat(recipe)) ?? coils.at(-1) : undefined;
  if (profile.coils && !coil) return;
  const heat = coil ? coilHeat(coil) + (profile.kind === 'blast' ? heatBonus : 0) : 0;
  const coilTier = coil ? Math.round((coilHeat(coil) - 1801) / 900) : 0;
  const excessHeat = Math.max(0, heat - requiredHeat(recipe));
  const discount = profile.kind === 'blast' ? .95 ** Math.floor(excessHeat / 900)
    : profile.kind === 'cracking' ? 1 - Math.min(.5, .1 * (coilTier + 1)) : 1;
  const timeMultiplier = profile.kind === 'pyrolyse' ? 2 / (coilTier + 1) : 1;
  const available = voltage * amps;
  const error = profile.kind === 'blast' && heat < requiredHeat(recipe) ? `Requires ${requiredHeat(recipe).toLocaleString()} K; these coils provide ${heat.toLocaleString()} K.`
    : recipe.euPerTick > available ? `Requires ${recipe.euPerTick.toLocaleString()} EU/t; these hatches provide ${available.toLocaleString()} EU/t.` : undefined;
  const discounted = recipe.euPerTick * discount;
  const overclocks = Math.max(0, Math.floor(Math.log(Math.floor(available / Math.max(32, Math.trunc(discounted)))) / Math.log(4)));
  const perfect = profile.kind === 'perfect' ? overclocks : profile.kind === 'blast' ? Math.min(overclocks, Math.floor(excessHeat / 1800)) : 0;
  const euPerTick = Math.ceil(discounted * 4 ** overclocks);
  const durationTicks = Math.max(1, Math.floor(recipe.durationTicks * timeMultiplier / (4 ** perfect * 2 ** (overclocks - perfect))));
  const tier = machineTiers[Math.min(14, Math.ceil(Math.log(voltage / 8) / Math.log(4)))];
  return { profile, coil, hatch, count, amps, voltage, available, heat, discount, timeMultiplier, overclocks, perfect, euPerTick, durationTicks, tier, error };
}
export function configuredMultiblockRecipe(recipe: Recipe, machineId?: string, config?: MultiblockConfig): Recipe | undefined {
  const setup = multiblockSetup(recipe, machineId, config);
  if (!setup) return;
  let details: string[] = [];
  try { details = JSON.parse(recipe.details); } catch {}
  return { ...recipe, euPerTick: setup.error ? 0 : setup.euPerTick, durationTicks: setup.error ? 0 : setup.durationTicks,
    details: JSON.stringify([...details.filter(x => !/^(Voltage|Usage|Amperage):/i.test(x)),
      `Voltage: ${setup.voltage.toLocaleString('en-US')} EU/t (${setup.tier})`,
      `Amperage: ${(setup.euPerTick / setup.voltage).toLocaleString('en-US', { maximumFractionDigits: 3 })} A`,
      ...(setup.error ? [setup.error] : []),
    ]) };
}
