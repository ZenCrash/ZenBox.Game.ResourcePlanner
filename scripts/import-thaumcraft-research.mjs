import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import sharp from "sharp";

const root = "data/extraction/instance/minecraft/dumps";
const read = name => JSON.parse(fs.readFileSync(`${root}/planner-thaum/${name}.json`, "utf8"));
const handlers = read("recipes");
const before = read("recipes-before-research");
const items = read("items");
const errors = read("errors");
const aspects = read("aspects");
const aspectItems = new Map(items.filter(i=>i.key==='thaumcraftneiplugin:Aspect:1').map(i=>[i.nbt.match(/key:"([^"]+)"/)?.[1],i.id]));
const combinations=handlers.find(h=>h.kind==='aspect-registry');
if(!combinations)throw new Error('Run the updated research exporter first.');
combinations.recipes=aspects.filter(a=>a.components.length===2).map(a=>({
  inputs:a.components.map(key=>({id:aspectItems.get(key),amount:1})),
  outputs:[{id:aspectItems.get(a.key),amount:1}],
}));
if(combinations.recipes.some(r=>[...r.inputs,...r.outputs].some(i=>!i.id)))throw new Error('Missing canonical aspect item');
const apply = process.argv.includes("--apply");
if(errors.length)throw new Error(`Exporter errors: ${JSON.stringify(errors)}`);
if(!fs.readFileSync(`${root}/planner-thaum/status.txt`,'utf8').includes('finished'))throw new Error('Wait for the exporter to finish');
for(const item of items.filter(i=>i.key==='thaumcraftneiplugin:Aspect:1')) {
  const stats=await sharp(`${root}/thaum-icons/${path.basename(item.icon)}`).stats();
  if(stats.channels[3]?.max===0)throw new Error(`Invisible aspect icon: ${item.id}`);
  if(/unknown aspect/i.test(item.name))throw new Error(`Undiscovered aspect: ${item.id}`);
}
const db = new Database("data/catalogs/gtnh-2.8.4.sqlite", { readonly: !apply });
const hash = value => createHash("sha256").update(value).digest("hex");
const signature = (handler, ingredients) => JSON.stringify([handler, ingredients.map(i => [i.direction, i.amount, i.chance, [...new Set([i.itemId,...i.alternatives])].sort()]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
const known = new Set();
const existing = db.prepare("SELECT id,registryId,nbt FROM Item").all();
const itemInfo = new Map(existing.map(i=>[i.id,i]));
for(const item of items)if(!itemInfo.has(item.id))itemInfo.set(item.id,{registryId:item.key.replace(/:-?\d+$/,''),nbt:item.nbt??''});
// Existing catalog normalization expands wildcard/ore choices and repairs NBT.
// Do not import a second recipe just because NEI chose a narrower representative.
const equivalent = (a,b) => {
  if(a.length!==b.length)return false;
  const candidates=a.map(i=>b.flatMap((j,n)=>{
    if(i.direction!==j.direction||i.amount!==j.amount||i.chance!==j.chance)return [];
    const aa=[i.itemId,...i.alternatives],bb=new Set([j.itemId,...j.alternatives]);
    const matches=aa.some(id=>bb.has(id)) || (i.direction==='input' && aa.some(id=>{
      const info=itemInfo.get(id);
      return info && !info.nbt && [...bb].some(other=>itemInfo.get(other)?.registryId===info.registryId);
    }));
    return matches?[n]:[];
  })).sort((x,y)=>x.length-y.length);
  const match=(n,used)=>n===candidates.length||candidates[n].some(i=>!used.has(i)&&match(n+1,new Set([...used,i])));
  return match(0,new Set());
};
const itemIds = new Set(existing.map(i => i.id));
const exported = new Map(items.map(i => [i.id, i]));
const additions = [];
const report = { errors, handlers: [], newRecipes: [], variantDifferences: [], missingItems: [], repairedAspects: 0 };
for (const handler of handlers) {
  const existingIngredients=[];
  const old = db.prepare("SELECT id FROM Recipe WHERE handler=?").all(handler.name);
  for (const r of old) {
    const ingredients = db.prepare("SELECT * FROM Ingredient WHERE recipeId=?").all(r.id).map(i => ({...i, alternatives: JSON.parse(i.alternatives)}));
    known.add(signature(handler.name, ingredients));
    existingIngredients.push(ingredients);
  }
  let added = 0;
  for (const raw of handler.recipes) {
    const ingredients = [];
    for (const direction of ["input", "output"]) {
      const stacks = [...(raw[direction + "s"] ?? [])];
      if (handler.name === "Infernal Blast Furnace" && direction === "output") stacks.push(...(raw.other ?? []).map(i=>({...i,chance:2500})));
      for (const [slot, i] of stacks.entries()) ingredients.push({itemId:i.id, direction, amount:i.amount, chance:(i.chance ?? 10000)/10000, consumed:i.amount !== 0, slot, x:i.x ?? null, y:i.y ?? null, alternatives:[...new Set((i.alternatives ?? []).map(a=>a.id))]});
    }
    if (!ingredients.length) continue;
    const missing = ingredients.flatMap(i=>[i.itemId,...i.alternatives]).filter(id=>!itemIds.has(id)&&!exported.has(id));
    if(missing.length) { report.missingItems.push(...missing); continue; }
    const sig = signature(handler.name, ingredients);
    if(known.has(sig)||existingIngredients.some(old=>equivalent(ingredients,old)))continue;
    known.add(sig);
    // Infusion handlers synthesize damage/NBT variants that change between runs.
    // Preserve existing curated recipes; record these differences for review.
    if(handler.kind!=='aspect-registry') {
      report.variantDifferences.push({handler:handler.name,ingredients});
      continue;
    }
    const id=hash(JSON.stringify([handler.source,handler.name,raw]));
    additions.push({id,handler:handler.name,ingredients});added++;
    report.newRecipes.push({handler:handler.name,id,outputs:ingredients.filter(i=>i.direction==='output').map(i=>exported.get(i.itemId)?.name ?? i.itemId)});
  }
  report.handlers.push({name:handler.name,source:handler.source,beforeResearch:before.find(h=>h.source===handler.source)?.recipes.length ?? 0,unlocked:handler.recipes.length,existing:old.length,added,error:handler.error});
}
const upsertItem = apply && db.prepare('INSERT INTO Item (id,registryId,metadata,nbt,name,mod,"group",tooltip,image,hidden,sortOrder,kind) VALUES (@id,@registryId,@metadata,@nbt,@name,@mod,@group,@tooltip,@image,@hidden,@sortOrder,@kind) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tooltip=excluded.tooltip,image=excluded.image,hidden=excluded.hidden,"group"=excluded."group"');
const perform = () => {
  for(const item of items) {
    const aspect=item.key.startsWith('thaumcraftneiplugin:Aspect');
    if(!aspect)continue;
    const icon=`${root}/thaum-icons/${path.basename(item.icon ?? '')}`;
    if(!item.icon||!fs.existsSync(icon)) { report.missingItems.push(`Icon: ${item.id}`); continue; }
    const match=item.key.match(/^(.*):(-?\d+)$/),registryId=match?match[1]:item.key,metadata=match?Number(match[2]):0;
    const filename=hash(item.id+':research-unlocked')+'.png';
    if(aspect)report.repairedAspects++;
    if(apply) {
      fs.copyFileSync(icon,`data/game-assets/gtnh-2.8.4/items/${filename}`);
      const tooltip=Array.isArray(item.tooltip)?item.tooltip:String(item.tooltip??'').split('<br>');
      upsertItem.run({id:item.id,registryId,metadata,nbt:item.nbt??'',name:item.name,mod:registryId.split(':')[0],group:aspect?'Thaumcraft Aspects':registryId.split(':')[0],tooltip:JSON.stringify(tooltip),image:`/assets/gtnh-2.8.4/items/${filename}`,hidden:aspect?(metadata===1?0:1):0,sortOrder:200000,kind:'item'});
    }
  }
  if(!apply)return;
  const insert=db.prepare('INSERT OR IGNORE INTO Recipe (id,name,handler,durationTicks,euPerTick,enabled,layout,details) VALUES (?,?,?,0,0,1,?,?)');
  const ingredient=db.prepare('INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,x,y,alternatives) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const variant=db.prepare('INSERT OR IGNORE INTO IngredientVariant (ingredientId,itemId) VALUES (?,?)');
  for(const recipe of additions){
    const layout=db.prepare('SELECT layout FROM Recipe WHERE handler=? LIMIT 1').get(recipe.handler)?.layout ?? '{}';
    if(!insert.run(recipe.id,recipe.handler,recipe.handler,layout,'[]').changes)continue;
    for(const i of recipe.ingredients){const id=ingredient.run(recipe.id,i.itemId,i.direction,i.amount,i.chance,+i.consumed,i.slot,i.x,i.y,JSON.stringify(i.alternatives)).lastInsertRowid;for(const itemId of i.alternatives)if(i.direction==='input'&&itemId!==i.itemId)variant.run(id,itemId);}
  }
};
if(apply) {
  fs.mkdirSync('data/research',{recursive:true});
  const backup='data/research/gtnh-before-thaumcraft-research.sqlite';
  if(!fs.existsSync(backup))await db.backup(backup);
  db.transaction(perform)();
}else perform();
fs.mkdirSync('data/research',{recursive:true});
fs.writeFileSync(`data/research/thaumcraft-unlocked-${apply?'audit':'dry-run'}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({applied:apply,handlers:report.handlers,repairedAspects:report.repairedAspects,newRecipes:additions.length,missing:report.missingItems.length,errors:errors.length},null,2));
db.close();
