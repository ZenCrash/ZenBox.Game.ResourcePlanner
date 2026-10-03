// Read-only audit of the installed catalog and game configuration. No game writes.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const game = process.argv[2] ?? 'C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons/minecraft';
const output = 'data/research/multiblock-progression';
fs.mkdirSync(output, {recursive:true});
const db = new Database('data/catalogs/gtnh-2.8.4.sqlite', {readonly:true});
const tiers = ['ULV','LV','MV','HV','EV','IV','LuV','ZPM','UV','UHV','UEV','UIV','UMV','UXV','MAX'];
const clean = s => s.replace(/§./g, '');
const items = new Map(db.prepare('SELECT id,name,tooltip,registryId,metadata FROM Item').all().map(i=>[i.id,{...i,tooltip:JSON.parse(i.tooltip).map(clean)}]));
const itemByName = new Map();
for (const i of items.values()) {const k=clean(i.name).toLowerCase();itemByName.set(k,[...(itemByName.get(k)??[]),i]);}
const variants = db.prepare('SELECT itemId, variants FROM ItemTooltipVariant').all();
const nominalCircuitTiers=new Map();
for(const row of db.prepare("SELECT DISTINCT itemId,alternatives FROM Ingredient WHERE itemId LIKE 'dreamcraft:item.Circuit%' OR alternatives LIKE '%dreamcraft:item.Circuit%'").all()){
 const ids=[row.itemId,...JSON.parse(row.alternatives)];
 const tier=tiers.find(t=>ids.includes(`dreamcraft:item.Circuit${t}`));
 if(tier)for(const id of ids)nominalCircuitTiers.set(id,Math.min(nominalCircuitTiers.get(id)??Infinity,tiers.indexOf(tier)));
}
const voltageTier = eu => eu<=0 ? -1 : Math.min(14,Math.max(0,Math.ceil(Math.log(eu/8)/Math.log(4)-1e-9)));
const producers = db.prepare("SELECT DISTINCT r.id,r.handler,r.euPerTick,r.details,r.layout FROM Recipe r JOIN Ingredient i ON i.recipeId=r.id WHERE i.itemId=? AND i.direction='output' AND r.enabled=1");
const ingredients = db.prepare("SELECT itemId,slot,amount,consumed,alternatives FROM Ingredient WHERE recipeId=? AND direction='input'");
const cache = new Map();
function recipes(id) {
  if(cache.has(id)) return cache.get(id);
  const rs=producers.all(id).map(r=>({...r,details:JSON.parse(r.details),layout:JSON.parse(r.layout),inputs:ingredients.all(r.id).map(i=>({...i,name:items.get(i.itemId)?.name??i.itemId,alternatives:JSON.parse(i.alternatives)}))}));
  cache.set(id,rs);return rs;
}
const tierPattern = /\b(ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\b/g;
function explicitTier(item) {
  if(!item)return -1;
  const name=clean(item.name);
  // Circuit labels are nominal tier evidence, not proof of production voltage.
  // Roman model numbers (e.g. Fluid Drilling Rig IV) are not voltage labels.
  let ts= /(?:circuit|casing|hull|motor|pump|piston|robot arm|conveyor|sensor|emitter|field generator|energy hatch|dynamo|capacitor)/i.test(name)
    ? [...name.matchAll(tierPattern)].map(m=>tiers.indexOf(m[1])) : [];
  if(nominalCircuitTiers.has(item.id))ts.push(nominalCircuitTiers.get(item.id));
  const power=item.tooltip.join(' ').match(/Voltage IN:\s*([\d,]+)/i);
  if(power)ts.push(voltageTier(Number(power[1].replaceAll(',',''))));
  return ts.length?Math.max(...ts):-1;
}
function inputTier(i) {return Math.min(...[...new Set([i.itemId,...i.alternatives])].map(id=>explicitTier(items.get(id))));}
const questDir=path.join(game,'config/betterquesting/DefaultQuests/Quests');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const quests=[];
for(const file of files(questDir).filter(f=>f.endsWith('.json'))){
  // Preserve long quest IDs exactly: they exceed JavaScript's safe integer range.
  const raw=fs.readFileSync(file,'utf8').replace(/("questID(?:High|Low):4"\s*:\s*)(-?\d+)/g,'$1"$2"');
  const q=JSON.parse(raw), p=q['properties:10']?.['betterquesting:10'];if(!p)continue;
  const key=x=>`${x['questIDHigh:4']}:${x['questIDLow:4']}`;
  const required=[];
  function walk(v){if(!v||typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(k==='requiredItems:9')for(const t of Object.values(x)){if(t['id:8'])required.push(t['id:8']+(t['Damage:2']?`:${t['Damage:2']}`:''));}else walk(x);}}
  walk(q['tasks:9']);
  quests.push({id:key(q),name:p['name:8'],description:p['desc:8'],file:path.relative(game,file).replaceAll('\\','/'),parents:Object.values(q['preRequisites:9']??{}).map(key),required});
}
const qmap=new Map(quests.map(q=>[q.id,q]));
const gateNames={'High Voltage Multiblocks':'HV','Extreme Voltage Multiblocks':'EV','Insane Voltage Multiblocks':'IV'};
function questGate(q, seen=new Set()) {if(seen.has(q.id))return [];seen.add(q.id);if(gateNames[q.name])return [gateNames[q.name]];return q.parents.flatMap(id=>qmap.has(id)?questGate(qmap.get(id),seen):[]);}
const controllers=[];
for(const v of variants){
 const variant=JSON.parse(v.variants);const structure=(variant['1']??[]).map(clean);
 const item=items.get(v.itemId);if(!item)continue;
 if(!structure.some(x=>/Structure:/.test(x))&&!item.tooltip.some(x=>/structure guidelines/i.test(x)))continue;
 const allRecipes=recipes(item.id);
 // NEI scanner/research displays show the future product, not a craftable output.
 const rs=allRecipes.filter(r=>!['Scanner','Research Station'].includes(r.handler));
 const evidence=rs.map(r=>({recipeId:r.id,handler:r.handler,euPerTick:r.euPerTick,nominalRecipeTier:tiers[voltageTier(r.euPerTick)]??null,details:r.details,machineIds:r.layout.machineIds??[],inputs:r.inputs.map(i=>({...i,nominalTier:tiers[inputTier(i)]??null}))}));
 const matches=quests.filter(q=>q.required.includes(item.id)).map(q=>({name:q.name,file:q.file,gates:[...new Set(questGate(q))]}));
 const ingredientTiers=evidence.map(r=>Math.max(-1,...r.inputs.map(i=>tiers.indexOf(i.nominalTier))));
 const structureItems=[];
 for(const line of structure){
  const label=line.trim().replace(/^\d+\s*x\s*/,'').split(':')[0].replace(/\s*\(.*\)\s*$/,'').trim();
  const match=itemByName.get(label.toLowerCase());
  if(match?.some(i=>i.id!==item.id))structureItems.push({line,items:match.filter(i=>i.id!==item.id).map(i=>({id:i.id,name:i.name}))});
 }
 controllers.push({id:item.id,name:clean(item.name),nominalComponentTier:tiers[Math.min(...ingredientTiers)]??null,tooltip:item.tooltip,structure,structureItems,recipes:evidence,researchDisplays:allRecipes.filter(r=>['Scanner','Research Station'].includes(r.handler)).map(r=>({recipeId:r.id,handler:r.handler,euPerTick:r.euPerTick,inputs:r.inputs})),quests:matches});
}
controllers.sort((a,b)=>a.name.localeCompare(b.name));
const result={version:'2.8.4',method:'Evidence inventory; nominal component tiers are not proven earliest-build tiers.',catalogInfo:db.prepare('SELECT * FROM CatalogInfo').all(),controllers};
fs.writeFileSync(`${output}/inventory.json`,JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(`${output}/quests.json`,JSON.stringify(quests,null,2)+'\n');
console.log(JSON.stringify({controllers:controllers.length,withRecipes:controllers.filter(c=>c.recipes.length).length,withComponentTier:controllers.filter(c=>c.nominalComponentTier).length,structureMatched:controllers.filter(c=>c.structureItems.length).length}));
for(const c of controllers) console.log(`${c.nominalComponentTier??'?'}\t${c.name}\t${c.id}\t${[...new Set(c.quests.flatMap(q=>q.gates))].join(',')}`);
db.close();
