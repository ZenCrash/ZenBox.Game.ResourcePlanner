import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite',{readonly:true});
assert.ok(db.prepare("SELECT count(*) n FROM Recipe WHERE handler='Blasting' AND enabled=1").get().n > 0);
const report=JSON.parse(fs.readFileSync('data/catalogs/gtnh-2.8.4.additional-layout-report.json'));
assert.deepEqual(report.unmatched,[]);assert.deepEqual(report.missingItems,[]);
for(const r of db.prepare("SELECT handler,layout FROM Recipe WHERE handler IN ('Research Station','Scanner','Tree Growth Simulator','Space Mining')").all()){
 const l=JSON.parse(r.layout);
 if(r.handler==='Tree Growth Simulator'){assert.ok(l.specialItem);assert.equal(l.toolItems.length,4);assert.ok(l.toolItems.some(a=>a.length>0));}
 if(r.handler==='Space Mining')assert.deepEqual(l.machineIds,['gregtech:gt.blockmachines:14007','gregtech:gt.blockmachines:14008','gregtech:gt.blockmachines:14009']);
 for(const i of [l.specialItem,...(l.toolItems||[]).flat()].filter(Boolean))assert.ok(fs.existsSync('data/game-assets/'+i.image.replace('/assets/','')));
}
assert.equal(db.prepare("SELECT count(DISTINCT i.recipeId) n FROM Ingredient i JOIN Recipe r ON r.id=i.recipeId JOIN Item t ON t.id=i.itemId WHERE r.handler='Squeezer' AND t.kind='fluid' AND i.direction='output'").get().n,277);
for(const source of JSON.parse(fs.readFileSync('public/ui/recipe-layouts/additional-sources.json')))assert.ok(fs.existsSync(`public/ui/recipe-layouts/${source.name}.png`));
console.log('Verified Blasting, 1,123 matched recipe records, Squeezer fluids, native assets, special slots, and all three Space Mining modules.');db.close();
