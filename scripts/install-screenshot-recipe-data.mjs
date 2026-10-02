import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
const root='data/extraction/instance/minecraft/dumps/planner';
const rows=JSON.parse(fs.readFileSync(`${root}/layout-recipes.json`));
const portraits=JSON.parse(fs.readFileSync(`${root}/portrait-recipes.json`));
for(const r of rows.filter(r=>r.handler==='Mob Info')){const p=portraits.find(p=>p.fields.mobname===r.fields.mobname&&p.fields.localizedName===r.fields.localizedName);if(p){r.additionalInformation=p.additionalInformation;r.portrait=p.portrait;}}
const rawItems=JSON.parse(fs.readFileSync(`${root}/layout-items.json`));
const icons=JSON.parse(fs.readFileSync(`${root}/layout-icons.json`));
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite');db.pragma('foreign_keys=ON');
const hash=s=>createHash('sha256').update(s).digest('hex');
const item=db.prepare('SELECT * FROM Item WHERE id=?');
const ingredient=db.prepare('INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,x,y,alternatives) VALUES (?,?,?,?,?,?,?,?,?,?)');
const cachedIngredients=new Map();for(const i of db.prepare("SELECT Ingredient.* FROM Ingredient JOIN Recipe ON Recipe.id=Ingredient.recipeId WHERE handler IN ('Mob Info','SAG Mill','Arcane Infusion') ORDER BY slot").all()){const list=cachedIngredients.get(i.recipeId)??[];list.push(i);cachedIngredients.set(i.recipeId,list);}const getIngredients={all:id=>cachedIngredients.get(id)??[]};
const update=db.prepare('UPDATE Recipe SET layout=?,details=? WHERE id=?');
const recipes=db.prepare('SELECT * FROM Recipe WHERE handler=?');
const report={mob:0,sag:0,infusion:0,coke:0,unmatchedInfusion:0,missingPortraits:[]};
fs.mkdirSync('data/game-assets/gtnh-2.8.4/mobs',{recursive:true});
// Preserve existing item art. Only install genuinely missing variants from runtime renders.
db.transaction(()=>{for(const r of rawItems)if(!item.get(r.id)) {
  const filename=icons[r.id];if(!filename)throw Error('Missing exported icon '+r.id);
  const target=hash(r.id)+'.png';fs.copyFileSync(`${root}/layout-icons/${filename}`,`data/game-assets/gtnh-2.8.4/items/${target}`);
  db.prepare('INSERT INTO Item (id,registryId,metadata,nbt,name,mod,"group",tooltip,image,hidden,sortOrder,kind) VALUES (?,?,?,?,?,?,?,?,?,1,0,\'item\')').run(r.id,r.registryId,r.metadata,r.nbt,r.name,r.registryId.split(':')[0],r.registryId.split(':')[0],JSON.stringify(r.tooltip.split('<br>')),`/assets/gtnh-2.8.4/items/${target}`);
}
})();
function add(rid,r,direction,slot,chance=1){if(!item.get(r.id))throw Error('Missing item '+r.id);ingredient.run(rid,r.id,direction,r.amount,chance,1,slot,r.x??null,r.y??null,JSON.stringify((r.alternatives??[]).map(a=>a.id).filter(id=>item.get(id))));}
function ids(r){return new Set([r.id,...(r.alternatives??[]).map(a=>a.id)]);}
const mobRecipes=recipes.all('Mob Info');
const assignedMobs=new Set();
const sagRecipes=recipes.all('SAG Mill');
const sagByOutput=new Map();for(const p of sagRecipes)for(const i of getIngredients.all(p.id).filter(i=>i.direction==='output')){const list=sagByOutput.get(i.itemId)??[];list.push(p);sagByOutput.set(i.itemId,list);}
const supplement=fs.existsSync(`${root}/layout-supplement.json`)?JSON.parse(fs.readFileSync(`${root}/layout-supplement.json`)):[];
const infusion=[...rows,...supplement].filter(r=>r.handler==='Arcane Infusion');
db.transaction(()=>{

  for(const r of rows){
    if(r.handler==='Mob Info'){
      const allIds=new Set(r.inputs.flatMap(i=>[...ids(i)]));
      let old=mobRecipes.find(p=>!assignedMobs.has(p.id)&&JSON.parse(p.layout).mob?.entityId===r.fields.mobname&&JSON.parse(p.layout).mob?.name===r.fields.localizedName)??mobRecipes.find(p=>!assignedMobs.has(p.id)&&getIngredients.all(p.id).some(i=>i.direction==='input'&&item.get(i.itemId)?.nbt.includes('mobType:"'+r.fields.mobname+'"')));
      if(!old){const id=hash('mobsinfo:'+r.fields.mobname+':'+r.fields.localizedName);db.prepare("INSERT OR IGNORE INTO Recipe (id,name,handler,durationTicks,euPerTick,enabled,layout,details) VALUES (?, 'Mob Info','Mob Info',0,0,1,'{}','[]')").run(id);old=db.prepare('SELECT * FROM Recipe WHERE id=?').get(id);if(!db.prepare('SELECT id FROM Ingredient WHERE recipeId=?').get(id))r.inputs.forEach((i,n)=>add(id,i,'input',n));}
      assignedMobs.add(old.id);
      db.prepare("DELETE FROM Ingredient WHERE recipeId=? AND direction='output'").run(old.id);
      const groups={};r.drops.forEach((d,n)=>{add(old.id,d.stack,'output',n,d.chance/10000);(groups[d.type]??=[]).push(n)});
      let image;if(r.portrait){if(!process.argv.includes("--skip-portraits"))fs.copyFileSync(`${root}/mobs/${r.portrait}`,`data/game-assets/gtnh-2.8.4/mobs/${r.portrait}`);image=`/assets/gtnh-2.8.4/mobs/${r.portrait}`;}else report.missingPortraits.push(r.fields.mobname);
      const layout={...JSON.parse(old.layout),mob:{entityId:r.fields.mobname,name:r.fields.localizedName,mod:r.fields.mod,health:r.fields.maxHealth,infernal:r.fields.infernaltype,image,spawns:r.spawns,groups,dropTooltips:r.drops.map(d=>d.tooltip),dropDurability:r.drops.map(d=>{const m=d.stack.tooltip.match(/Durability: (\d+)\/(\d+)/);return m?Math.round(Number(m[1])/Number(m[2])*100):null;}),additionalInformation:r.additionalInformation??[],spawnItem:item.get(r.inputs.flatMap(i=>[...ids(i)]).find(id=>id.startsWith("minecraft:spawn_egg"))??"")}};
      update.run(JSON.stringify(layout),old.details,old.id);report.mob++;
    }
    if(r.handler==='SAG Mill') {
      const targets=[...new Set(r.outputs.flatMap(o=>sagByOutput.get(o.id)??[]))].filter(p=>{const gi=getIngredients.all(p.id);return r.inputs.filter(a=>a.x===74).every(a=>gi.some(b=>b.direction==='input'&&b.x===74&&ids(a).has(b.itemId)))&&r.outputs.some(a=>gi.some(b=>b.direction==='output'&&a.id===b.itemId));});
      for(const old of targets){const layout={...JSON.parse(old.layout),energy:r.fields.energy};update.run(JSON.stringify(layout),JSON.stringify(JSON.parse(old.details).filter(s=>!s.startsWith('Additional handler slots'))),old.id);
        if(r.outputChances){const outputs=[...r.outputs,...r.other].sort((a,b)=>a.x-b.x);db.prepare("DELETE FROM Ingredient WHERE recipeId=? AND direction='output'").run(old.id);outputs.forEach((o,n)=>add(old.id,o,'output',n,r.outputChances[n]??1));}
        report.sag++;
      }
    }
    if(r.handler==='Coke Oven'){
      const id=hash('railcraft.cokeoven:'+JSON.stringify([r.inputs,r.outputs,null]));
      const superseded=hash('railcraft.cokeoven:'+JSON.stringify([r.inputs,r.outputs,r.fluid]));if(superseded!==id)db.prepare('UPDATE Recipe SET enabled=0 WHERE id=?').run(superseded);
      db.prepare('INSERT OR IGNORE INTO Recipe (id,name,handler,durationTicks,euPerTick,enabled,layout,details) VALUES (?,\'Coke Oven\',\'Coke Oven\',?,0,1,?,\'[]\')').run(id,r.fields.cookTime,JSON.stringify({machineIds:['Railcraft:machine.alpha:7']}));
      db.prepare('DELETE FROM Ingredient WHERE recipeId=?').run(id);r.inputs.forEach((i,n)=>add(id,i,'input',n));r.outputs.forEach((i,n)=>add(id,i,'output',n));if(r.fluid)add(id,r.fluid,'output',r.outputs.length);report.coke++;
    }
  }
  for(const old of recipes.all('Arcane Infusion')){
    const gi=getIngredients.all(old.id),output=gi.find(i=>i.direction==='output'),center=gi.find(i=>i.direction==='input'&&i.x===75&&i.y===58);
    let matches=infusion.filter(r=>r.outputs.some(i=>i.id===output?.itemId)&&r.inputs.some(i=>ids(i).has(center?.itemId)));
    if(!matches.length){const base=id=>id.replace(/^(thaumicbases:revolver):\d+/, '$1').replace(/_[A-Za-z0-9]{15}$/,'');const signature=items=>items.filter(i=>!base(i.itemId??i.id).startsWith('thaumcraftneiplugin:Aspect')).map(i=>base(i.itemId??i.id)+':'+i.amount).sort().join('|');const sig=signature(gi.filter(i=>i.direction==='input'));matches=infusion.filter(r=>r.outputs.some(i=>base(i.id)===base(output?.itemId??''))&&signature(r.inputs)===sig);}
    const values=new Set(matches.map(r=>r.fields.instability).filter(v=>v!=null));
    if(values.size===1){update.run(JSON.stringify({...JSON.parse(old.layout),instability:[...values][0]}),old.details,old.id);report.infusion++;}else report.unmatchedInfusion++;
  }
  for(const old of recipes.all('Assemblyline Process')){const gi=db.prepare('SELECT * FROM Ingredient WHERE recipeId=? ORDER BY slot').all(old.id);const matches=supplement.filter(r=>r.handler==='Assemblyline Process' && r.research && r.outputs.some(o=>gi.some(i=>i.direction==='output'&&i.itemId===o.id)) && r.inputs.every(a=>gi.some(b=>b.direction==='input'&&a.id===b.itemId&&a.amount===b.amount)));const researchIds=new Set(matches.map(r=>r.research.id));if(researchIds.size===1){const research=item.get([...researchIds][0]);if(research)update.run(JSON.stringify({...JSON.parse(old.layout),researchItem:research}),old.details,old.id);}}
  // New variants must also participate in usage lookup.
  db.exec(`INSERT OR IGNORE INTO IngredientVariant (ingredientId,itemId) SELECT Ingredient.id,json_each.value FROM Ingredient,json_each(Ingredient.alternatives) WHERE recipeId IN (SELECT id FROM Recipe WHERE handler IN ('Mob Info','SAG Mill','Coke Oven'))`);
})();
const tabPath='data/catalogs/gtnh-2.8.4.recipe-tab-icons.json',tabs=JSON.parse(fs.readFileSync(tabPath));
for(const [handler,id] of [['Arcane Infusion','Thaumcraft:blockStoneDevice:2'],['Crucible','Thaumcraft:blockMetalDevice'],['Mob Info','minecraft:diamond_sword']])if(!tabs.icons[handler]){const it=item.get(id);tabs.icons[handler]={image:it.image,itemId:id};}
if(!tabs.icons['TiC Bolt Molding'])tabs.icons['TiC Bolt Molding']={image:'/ui/recipe-layouts/bolt-tab.png'};
for(const [handler,icon] of Object.entries(tabs.icons).filter(([h])=>['Arcane Infusion','Crucible','Mob Info','TiC Bolt Molding'].includes(h)))for(const recipe of recipes.all(handler)){const layout=JSON.parse(recipe.layout);if(!layout.tabIcon)db.prepare('UPDATE Recipe SET layout=? WHERE id=?').run(JSON.stringify({...layout,tabIcon:icon.image}),recipe.id);}
fs.writeFileSync(tabPath,JSON.stringify(tabs,null,2)+'\n');
fs.writeFileSync('data/catalogs/gtnh-2.8.4.screenshot-layout-report.json',JSON.stringify(report,null,2)+'\n');
console.log(report);db.close();
