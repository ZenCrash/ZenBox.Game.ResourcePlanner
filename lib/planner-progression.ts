import progression from './multiblock-progression.json';
import type { Item } from './model';
import { machineTier, machineTiers } from './machine-selection';
import { coilHeat } from './multiblock';

const controllers = new Map(progression.controllers.map(c => [c.id, c]));
const names = new Map(progression.controllers.map(c => [c.name, c]));
const rank = (tier: string | null | undefined) => tier === 'Steam' || tier === 'Stone' ? 0 : machineTiers.indexOf(tier ?? '');

export function plannerControllerAllowed(machine: Item, maxTier: number) {
  const entry = controllers.get(machine.id) ?? names.get(machine.name.replace(/§./g, ''));
  const explicit = machineTier(machine);
  const tier = Math.max(rank(explicit), rank(entry?.tier));
  return tier >= 0 && tier <= maxTier;
}

export function knownPlannerMultiblock(machine: Item) {
  return controllers.has(machine.id) || names.has(machine.name.replace(/§./g, ''));
}

export function plannerCoilAllowed(coil: Item, maxTier: number) {
  const entry = progression.coils.find(c => c.id === coil.id)
    ?? progression.coils.find(c => c.heat === coilHeat(coil));
  const tier = rank(entry?.tier);
  return tier >= 0 && tier <= maxTier;
}
