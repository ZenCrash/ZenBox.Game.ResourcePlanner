import fs from 'node:fs';
import Database from 'better-sqlite3';
const root='data/extraction/instance/minecraft/dumps/planner';
const rows=JSON.parse(fs.readFileSync(root+'/more-layouts.json'));
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite');db.pragma('foreign_keys=ON');
const item=db.prepare('SELECT * FROM Item WHERE id=?');
const base=db.prepare('SELECT * FROM Item WHERE registryId=? AND metadata=? AND image IS NOT NULL ORDER BY length(nbt) LIMIT 1');
const byRecipe=new Map();for(const i of db.prepare("SELECT i.* FROM Ingredient i JOIN Item t ON t.id=i.itemId JOIN Recipe r ON r.id=i.recipeId WHERE r.handler IN ('Research Station','Scanner','Tree Growth Simulator','Squeezer') AND t.kind!='fluid' ORDER BY i.slot").all()){const list=byRecipe.get(i.recipeId)||[];list.push(i);byRecipe.set(i.recipeId,list);}const ingredients={all:id=>byRecipe.get(id)||[]};
const displayCache=new Map();
const report={restoredBlasting:0,matched:{},unmatched:[],missingItems:[]};
function displayItem(r){if(!r)return undefined;if(displayCache.has(r.id))return displayCache.get(r.id);let existing=item.get(r.id);if(existing)return existing;let b=base.get(r.registryId,r.metadata);if(!b){report.missingItems.push(r.id);return undefined;}const result={...b,id:r.id,name:r.name,nbt:r.nbt,tooltip:JSON.stringify((r.tooltip||'').split('<br>'))};displayCache.set(r.id,result);return result;}
function matches(a,b){return a.length===b.length && a.every((i,n)=>i.itemId===b[n].id && i.amount===b[n].amount);}
const iconsPath='data/catalogs/gtnh-2.8.4.recipe-tab-icons.json';const icons=JSON.parse(fs.readFileSync(iconsPath));
const machines={'Space Mining':[14007,14008,14009],'Tree Growth Simulator':[836],'Heliothermal Plasma Fabric...':[15414]};
db.transaction(()=>{
  report.restoredBlasting=db.prepare("UPDATE Recipe SET enabled=1 WHERE handler='Blasting' AND enabled=0").run().changes;
  for(const h of ['Research Station','Scanner','Tree Growth Simulator','Squeezer']){
    const source=rows.filter(r=>r.handler===h);
    for(const recipe of db.prepare('SELECT * FROM Recipe WHERE handler=?').all(h)){
      const ins=ingredients.all(recipe.id).filter(i=>i.direction==='input'),outs=ingredients.all(recipe.id).filter(i=>i.direction==='output');
      const raw=source.find(r=>h==='Squeezer' ? ins.length===r.inputs.length && ins.every((i,n)=>[r.inputs[n].id,...r.inputs[n].alternatives.map(a=>a.id)].includes(i.itemId)) && outs.every(i=>r.outputs.some(o=>o.id===i.itemId)) : matches(ins,r.inputs)&&matches(outs,r.outputs));
      if(!raw){report.unmatched.push([h,recipe.id]);continue;}
      let layout=JSON.parse(recipe.layout);layout.specialItem=displayItem(raw.special);
      if(raw.tools)layout.toolItems=raw.tools.map(variants=>variants.map(displayItem).filter(Boolean));
      if(h==='Squeezer'){
        const index=raw.container?raw.inputs[0].alternatives.findIndex(a=>a.id===ins[0].itemId):0;
        const fluid=raw.fluids[Math.max(0,index)];
        if(fluid && item.get(fluid.id)){
          db.prepare("DELETE FROM Ingredient WHERE recipeId=? AND itemId IN (SELECT id FROM Item WHERE kind='fluid')").run(recipe.id);
          db.prepare("INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,x,y,alternatives) VALUES (?,?,'output',?,1,1,0,NULL,NULL,'[]')").run(recipe.id,fluid.id,fluid.amount);
        }else report.missingItems.push(fluid?.id);
      }
      db.prepare('UPDATE Recipe SET layout=? WHERE id=?').run(JSON.stringify(layout),recipe.id);report.matched[h]=(report.matched[h]||0)+1;
    }
  }
  for(const [h,ids]of Object.entries(machines))for(const recipe of db.prepare('SELECT id,layout FROM Recipe WHERE handler=?').all(h)){let l=JSON.parse(recipe.layout);l.machineIds=ids.map(n=>'gregtech:gt.blockmachines:'+n);l.tabIcon ||= item.get(l.machineIds[0]).image;db.prepare('UPDATE Recipe SET layout=? WHERE id=?').run(JSON.stringify(l),recipe.id);icons.icons[h] ||= {image:l.tabIcon,itemId:l.machineIds[0]};}
  for(const recipe of db.prepare("SELECT id,layout FROM Recipe WHERE handler='Forge Hammer Recycling'").all()){let l=JSON.parse(recipe.layout);l.tabIcon ||= '/ui/recipe-layouts/hammer-recycling-tab.png';db.prepare('UPDATE Recipe SET layout=? WHERE id=?').run(JSON.stringify(l),recipe.id);}
  icons.icons['Forge Hammer Recycling'] ||= {image:'/ui/recipe-layouts/hammer-recycling-tab.png',handlerId:'gt.recipe.category.forge_hammer_recycling'};
})();
fs.writeFileSync(iconsPath,JSON.stringify(icons,null,2)+'\n');fs.writeFileSync('data/catalogs/gtnh-2.8.4.additional-layout-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));db.close();
