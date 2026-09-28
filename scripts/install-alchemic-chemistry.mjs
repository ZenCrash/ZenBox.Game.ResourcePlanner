import fs from 'node:fs';
import Database from 'better-sqlite3';

// Exported from Blood Magic's own NEI handler, including its LP conversion.
const raw=JSON.parse(fs.readFileSync('data/extraction/instance/minecraft/dumps/planner/alchemy-recipes.json','utf8'));
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite');
const recipes=db.prepare("SELECT * FROM Recipe WHERE handler='Alchemic Chemistry Set'").all();
const plans=recipes.map(recipe=>{
  const ingredients=db.prepare('SELECT * FROM Ingredient WHERE recipeId=?').all(recipe.id);
  const inputs=ingredients.filter(i=>i.direction==='input'&&i.slot<5);
  const output=ingredients.find(i=>i.direction==='output');
  const matches=raw.filter(row=>row.outputs.some(i=>i.id===output?.itemId&&i.amount===output.amount)&&row.inputs.length===inputs.length&&row.inputs.every((i,slot)=>{
    const old=inputs.find(j=>j.slot===slot);
    return old&&old.amount===i.amount&&[old.itemId,...JSON.parse(old.alternatives)].includes(i.id);
  }));
  if(matches.length!==1)throw new Error(`${recipe.id}: expected one runtime match, got ${matches.length}`);
  const row=matches[0],orb=row.orbs[0];
  if(!Number.isFinite(row.lp)||!orb)throw new Error(`Missing LP/orb: ${recipe.id}`);
  const alternatives=[...new Set([orb.id,...(orb.alternatives??[]).map(i=>i.id)])];
  for(const id of alternatives)if(!db.prepare('SELECT id FROM Item WHERE id=?').get(id))throw new Error(`Missing orb item ${id}`);
  return {recipe,row,orb,alternatives};
});
if(process.argv.includes('--apply'))db.transaction(()=>{
  const update=db.prepare('UPDATE Recipe SET layout=?,details=? WHERE id=?');
  const insert=db.prepare('INSERT INTO Ingredient (recipeId,itemId,direction,amount,chance,consumed,slot,x,y,alternatives) VALUES (?, ?, \'input\',0,1,0,5,136,47,?)');
  for(const {recipe,row,orb,alternatives} of plans){
    const layout={...JSON.parse(recipe.layout),lifeEssence:row.lp};
    const details=JSON.parse(recipe.details).filter(s=>s!=='Additional handler slots require classification; see extraction report.');
    update.run(JSON.stringify(layout),JSON.stringify(details),recipe.id);
    const old=db.prepare("SELECT id FROM Ingredient WHERE recipeId=? AND direction='input' AND slot=5").get(recipe.id);
    const id=old?.id??insert.run(recipe.id,orb.id,JSON.stringify(alternatives)).lastInsertRowid;
    for(const alternative of alternatives)db.prepare('INSERT OR IGNORE INTO IngredientVariant (ingredientId,itemId) VALUES (?,?)').run(id,alternative);
  }
})();
console.log(`${process.argv.includes('--apply')?'Updated':'Validated'} ${plans.length} Alchemic Chemistry Set recipes; LP range ${Math.min(...plans.map(p=>p.row.lp))}–${Math.max(...plans.map(p=>p.row.lp))}. Blood orbs are not consumed.`);
db.close();
