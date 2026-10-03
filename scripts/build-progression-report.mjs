import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const base='data/research/multiblock-progression';
const inventory=JSON.parse(fs.readFileSync(`${base}/inventory.json`,'utf8'));
const space=JSON.parse(fs.readFileSync(`${base}/space-evidence.json`,'utf8'));
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite',{readonly:true});
const tiers=['ULV','LV','MV','HV','EV','IV','LuV','ZPM','UV','UHV','UEV','UIV','UMV','UXV','MAX'];
const tierIndex=eu=>eu<=0?-1:Math.min(14,Math.max(0,Math.ceil(Math.log(eu/8)/Math.log(4)-1e-9)));
const clean=s=>s.replace(/§./g,'');
const allItems=db.prepare('SELECT id,name,tooltip FROM Item').all();
const items=new Map(allItems.map(i=>[i.id,{...i,tooltip:JSON.parse(i.tooltip).map(clean)}]));
const controllers=new Map(inventory.controllers.map(c=>[c.id,c]));
const stmt=db.prepare("SELECT DISTINCT r.id,r.handler,r.euPerTick,r.details,r.layout FROM Recipe r JOIN Ingredient i ON i.recipeId=r.id WHERE i.itemId=? AND i.direction='output' AND r.enabled=1");
const ins=db.prepare("SELECT i.itemId,t.name,i.alternatives,i.consumed,i.amount FROM Ingredient i JOIN Item t ON t.id=i.itemId WHERE i.recipeId=? AND i.direction='input'");
const excludedHandlers=/bee\s*breed|crop\s*(?:breed|mutation)|mutatron|apiary\s*breed/i;
const cache=new Map();
function production(id){
 if(cache.has(id))return cache.get(id);
 const result=stmt.all(id).filter(r=>!['Scanner','Research Station'].includes(r.handler)&&!excludedHandlers.test(r.handler)).map(r=>({recipeId:r.id,handler:r.handler,euPerTick:r.euPerTick,details:JSON.parse(r.details),machineIds:JSON.parse(r.layout).machineIds??[],inputs:ins.all(r.id).map(i=>({...i,alternatives:JSON.parse(i.alternatives)}))}));
 cache.set(id,result);return result;
}
function machineTier(id){const item=items.get(id);if(!item||controllers.has(id))return -1;const m=item.tooltip.join(' ').match(/Voltage IN:\s*([\d,]+)/);return m?tierIndex(Number(m[1].replaceAll(',',''))):-1;}
const componentPattern=/\b(ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\b/g;
function physicalPartTier(id){
 const i=items.get(id);if(!i)return -1;
 const name=clean(i.name);const machine=machineTier(id);
 // Circuit grade is kept in a separate column. It is not a build-tier gate.
 const part=/(?:motor|pump|piston|robot arm|conveyor|sensor|emitter|field generator|machine casing|machine hull|energy hatch)/i.test(name)
  ?Math.max(-1,...[...name.matchAll(componentPattern)].map(m=>tiers.indexOf(m[1]))):-1;
 return Math.max(machine,part);
}
function evidenceForRecipe(r){
 const physical=r.inputs.flatMap(i=>{
  const ids=[...new Set([i.itemId,...(i.alternatives??[])])];
  const ranks=ids.map(physicalPartTier),min=Math.min(...ranks);
  return min>=0?[{name:i.name,itemId:i.itemId,tier:tiers[min],kind:ids.every(id=>machineTier(id)>=0)?'required machine voltage class':'component grade'}]:[];
 });
 return {recipeId:r.recipeId,handler:r.handler,euPerTick:r.euPerTick,powerClass:tiers[tierIndex(r.euPerTick)]??null,physical};
}
const namedLabels={
 'gregtech:gt.blockmachines:1003':{tier:'HV',basis:'Conventional HV label supplied by the user and corroborated by the HV multiblock quest. The HV circuit requirement alone does not prove an earliest HV build.'},
 'gregtech:gt.blockmachines:790':{tier:'EV',basis:'Controller requires the EV Molecular Separator and EV casing; the EV quest independently agrees. This establishes a machine-class requirement, not an exhaustive raw-resource proof.'},
 'gregtech:gt.blockmachines:792':{tier:'EV',basis:'Controller requires Advanced Bending Machine III (EV), EV casing, and titanium plates; the EV quest agrees. Titanium routes still require full upstream validation.'},
 'gregtech:gt.blockmachines:811':{tier:'IV',basis:'Controller requires Advanced Mixer IV (8,192 V / IV), Staballoy and Zirconium Carbide plates. Minimum structure also includes Multi-Use and Titanium Turbine casings.'},
};
const dependencyIds=new Set();
for(const c of inventory.controllers){
 c.controllerEvidence=c.recipes.map(evidenceForRecipe);
 const candidate=c.controllerEvidence.map(r=>Math.max(tierIndex(r.euPerTick),...r.physical.map(p=>tiers.indexOf(p.tier))));
 c.recipeAndPartTierHint=tiers[Math.min(...candidate)]??null;
 // This shallow observation was incorrectly presented as a progression tier.
 // Retain it only as withdrawn evidence; never publish it as an assigned tier.
 c.withdrawnTierEstimate=c.recipeAndPartTierHint;
 c.recipeAndPartTierHint=null;
 c.tierEstimateWithdrawn=true;
 c.conventionalLabel=namedLabels[c.id]??null;
 c.earliestSelfSufficientTier=null;
 c.status='unverified earliest build';
 c.structureCoverage='Partial: exact-name matches from exported structure tooltips; not a complete bill of materials.';
 c.openChecks=['Complete controller + minimum functional structure + mandatory hatch/coil bill of materials','At least one acyclic, self-sufficient production route for every input','Actual permitted processing machines, voltage/amperage, heat and other recipe requirements','Dimension access, resource extraction and processing; no bee/crop-breeding shortcuts'];
 if(c.researchDisplays.length)c.openChecks.push('Research/scanning prerequisite, required hardware, and data-stick linkage');
 if(/Space (?:Assembler|Mining|Pumping) Module/.test(c.name))c.openChecks.push('Space Elevator and any project/module prerequisite, not only the module controller');
 if(/Helio(?:flare|flux|fusion|thermal)/.test(c.name))c.openChecks.push('Forge of the Gods host and module unlocks');
 if(/Purification Unit/.test(c.name))c.openChecks.push('Water Purification Plant and upstream purification stages');
 for(const r of c.recipes)for(const i of r.inputs)for(const id of [i.itemId,...i.alternatives])dependencyIds.add(id);
 for(const s of c.structureItems)for(const i of s.items)dependencyIds.add(i.id);
}
// One upstream production layer for every controller ingredient and matched
// structure part. Keep ALL alternatives/recipes in this layer, with no search cap.
const dependencies=[...dependencyIds].sort().map(id=>({id,name:items.get(id)?.name??id,recipes:production(id)}));
const mineralExamples=['Bauxite','Tungstate','Naquadah'].map(name=>space.oreMixes.find(m=>m.name===name)).filter(Boolean);
const files=['data/catalogs/gtnh-2.8.4.sqlite',...['gregtech-5.09.51.482.jar','GalaxySpace-1.1.121-GTNH.jar','Galacticraft-3.3.13-GTNH.jar','GTNewHorizonsCoreMod-2.7.268.jar'].map(f=>`data/extraction/instance/minecraft/mods/${f}`)];
const fingerprints=files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
const report={
 schemaVersion:1,packVersion:'2.8.4',scope:'214 distinct GregTech-family controllers detected from structure tooltips. NBT display variants are not counted again. Not an exhaustive inventory of every other mod’s multiblocks.',
 status:'Previous tier estimates WITHDRAWN: immediate controller power/components omit mandatory upstream manufacturing and structure requirements. This inventory is not a progression-tier list.',
 corrections:[
  {machine:'T.F.F.T',withdrawnTier:'LV',finding:'Mandatory T.F.F.T Casing is made in an Assembler at 480 EU/t. The old LV hint used the controller\'s LV field generators and did not propagate the casing requirement. Storage fields, EV+ glass and power infrastructure also need validation.'},
  {machine:'Neutronium Compressor',withdrawnTier:'LV',finding:'The cheap recipe consumes an existing Neutronium Compressor; it cannot establish initial acquisition. Its upstream machine must be built first.'},
  {machine:'Decay Warehouse',withdrawnTier:'EV',finding:'The controller requires Radiation Proof Machine Casing, whose exported production recipe requires 7,680 EU/t. This dependency was not propagated. A lower-voltage multi-amp route must be separately validated, not assumed.'}
 ],
 assumptions:{selfSufficient:true,questRewards:false,trading:false,otherPlayerHelp:false,beeBreeding:false,cropMutationOrBreeding:false,naturalResourceGathering:true},
 method:['Quest prerequisites are corroboration only and do not set calculated tiers. An inherited IV quest prerequisite is a floor, not a final IV classification.',
 'Nominal circuit grade, component grade, controller-recipe power, hatch voltage, and earliest self-sufficient build tier are different facts.',
 'Recipe/part hints use direct physical components and nominal recipe power. They do not include a solved resource graph and must not be treated as assigned progression tiers.',
 'More amperage can satisfy a higher-EU/t recipe on machines that permit it. It cannot bypass heat, machine validation, structure, material, research or dimension requirements.',
 'Reject self-supporting dependency cycles: a machine cannot bootstrap its own mandatory parts, nor a rocket obtain the materials needed for its own construction.',
 'Ore-location registration is one acquisition route, not evidence of exclusive availability. Alternate non-breeding routes must be checked.',
 'No recipe, unavailable export, unknown material source or breeding-dependent source is assumed freely available. Unknown stays unknown.'],
 coverage:{controllers:inventory.controllers.length,controllerManufacturingRecipes:inventory.controllers.reduce((n,c)=>n+c.recipes.length,0),immediateDependencyItems:dependencies.length,upstreamProductionRecipes:dependencies.reduce((n,i)=>n+i.recipes.length,0),upstreamDepth:1,planetRegistrations:space.planets.length,oreMixRegistrations:space.oreMixes.length,rocketVariants:space.rockets.length,provenEarliestBuildTiers:0},
 remaining:['Complete transitive recipe/resource reachability, including tools, catalysts, heat, research and host structures. The included dependency layer is an audit, not a full reachability solver.',
 'Resolve structure tooltip omissions and variant/upgrade requirements from each machine’s structure implementation.',
 'Resolve End/Twilight/Everglades/Amun-Ra and other access paths plus all alternative material sources. Registered ore mixes are not the complete world-generation model.',
 'Classify acquisition routes that require bee breeding or crop mutation before allowing them to establish reachability.',
 'Verify per-machine multi-amp acceptance and runtime recipe constraints for every proposed voltage shortcut.'],
 fingerprints,controllers:inventory.controllers,dependencies,space,mineralExamples,
};
const folder='docs/research';fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(`${folder}/gtnh-multiblock-progression.json`,JSON.stringify(report,null,2)+'\n');
const esc=s=>String(s??'—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rows=report.controllers.map(c=>`<tr data-search="${esc([c.name,c.id,c.conventionalLabel?.tier,c.recipeAndPartTierHint,c.nominalComponentTier].join(' ').toLowerCase())}"><td><strong>${esc(c.name)}</strong><small>${esc(c.id)}</small></td><td>${esc(c.conventionalLabel?.tier??'Unassigned')}<small>${c.conventionalLabel?'Conventional label':'Needs route validation'}</small></td><td>${esc(c.recipeAndPartTierHint??'No direct hint')}<small>Not a proven build tier</small></td><td><details><summary>View evidence</summary>${c.conventionalLabel?`<p>${esc(c.conventionalLabel.basis)}</p>`:''}<p><b>Earliest self-sufficient tier: unresolved.</b></p>${c.controllerEvidence.map(r=>`<p><b>${esc(r.handler)}</b>: ${r.euPerTick.toLocaleString('en-US')} EU/t${r.powerClass?' ('+r.powerClass+' nominal)':''}<br>${r.physical.map(p=>esc(p.name)+' — '+p.tier+' '+p.kind).join('<br>')||'No explicit physical tier component detected.'}<small>Recipe ${esc(r.recipeId)}</small></p>`).join('')}<p>Circuit/component label evidence: ${esc(c.nominalComponentTier)}. A circuit label is not a production gate.</p><details><summary>Structure requirements</summary><pre>${esc(c.structure.join('\n'))}</pre><p>${esc(c.structureCoverage)}</p></details><details><summary>Controller recipe ingredients</summary>${c.recipes.map(r=>`<p>${esc(r.handler)}: ${r.inputs.map(i=>esc(i.name)+' × '+i.amount).join(' · ')}</p>`).join('')}</details><details><summary>Outstanding checks</summary><ul>${c.openChecks.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul></details><details><summary>Quest cross-check only</summary>${c.quests.map(q=>'<p>'+esc(q.name)+' — '+esc(q.gates.join(', ')||'No named tier gate traced')+'<small>'+esc(q.file)+'</small></p>').join('')||'No matching task found.'}</details></details></td></tr>`).join('\n');
const planetRows=space.planets.filter(p=>p.field!=='planetOverworld').map(p=>`<tr><td>${esc(p.field)}</td><td>${p.rocketTier}</td><td>${esc(p.source)} registration, line ${p.line}</td></tr>`).join('');
const rocketRows=space.controlComputers.map(c=>`<tr><td>T${c.rocketTier}</td><td>${c.recipes.map(r=>esc(r.handler)+' '+r.euPerTick.toLocaleString('en-US')+' EU/t ('+tiers[tierIndex(r.euPerTick)]+')').join('<br>')}</td><td>${[...new Set(c.recipes.flatMap(r=>r.inputs.map(i=>i.name)))].map(esc).join(', ')}</td></tr>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GTNH 2.8.4 multiblock progression audit</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101722;color:#e8edf5}body{max-width:1450px;margin:auto;padding:32px}h1{font-size:30px}h2{margin-top:36px}p,li{line-height:1.6;max-width:1050px}small{display:block;color:#99aac1;margin-top:5px;font-size:12px;overflow-wrap:anywhere}.note{border-left:4px solid #eab96a;background:#202633;padding:14px 20px}table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;color:#9ebce2;background:#182333}td,th{padding:12px;border-bottom:1px solid #304055;vertical-align:top}td:first-child{width:28%}summary{cursor:pointer;color:#abcdf4;margin:5px 0}details p{font-size:13px}pre{white-space:pre-wrap;font:13px/1.5 system-ui}input{padding:12px;background:#182333;border:1px solid #405878;color:white;width:min(550px,90%);font:inherit;margin:12px 0}a{color:#a6caff}.stats{color:#a6caff}tr[hidden]{display:none}</style>
<h1>GTNH 2.8.4 · Multiblock progression evidence</h1><p class="stats">${report.coverage.controllers} controllers · ${report.coverage.controllerManufacturingRecipes} controller manufacturing recipes · ${report.coverage.immediateDependencyItems} immediate dependency items · ${report.coverage.upstreamProductionRecipes} upstream recipes</p>
<div class="note"><strong>Working research list — earliest build tiers are not yet proven.</strong><p>The list distinguishes conventional labels and direct recipe/part hints from a complete self-sufficient build. No unverified hint has been applied to the wizard. The available data does not yet justify a reliable tier assignment for every controller.</p></div>
<p><b>Assumptions:</b> self-sufficient crafting and natural resource gathering; no quest rewards, trading, help from other players, bee breeding, or crop mutation/breeding as progression shortcuts. Breeding-only resources must not establish availability.</p>
<p><a href="gtnh-multiblock-progression.json">Full machine-readable evidence and recipe IDs</a></p>
<h2>Machine list</h2><p>“Recipe/part hint” is the lowest direct controller recipe’s highest nominal power or explicit physical-component class. It can be too high when a valid multi-amp route exists, or too low when materials, structure, research or host machines impose later gates. It is deliberately not an assigned progression tier.</p>
<label for="search">Find a machine, ID, or tier</label><br><input id="search" type="search" placeholder="For example: centrifuge, mixer, EV"><span id="count"></span>
<table id="machines"><thead><tr><th>Multiblock</th><th>Conventional label</th><th>Recipe/part hint</th><th>Sources and open constraints</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Rocket construction gates</h2><p>The installed GalaxySpace registration contains 32 rocket variants across T1–T8, including the matching control computer for each tier. Their exported computer recipes provide the evidence below. These are nominal processing requirements, not a proof of the earliest complete rocket; launch infrastructure, schematics, fuel, the other components and allowed multi-amp processors still matter.</p><table><tr><th>Rocket</th><th>Control computer production</th><th>Computer ingredients</th></tr>${rocketRows}</table>
<h2>Registered destination requirements</h2><p>Rocket tiers are separate from EU tiers. These are entry requirements from installed bytecode, not proof of launch or landing viability. Earth is excluded from this table because its return-flight registration does not gate starting resources.</p><table><tr><th>Registered destination field</th><th>Rocket tier</th><th>Source</th></tr>${planetRows}</table>
<h2>Why material gates need alternatives</h2>${mineralExamples.map(m=>'<p><b>'+esc(m.name)+'</b>: '+esc(m.materials.join(', '))+'; registered dimensions: '+esc(m.dimensions.join(', '))+'.</p>').join('')}
<p>For example, the registered Naquadah and Tungstate mixes include EndAsteroids. A rule that assigns all of those materials to a space-rocket tier would therefore need to investigate that route, its accessibility and processing, rather than assume planets are the only source. Mining, processing and breeding-free alternative acquisition must all be checked.</p>
<h2>Power and bootstrap rules</h2><p>Four amps at one voltage tier provide the nominal EU/t of the next tier, but only machines whose recipe validation and power logic allow that route may use it. The installed base ProcessingLogic multiplies available voltage by available amperage for its processing power budget; individual machine overrides and heat requirements still apply. Hatch voltage does not itself change into the next tier.</p><p>A recipe cannot be reached using a machine whose construction depends on that same unreachable recipe. A material cannot be made available by a rocket that already needs that material. The same rule applies to host structures, research and auxiliary resources.</p>
<h2>Method and remaining work</h2><ul>${report.method.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><ul>${report.remaining.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul>
<p>Sources: local catalog and exported tooltip variants; installed GregTech 5.09.51.482, GalaxySpace 1.1.121 and Galacticraft 3.3.13 registrations; installed quest files used only for cross-checks. Source SHA-256 hashes are stored in the JSON. The audit scripts read game data and write project research files only.</p>
<script>const input=document.querySelector('#search'),rows=[...document.querySelectorAll('#machines tbody tr')];function filter(){const q=input.value.toLowerCase().trim();let n=0;for(const row of rows){row.hidden=!row.dataset.search.includes(q);if(!row.hidden)n++;}document.querySelector('#count').textContent=' '+n+' machines';}input.addEventListener('input',filter);filter();</script></html>`;
const correctedHtml=html
 .replace('Working research list — earliest build tiers are not yet proven.','Previous tier estimates withdrawn — do not use the earlier tier table.')
 .replace('The list distinguishes conventional labels', 'The former estimates omitted mandatory upstream manufacturing and structure requirements. T.F.F.T requires a casing made at 480 EU/t; the Neutronium Compressor shortcut requires an existing compressor. The list distinguishes conventional labels')
 .replaceAll('No direct hint','Withdrawn')
 .replace('“Recipe/part hint” is the lowest direct controller recipe’s highest nominal power or explicit physical-component class.', 'The former “Recipe/part hint” took only direct controller power and explicit component classes. Those estimates are now withdrawn; the JSON retains them under withdrawnTierEstimate for audit history.');
fs.writeFileSync(`${folder}/gtnh-multiblock-progression.html`,correctedHtml);
db.close();console.log(JSON.stringify(report.coverage));
