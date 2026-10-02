import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item, Recipe } from '../lib/model';
import { nodeSchema } from '../lib/model';
import { multiblockSetup } from '../lib/multiblock';
import { overclockRecipe } from '../lib/recipe-overclock';
import { AreaSummaryCache } from '../lib/area-summary-cache';
import { createScaleCalculator } from '../lib/scale-view';

const item = (id: string, name: string, tooltip = '[]'): Item => ({ id, name, tooltip, registryId: id, metadata: 0, mod: 'GregTech', group: '', image: null, kind: 'item' });
const coil = (heat: number) => item(`coil:${heat}`, 'Coil', JSON.stringify([`Base Heating Capacity =${heat} Kelvin`]));
const hatch = (tier: string, voltage: number) => item(`hatch:${tier}`, `${tier} Energy Hatch`, JSON.stringify([`Voltage IN: ${voltage} (${tier})`]));
function recipe(name = 'Electric Blast Furnace', heat = 1800): Recipe {
  return { id: 'r', name: 'Test', handler: 'Blast Furnace', durationTicks: 400, euPerTick: 120, layout: '{}', details: JSON.stringify([`Special value: ${heat}`]), ingredients: [],
    craftingMachines: [item('controller', name)], multiblockParts: [coil(1801), coil(2701), coil(3601), coil(6301), hatch('LV', 32), hatch('MV', 128), hatch('HV', 512)] };
}
test('EBF applies 900 K EU discounts and 1800 K perfect overclocks', () => {
  const r = recipe();
  const ordinary = multiblockSetup(r, undefined, { coilId: 'coil:1801', energyHatchId: 'hatch:HV' })!;
  assert.equal(ordinary.profile.coils, 16); assert.equal(ordinary.euPerTick, 480); assert.equal(ordinary.durationTicks, 200);
  const hot = multiblockSetup(r, undefined, { coilId: 'coil:3601', energyHatchId: 'hatch:HV' })!;
  assert.equal(hot.heat, 3701); assert.equal(hot.discount, .95 ** 2); assert.equal(hot.perfect, 1);
  assert.equal(hot.euPerTick, 434); assert.equal(hot.durationTicks, 100);
  assert.equal(r.euPerTick, 120); assert.equal(r.durationTicks, 400);
});
test('insufficient coils or hatch power cannot produce a positive output rate', () => {
  const heat = overclockRecipe(recipe('Electric Blast Furnace', 3600), undefined, { coilId: 'coil:1801' });
  assert.equal(heat.durationTicks, 0); assert.equal(heat.euPerTick, 0);
  const power = multiblockSetup(recipe(), undefined, { energyHatchId: 'hatch:LV' })!;
  assert.match(power.error!, /hatches provide/);
});
test('two matching hatches provide 4 A and enable another overclock', () => {
  const one = multiblockSetup(recipe(), undefined, { energyHatchId: 'hatch:MV', coilId: 'coil:1801' })!;
  const two = multiblockSetup(recipe(), undefined, { energyHatchId: 'hatch:MV', energyHatches: 2, coilId: 'coil:1801' })!;
  assert.equal(one.available, 128); assert.equal(two.available, 512);
  assert.equal(one.overclocks, 0); assert.equal(two.overclocks, 1);
  assert.equal(two.heat, 1901);
});
test('Pyrolyse and Oil Cracking use their own coil effects', () => {
  const pyro = multiblockSetup(recipe('Pyrolyse Oven'), undefined, { coilId: 'coil:1801' })!;
  assert.equal(pyro.profile.coils, 9); assert.equal(pyro.durationTicks, 800);
  const better = multiblockSetup(recipe('Pyrolyse Oven'), undefined, { coilId: 'coil:2701' })!;
  assert.equal(better.durationTicks, 400);
  const cracking = multiblockSetup(recipe('Oil Cracking Unit'), undefined, { coilId: 'coil:6301' })!;
  assert.equal(cracking.discount, .5); assert.equal(cracking.euPerTick, 60);
});
test('LCR uses perfect overclocks; unsupported controllers stay unchanged', () => {
  assert.equal(multiblockSetup(recipe('Large Chemical Reactor'), undefined, { energyHatchId: 'hatch:HV' })!.durationTicks, 100);
  const unknown = recipe('Unknown multiblock'); assert.equal(overclockRecipe(unknown), unknown);
});
test('multiblock choices survive schema parsing and invalidate cached group totals', () => {
  const config = { coilId: 'coil:3601', energyHatchId: 'hatch:HV', energyHatches: 1 };
  const saved = nodeSchema.parse({ id: '00000000-0000-4000-8000-000000000000', recipeId: 'r', machines: 1, position: { x: 0, y: 0 }, multiblock: config });
  assert.deepEqual(saved.multiblock, config);
  const area = { position: { x: 0, y: 0 }, width: 100, height: 100 };
  const node = { position: { x: 0, y: 0 }, width: 10, height: 10, recipe: recipe(), machines: 1, variants: {} };
  const cache = new AreaSummaryCache();
  const before = cache.get('a', area, [node]);
  const after = cache.get('a', area, [{ ...node, multiblock: config }]);
  assert.notEqual(before, after); assert.equal(after.euPerTick, 434);
});
test('changing coils updates scaled connected-machine counts even with cached scaling', () => {
  const resource = item('resource', 'Resource');
  const ingredient = { itemId: resource.id, item: resource, amount: 1, chance: 1, consumed: true, slot: 0, x: null, y: null, alternatives: '[]' };
  const nodes = [{ id: 'producer', type: 'recipe', position: { x: 0, y: 0 }, data: { recipe: { ...recipe(), ingredients: [{ ...ingredient, direction: 'output' }] }, machines: 1, variants: {}, scaleAmount: 1, multiblock: { coilId: 'coil:1801', energyHatchId: 'hatch:MV' } } },
    { id: 'consumer', type: 'recipe', position: { x: 0, y: 0 }, data: { recipe: { ...recipe('Vacuum Freezer'), ingredients: [{ ...ingredient, direction: 'input' }] }, machines: 1, variants: {} } }];
  const edges = [{ id: 'edge', source: 'producer', target: 'consumer', sourceHandle: 'output:0', targetHandle: 'input:0' }];
  const calculate = createScaleCalculator();
  assert.equal(calculate(nodes, edges).counts.get('consumer'), 1);
  const changed = nodes.map(n => n.id === 'producer' ? { ...n, data: { ...n.data, multiblock: { coilId: 'coil:3601', energyHatchId: 'hatch:HV' } } } : n);
  assert.equal(calculate(changed, edges).counts.get('consumer'), 4);
});
