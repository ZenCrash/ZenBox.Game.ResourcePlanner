// Quest-order classification, not a proof of earliest mechanical availability.
// Game files are read only. Unverified old recipe-tier hints are never anchors.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const game='C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons/minecraft';
const source=JSON.parse(fs.readFileSync('docs/research/gtnh-multiblock-progression.json','utf8'));
const tiers=['Stone','Steam','ULV','LV','MV','HV','EV','IV','LuV','ZPM','UV','UHV','UEV','UIV','UMV','UXV'];
const clean=s=>s.replace(/§./g,'');
const quests=JSON.parse(fs.readFileSync('data/research/multiblock-progression/quests.json','utf8'));
const map=new Map(quests.map(q=>[q.id,q])), children=new Map();
for(const q of quests){
 const json=JSON.parse(fs.readFileSync(path.join(game,q.file),'utf8'));
 q.logic=json['properties:10']['betterquesting:10']['questLogic:8']??'AND';
 q.name=clean(q.name);
 q.excluded=/\/(?:BeeBreeding|HowtoBee)-/.test(q.file)||/crop.*(?:mutation|breeding)|(?:mutation|breeding).*crop/i.test(q.name);
 q.chapter=q.file.match(/\/Tier\d+(LuV|UHV|UEV|UIV|UMV|UXV|ZPM|UV|LV|MV|HV|EV|IV)-/)?.[1]
  ??(/\/Tier05Steam-/.test(q.file)?'Steam':/\/Tier0StoneAge-/.test(q.file)?'Stone':null);
 const gate=q.name.match(/^Tier \d+ \((LuV|UHV|UEV|UIV|UMV|UXV|ZPM|UV|LV|MV|HV|EV|IV)\)$/)?.[1];
 q.anchor=gate??({'Welcome to Tier 1, LV':'LV','Welcome to Tier 0.5, Steam!':'Steam','High Voltage Multiblocks':'HV','Extreme Voltage Multiblocks':'EV','Insane Voltage Multiblocks':'IV'}[q.name])??q.chapter;
 for(const parent of q.parents){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(q.id);}
}
// Fixed point handles prerequisite cycles without recursion or free-material assumptions.
const rank=new Map(quests.map(q=>[q.id,q.excluded?-1:tiers.indexOf(q.anchor)]));
const placement=new Map(rank);
let iterations=0,changed=true;
while(changed&&iterations++<quests.length){
 changed=false;
 for(const q of quests){
  if(q.excluded)continue;
  const ps=q.parents.map(id=>rank.get(id)??-1);
  const inherited=ps.length?(q.logic==='OR'?Math.min(...ps):Math.max(...ps)):-1;
  const next=Math.max(tiers.indexOf(q.anchor),inherited);
  if(next>rank.get(q.id)){rank.set(q.id,next);changed=true;}
  const contextual=Math.max(tiers.indexOf(q.anchor),...q.parents.map(id=>placement.get(id)??-1));
  if(contextual>placement.get(q.id)){placement.set(q.id,contextual);changed=true;}
 }
}
if(changed)throw Error('Quest inference did not converge');
const controllerIds=new Set(source.controllers.map(c=>c.id));
const questMachines=new Map(quests.map(q=>[q.id,q.required.filter(id=>controllerIds.has(id))]));
function neighbours(q,direction){
 const queue=(direction==='before'?q.parents:children.get(q.id)??[]).map(id=>({id,distance:1}));
 const seen=new Set([q.id]),found=[];
 for(let i=0;i<queue.length;i++){
  const {id,distance}=queue[i];if(seen.has(id))continue;seen.add(id);
  const n=map.get(id);if(!n||n.excluded)continue;
  if(n.anchor||questMachines.get(id)?.length){found.push({quest:n.name,questId:id,distance,tier:tiers[placement.get(id)]??null,anchor:n.anchor??null,machines:questMachines.get(id)});continue;}
  for(const next of direction==='before'?n.parents:children.get(id)??[])queue.push({id:next,distance:distance+1});
 }
 return found.sort((a,b)=>a.distance-b.distance||a.quest.localeCompare(b.quest));
}
const fixedNames=new Set(['Deep Earth Heating Pump','High Temperature Gas-cooled Reactor','Thorium High Temperature Reactor','Static Network Switch With QoS','Large Molecular Assembler']);
const controllers=source.controllers.map(c=>{
 const matches=quests.filter(q=>q.required.includes(c.id)&&!q.excluded);
 const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 const exact=matches.filter(q=>norm(q.name)===norm(c.name));
 const exclusive=matches.filter(q=>new Set(questMachines.get(q.id)).size===1);
 const preferred=exact.length?exact:exclusive.length?exclusive:matches;
 const usable=preferred.filter(q=>placement.get(q.id)>=0);
 const earliest=usable.length?Math.min(...usable.map(q=>placement.get(q.id))):-1;
 const selected=usable.filter(q=>placement.get(q.id)===earliest);
 const records=matches.map(q=>({id:q.id,name:q.name,file:q.file,logic:q.logic,chapter:q.chapter,stage:tiers[placement.get(q.id)]??null,earliestQuestUnlockHint:tiers[rank.get(q.id)]??null,parents:q.parents.map(id=>({id,name:map.get(id)?.name??'Missing quest',stage:tiers[placement.get(id)]??null})),before:neighbours(q,'before'),after:neighbours(q,'after')}));
 const requiredMachineClasses=c.controllerEvidence.map(r=>Math.max(-1,...r.physical.filter(p=>p.kind==='required machine voltage class').map(p=>tiers.indexOf(p.tier))));
 const machineFloor=requiredMachineClasses.length?Math.min(...requiredMachineClasses):-1;
 const conflicts=machineFloor>earliest&&earliest>=0?[`Quest placement ${tiers[earliest]} precedes a required ${tiers[machineFloor]} machine/hull class in controller recipes; quest tier is retained as an assumption, not a verified construction tier.`]:[];
 if(c.name==='Decay Warehouse')conflicts.push('Required Radiation Proof Machine Casing is manufactured at 7,680 EU/t; an EV multi-amp manufacturing route has not been verified.');
 const textMentions=matches.length?[]:quests.filter(q=>!q.excluded&&(q.name+' '+q.description).toLowerCase().includes(c.name.toLowerCase())).map(q=>({name:q.name,id:q.id,stage:tiers[placement.get(q.id)]??null,file:q.file,note:'Mention only; does not establish construction availability.'}));
 const mentionRanks=textMentions.map(q=>tiers.indexOf(q.stage)).filter(rank=>rank>=0);
 const assumedRank=earliest>=0?earliest:mentionRanks.length?Math.min(...mentionRanks):-1;
 return {id:c.id,name:c.name,questStage:tiers[earliest]??null,displayStage:tiers[assumedRank]??null,assignmentBasis:earliest>=0?'Assumed from retrieval quest placement':assumedRank>=0?'Assumed from tiered quest text mention':'No identifiable tiered quest placement',conflicts,basis:selected.map(q=>q.id),records,textMentions,
  excludedFromDisplay:/^(Compact Fusion Computer|Fusion Control Computer|FusionTech|Electric Air Filter|Void Miner)/.test(c.name)||fixedNames.has(c.name),
  classification:'Questbook placement, not proven earliest self-sufficient build tier',
  mechanicalEarliestTier:null};
});
const report={version:'2.8.4',method:'Questbook placement, NOT earliest unlock. Prefer exact-name quests, then quests retrieving only one distinct controller, then broader quests. Tier chapters/named tier-entry gates anchor placement. The latest tier reference in ancestry supplies contextual placement, including alternative parents; it is not a claim that all OR parents are required. The separate earliestQuestUnlockHint respects AND/OR. When retrieval placement is unavailable, use the earliest identifiable tiered exact-name text mention. Recipe conflicts do not block an assumed quest tier. Predecessors/successors are recorded as context, never treated as a manufacturing proof.',assumptions:{...source.assumptions,acceptQuestPlacementAsAssumedTier:true,allowTieredTextMentions:true},iterations,controllers};
fs.writeFileSync('docs/research/gtnh-multiblock-quest-tiers.json',JSON.stringify(report,null,2)+'\n');
// Small runtime table: keep the full research graph out of the wizard bundle.
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite',{readonly:true});
const coils=db.prepare("SELECT id, name, tooltip FROM Item WHERE id LIKE 'gregtech:gt.blockcasings5%'").all().map(item=>{
 const matches=quests.filter(q=>!q.excluded&&q.required.includes(item.id)&&placement.get(q.id)>=0);
 const upgrades=matches.filter(q=>/Coil Upgrade/i.test(q.name));
 const preferred=upgrades.length?upgrades:matches;
 const questRank=preferred.length?Math.min(...preferred.map(q=>placement.get(q.id))):-1;
 const recipes=db.prepare("SELECT r.euPerTick FROM Recipe r JOIN Ingredient i ON i.recipeId=r.id WHERE i.itemId=? AND i.direction='output' AND r.handler!='Research Station'").all(item.id);
 const recipeRank=recipes.length?2+Math.max(0,Math.ceil(Math.log(Math.max(1,Math.min(...recipes.map(r=>r.euPerTick)))/8)/Math.log(4))):-1;
 const tier=tiers[Math.max(questRank,recipeRank)]??null;
 return {id:item.id,name:item.name,heat:Number(clean(item.tooltip).match(/Base Heating Capacity\s*=\s*(\d+)/)?.[1]??0),tier,quests:preferred.map(q=>q.id)};
});
db.close();
fs.writeFileSync('lib/multiblock-progression.json',JSON.stringify({version:report.version,basis:'Assumed quest progression tiers',controllers:controllers.map(c=>({id:c.id,name:c.name,tier:c.displayStage})),coils},null,2)+'\n');
const escape=s=>String(s??'Unresolved').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const shown=controllers.filter(c=>!c.excludedFromDisplay).sort((a,b)=>(a.displayStage?tiers.indexOf(a.displayStage):999)-(b.displayStage?tiers.indexOf(b.displayStage):999)||a.name.localeCompare(b.name));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GTNH multiblock quest progression</title><style>:root{color-scheme:dark;font-family:system-ui;background:#101722;color:#e8edf5}body{max-width:1300px;margin:auto;padding:30px}p,li{line-height:1.6}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #334155;vertical-align:top}small{display:block;color:#a9b6ca;margin:5px 0}summary{cursor:pointer;color:#9cc9ff}input{font:inherit;padding:10px;background:#182333;color:white;border:1px solid #405878;width:350px;max-width:90%}a{color:#9cc9ff}.warning{padding:15px;background:#302920;border-left:4px solid #d6ac68}tr[hidden]{display:none}</style><h1>GTNH 2.8.4 — quest-based multiblock placement</h1><p class="warning">This replaces the withdrawn recipe/part estimates with <b>questbook progression placement</b>. It does not prove the earliest self-sufficient build tier. T.F.F.T is placed after the IV entry quest; that is not proof it cannot be built earlier.</p><p>Self-sufficient play; no quest rewards, trading, other-player help, bee breeding or crop mutation/breeding as resource shortcuts. Quests are used as evidence of placement, not as item sources. Fixed-tier/voltage machines remain excluded from the displayed list.</p><p>${shown.filter(c=>c.displayStage).length} assigned assumed quest tiers; ${shown.filter(c=>!c.displayStage).length} without identifiable quest placement. ${shown.filter(c=>c.conflicts.length).length} assigned entries retain recipe-conflict notes.</p><p><a href="gtnh-multiblock-quest-tiers.json">Full evidence JSON</a></p><input id="search" aria-label="Filter machines" placeholder="Search machine or tier"><table><thead><tr><th>Machine</th><th>Assumed tier</th><th>Evidence</th></tr></thead><tbody>${shown.map(c=>`<tr data-search="${escape((c.name+' '+(c.displayStage??'Unresolved')).toLowerCase())}"><td>${escape(c.name)}<small>${escape(c.id)}</small></td><td>${escape(c.displayStage)}${c.conflicts.length?'<small>Recipe discrepancy noted</small>':''}</td><td><details><summary>Quest predecessors and successors</summary>${c.conflicts.map(x=>'<p>'+escape(x)+'</p>').join('')}${c.records.filter(q=>c.basis.includes(q.id)).map(q=>`<p><b>${escape(q.name)}</b> — ${escape(q.stage)}<br>Prerequisite logic: ${q.logic}.<small>${escape(q.file)}</small></p><p>Earlier: ${q.before.map(n=>escape(n.quest)+' ('+escape(n.tier)+')').join('; ')||'None found'}</p><p>Later: ${q.after.map(n=>escape(n.quest)+' ('+escape(n.tier)+')').join('; ')||'No later anchored quest found'}</p>`).join('')||'<p>No matching tiered controller-retrieval quest found. A tiered name mention is used below when available; otherwise this entry remains unassigned.</p>'}${c.textMentions.map(x=>'<p>Quest text mention: '+escape(x.name)+' ('+escape(x.stage)+')</p>').join('')}</details></td></tr>`).join('')}</tbody></table><h2>Inference rules</h2><p>${escape(report.method)}</p><p>Before/after relations describe quest order. They do not establish a recipe power limit or prove resource availability. By request, quest placement supplies the assumed tier even where machine/hull or casing requirements conflict; these discrepancies remain in the evidence. Former recipe/part hints are not used as tier anchors.</p><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.dataset.search.includes(q));});</script></html>`;
fs.writeFileSync('docs/research/gtnh-multiblock-quest-tiers.html',html);
for(const tier of [...tiers,null]){
 const group=controllers.filter(c=>!c.excludedFromDisplay&&c.displayStage===tier);
 if(group.length)console.log(`${tier??'Unknown'} (${group.length}): ${group.map(c=>c.name).join('; ')}`);
}
console.log('Missing matches:',controllers.filter(c=>!c.records.length).map(c=>c.name).join('; '));
