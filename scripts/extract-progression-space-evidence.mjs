// Offline bytecode inspection only. Never launches or changes Minecraft.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
const out='data/research/multiblock-progression';
fs.mkdirSync(out,{recursive:true});
const javap=process.env.JAVAP_PATH??'C:/Program Files/Microsoft/jdk-25.0.3.9-hotspot/bin/javap.exe';
const mods='data/extraction/instance/minecraft/mods';
function dump(file,jar,classes){const text=execFileSync(javap,['-classpath',path.join(mods,jar),'-c','-p',...classes],{encoding:'utf8',maxBuffer:32*1024*1024});fs.writeFileSync(`${out}/${file}.txt`,text);return text;}
const gs=dump('planet-registration-bytecode','GalaxySpace-1.1.121-GTNH.jar',['galaxyspace.SolarSystem.SolarSystemPlanets','galaxyspace.VegaSystem.VegaPlanets','galaxyspace.BarnardsSystem.BarnardsPlanets','galaxyspace.ACentauriSystem.ACentauriPlanets','galaxyspace.TCetiSystem.TCetiPlanets']);
const gc=dump('galacticraft-bytecode','Galacticraft-3.3.13-GTNH.jar',['micdoodle8.mods.galacticraft.core.GalacticraftCore','micdoodle8.mods.galacticraft.planets.mars.MarsModule','micdoodle8.mods.galacticraft.planets.asteroids.AsteroidsModule']);
const ore=dump('ore-mixes-bytecode','gregtech-5.09.51.482.jar',['gregtech.api.enums.OreMixes']);
const rocket=dump('rocket-recipes-bytecode','GalaxySpace-1.1.121-GTNH.jar',['galaxyspace.core.recipe.RocketRecipes']);
const planets=[];
for(const [source,text]of [['GalaxySpace',gs],['Galacticraft',gc]]){
 const lines=text.split('\n');
 for(let i=0;i<lines.length;i++)if(lines[i].includes('.setTierRequired:')){
  const tier=lines[i-1].match(/iconst_(\d)/)?.[1]??lines[i-1].match(/(?:bipush|sipush)\s+(\d+)/)?.[1];
  if(!tier)continue;
  const context=lines.slice(Math.max(0,i-18),i).join('\n');
  const fields=[...context.matchAll(/Field (\w+):Lmicdoodle8\/mods\/galacticraft\/api\/galaxies\/(?:Planet|Moon|Satellite);/g)];
  const field=fields.at(-1)?.[1];if(!field)continue;
  planets.push({field,rocketTier:Number(tier),source,line:i+1});
 }
}
const oreMixes=[];
for(const match of ore.matchAll(/\/\/ String (ore\.mix\.[^\r\n]+)([\s\S]*?)putstatic\s+[^\r\n]+\/\/ Field (\w+):Lgregtech\/api\/enums\/OreMixes;/g)){
 const body=match[2];
 oreMixes.push({key:match[1],name:match[3],dimensions:[...new Set([...body.matchAll(/Field galacticgreg\/api\/enums\/DimensionDef\.(\w+):/g)].map(x=>x[1]))],materials:[...new Set([...body.matchAll(/Field gregtech\/api\/enums\/Materials\.(\w+):/g)].map(x=>x[1]))],vanillaCalls:[...new Set([...body.matchAll(/Method gregtech\/common\/OreMixBuilder\.(enable\w+):/g)].map(x=>x[1]))]});
}
// Symbolically execute this small registration method, including its slot loops.
// Unsupported instructions fail closed; no JVM code or mod initializers execute.
const body=rocket.split('public static void registerRecipes();')[1].split(/\n  (?:public|private)/)[0];
const code=[...body.matchAll(/^[ \t]*(\d+): (\w+)[ \t]*(.*)$/gm)].map(m=>({pc:+m[1],op:m[2],arg:m[3]}));
const addresses=new Map(code.map((c,i)=>[c.pc,i]));const stack=[],locals=[],rockets=[];
for(let pc=0,steps=0;pc<code.length;pc++){
 if(++steps>100000)throw Error('Unexpected rocket registration loop');
 const {op,arg}=code[pc];
 if(op==='new')stack.push({class:arg.split('// class ')[1]});
 else if(op==='dup')stack.push(stack.at(-1));
 else if(op==='pop')stack.pop();
 else if(op==='aconst_null')stack.push(null);
 else if(op.startsWith('iconst_'))stack.push(+op.slice(7));
 else if(op==='bipush'||op==='sipush')stack.push(parseInt(arg));
 else if(/^[ai]store_/.test(op))locals[+op.split('_')[1]]=stack.pop();
 else if(/^[ai]load_/.test(op))stack.push(locals[+op.split('_')[1]]);
 else if(op==='iinc'){const [i,n]=arg.split(',').map(Number);locals[i]+=n;}
 else if(op==='goto')pc=addresses.get(parseInt(arg))-1;
 else if(op==='if_icmpgt'){const b=stack.pop(),a=stack.pop();if(a>b)pc=addresses.get(parseInt(arg))-1;}
 else if(op==='getstatic')stack.push({field:arg.match(/\/\/ Field ([^:]+):/)[1]});
 else if(op==='return')break;
 else if(op.startsWith('invoke')){
  const method=arg.split('// Method ')[1];
  if(method.startsWith('java/lang/Integer.valueOf:'))continue;
  if(method.startsWith('java/util/HashMap."<init>":')){
   const clone=method.includes('Ljava/util/Map;')?stack.pop():null;const target=stack.pop();target.slots={...(clone?.slots??{})};
  }else if(method.startsWith('java/util/HashMap.put:')){
   const value=stack.pop(),key=stack.pop(),target=stack.pop();const old=target.slots[key];target.slots[key]=value;stack.push(old??null);
  }else if(method.startsWith('net/minecraft/item/ItemStack."<init>":')){
   const meta=method.includes(';II)')?stack.pop():0,amount=method.includes(';II)')?stack.pop():1,field=stack.pop(),target=stack.pop();Object.assign(target,{field:field.field,amount,meta});
  }else if(method.includes('NasaWorkbenchRecipe."<init>":')){
   const map=stack.pop(),output=stack.pop(),target=stack.pop();Object.assign(target,{output,slots:{...map.slots}});
  }else if(/^addT\dRocketRecipe:/.test(method)){
   const recipe=stack.pop();rockets.push({tier:+method.match(/^addT(\d)/)[1],output:recipe.output,slots:recipe.slots});
  }else throw Error(`Unsupported method ${method}`);
 }else throw Error(`Unsupported opcode ${op}`);
}
if(rockets.length!==32||new Set(rockets.map(r=>r.tier)).size!==8)throw Error('Rocket registration extraction incomplete');
const db=new Database('data/catalogs/gtnh-2.8.4.sqlite',{readonly:true});
const controlComputers=[];
for(let tier=1;tier<=8;tier++){
 const itemId=`GalaxySpace:item.RocketControlComputer:${tier}`;
 const rs=db.prepare("SELECT DISTINCT r.id,r.handler,r.euPerTick,r.details FROM Recipe r JOIN Ingredient i ON i.recipeId=r.id WHERE i.direction='output' AND i.itemId=? AND r.enabled=1").all(itemId);
 controlComputers.push({rocketTier:tier,itemId,recipes:rs.map(r=>({...r,inputs:db.prepare("SELECT i.itemId,t.name,i.amount FROM Ingredient i JOIN Item t ON t.id=i.itemId WHERE i.recipeId=? AND i.direction='input'").all(r.id)}))});
}
db.close();
const result={scope:'Installed registrations; not a proof that every location, ore route, schematic, or rocket is reachable.',planets,oreMixes,rockets,controlComputers};
fs.writeFileSync(`${out}/space-evidence.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({planets:planets.length,oreMixes:oreMixes.length,rocketVariants:rockets.length,computers:controlComputers.length}));
