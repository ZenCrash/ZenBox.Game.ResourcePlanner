import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { comparePickerRecipes, compareRecipeTiers, recipeTier } from '../lib/recipe-picker-order';
import { GET } from '../app/api/recipes/route';
import { catalog } from '../lib/db';
import type { Recipe } from '../lib/model';
test('recipes sort in ascending voltage tier and account for amperage',()=>{
 const recipe=(euPerTick:number,details='[]')=>({handler:'Assembler',euPerTick,details});
 assert.equal(recipeTier(recipe(120)), 'MV');
 assert.equal(recipeTier(recipe(480,'["Amperage: 4 A"]')), 'MV');
 assert.equal(recipeTier(recipe(480)), 'HV');
 assert.ok(compareRecipeTiers(recipe(30),recipe(120))<0);
 assert.ok(compareRecipeTiers(recipe(120),recipe(480))<0);
});
test('MV Assembler usage returns only MV Assembler recipes while ordinary category browsing keeps every tier',async()=>{
 const source=await catalog.recipe.findFirstOrThrow({where:{handler:'Assembler'}});
 const ids=JSON.parse(source.layout).machineIds as string[];
 const machines=await catalog.item.findMany({where:{id:{in:ids}}});
 const { machineTier }=await import('../lib/machine-selection');
 const machine=machines.find(m=>machineTier(m)==='MV' && m.registryId==='gregtech:gt.blockmachines');assert.ok(machine);
 const result=await GET(new Request('http://localhost/api/recipes?mode=uses&item='+encodeURIComponent(machine.id)));
 const recipes=await result.json() as Recipe[];
 const assembler=recipes.filter(r=>r.handler==='Assembler');assert.ok(assembler.length>0);assert.ok(assembler.every(r=>recipeTier(r)==='MV'));
 const all=await GET(new Request('http://localhost/api/recipes?mode=category&item=Assembler'));const category=await all.json() as Recipe[];
 assert.ok(category.some(r=>recipeTier(r)==='LV'));assert.ok(category.some(r=>recipeTier(r)==='HV'));
 for(let i=1;i<category.length;i++)assert.ok(comparePickerRecipes(category[i-1],category[i])<=0);
 const availability=await GET(new Request('http://localhost/api/recipes?mode=uses&availability=1&item='+encodeURIComponent(machine.id)));assert.deepEqual(await availability.json(),{exists:true});
});
after(()=>catalog.$disconnect());

test('picker orders special requirements before total EU, then shortest duration',()=>{
 const r=(euPerTick:number,durationTicks:number,details:string[] = [])=>({handler:'Blast Furnace',euPerTick,durationTicks,details:JSON.stringify(details)});
 assert.ok(comparePickerRecipes(r(30,100,['Special value: 9000']),r(120,1))<0, 'tier first');
 assert.ok(comparePickerRecipes(r(120,100),r(120,1,['Special value: -1']))<0, 'missing before present');
 assert.ok(comparePickerRecipes(r(120,100,['Special value: 0']),r(120,1,['Special value: 1']))<0);
 assert.ok(comparePickerRecipes(r(120,100,['Heat Capacity: §61,800 K']),r(120,1,['Heat Capacity: 2700 K']))<0);
 assert.ok(comparePickerRecipes(r(120,1),r(60,10))<0, 'total energy before EU/t');
 assert.ok(comparePickerRecipes(r(120,5),r(60,10))<0, 'equal total energy uses shortest time');
 assert.equal(comparePickerRecipes(r(120,5),r(120,5)),0);
});
