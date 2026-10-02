import fs from 'node:fs';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite',{readonly:true});
assert.ok(db.prepare("SELECT count(*) n FROM Recipe WHERE handler='Blasting' AND enabled=1").get().n > 0);
const mobs=db.prepare("SELECT * FROM Recipe WHERE handler='Mob Info' AND enabled=1").all();
assert.equal(mobs.length,401);
for(const r of mobs){const m=JSON.parse(r.layout).mob;assert.ok(m?.name);const outputs=db.prepare("SELECT * FROM Ingredient WHERE recipeId=? AND direction='output' ORDER BY slot").all(r.id);const indices=Object.values(m.groups).flat();assert.equal(indices.length,outputs.length);assert.equal(new Set(indices).size,outputs.length);assert.equal(m.dropTooltips.length,outputs.length);assert.ok(m.spawns.every(s=>typeof s==='string'));if(m.image)assert.ok(fs.existsSync(m.image.replace('/assets/','data/game-assets/')));}
const coke=db.prepare("SELECT * FROM Recipe WHERE handler='Coke Oven' AND enabled=1 AND euPerTick=0").all();assert.equal(coke.length,79);assert.equal(db.prepare("SELECT count(*) n FROM Ingredient i JOIN Recipe r ON r.id=i.recipeId JOIN Item t ON t.id=i.itemId WHERE r.handler='Coke Oven' AND r.enabled=1 AND r.euPerTick=0 AND t.kind='fluid'").get().n,78);
const sag=db.prepare("SELECT * FROM Recipe WHERE handler='SAG Mill' AND enabled=1").all();for(const r of sag)assert.ok(Number.isFinite(JSON.parse(r.layout).energy));
assert.equal(db.prepare("SELECT count(*) n FROM Recipe WHERE handler='Arcane Infusion' AND enabled=1 AND json_extract(layout,'$.instability') IS NULL").get().n,0);
assert.equal(new Set(mobs.map(r=>JSON.parse(r.layout).mob.entityId+":"+JSON.parse(r.layout).mob.name)).size,401);
const icons=JSON.parse(fs.readFileSync('data/catalogs/gtnh-2.8.4.recipe-tab-icons.json')).icons;for(const h of ['Mob Info','Crucible','Arcane Infusion','TiC Bolt Molding'])assert.ok(icons[h].image);
console.log(`Verified ${mobs.length} mob entries, drop tooltips/groups, ${coke.length} Railcraft coke recipes, ${sag.length} SAG energy values, tab icons, and Blasting availability.`);db.close();
