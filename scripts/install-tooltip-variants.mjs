import fs from 'node:fs';
import Database from 'better-sqlite3';
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'data/extraction/instance/minecraft/dumps/planner/tooltip-variants.json'));
const db = new Database('data/catalogs/gtnh-2.8.4.sqlite');
db.pragma('foreign_keys=ON');
const ids = new Set(db.prepare('SELECT id FROM Item').all().map(i=>i.id));
let installed=0;
db.transaction(()=>{
 db.exec('CREATE TABLE IF NOT EXISTS ItemTooltipVariant (itemId TEXT PRIMARY KEY REFERENCES Item(id) ON DELETE CASCADE, variants TEXT NOT NULL)');
 const insert=db.prepare('INSERT INTO ItemTooltipVariant (itemId,variants) VALUES (?,?) ON CONFLICT(itemId) DO UPDATE SET variants=excluded.variants');
 for(const [id,states] of Object.entries(raw)){
  if(!ids.has(id))continue;
  const variants=Object.fromEntries(Object.entries(states).filter(([key,text])=>/^[0-7]$/.test(key)&&typeof text==='string'&&text!=='ERROR').map(([key,text])=>[key,text.split('<br>')]));
  if(Object.keys(variants).length<2)continue;
  insert.run(id,JSON.stringify(variants));installed++;
 }
})();
console.log(`Installed modifier tooltips for ${installed} catalog items.`);db.close();
