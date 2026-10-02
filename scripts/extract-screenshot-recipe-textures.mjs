import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
const game=process.argv[2] || 'C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons/minecraft';
const pack=new AdmZip(path.join(game,'resourcepacks/GTNH-Faithful-x32.v2.1.4.zip'));
const thaum=new AdmZip(path.join(game,'mods',fs.readdirSync(path.join(game,'mods')).find(n=>/^Thaumcraft-/.test(n))));
const gt=new AdmZip(path.join(game,'mods/gregtech-5.09.51.482.jar'));
const out='public/ui/recipe-layouts';fs.mkdirSync(out,{recursive:true});const sources=[];
async function crop(name,source,rect,archive=pack){const data=archive.readFile(source);if(!data)throw Error(source);await sharp(data).extract(rect).png().toFile(`${out}/${name}.png`);sources.push({name,source,rect,archive:archive===pack?'GTNH-Faithful-x32.v2.1.4.zip':archive===thaum?'Thaumcraft':'GregTech'});}
const overlay='assets/thaumcraft/textures/gui/gui_researchbook_overlay.png';
for(const [name,x,y,w,h] of [['rune',20,3,16,16],['arcane-grid',112,15,52,52],['wand',68,76,12,12],['infusion',200,77,56,44],['crucible',0,20,56,48],['crucible-arrow',100,84,11,13]])await crop(name,overlay,{left:x*2,top:y*2,width:w*2,height:h*2},thaum);
await crop('sag','assets/enderio/textures/gui/nei/crusher.png',{left:0,top:0,width:332,height:130});
for(let i=1;i<=3;i++){const source=`assets/gregtech/textures/gui/progressbar/assemblyline_${i}.png`;const m=await sharp(pack.readFile(source)).metadata();await crop(`assembly-${i}`,source,{left:0,top:0,width:m.width,height:m.height/2});}
const tab='assets/gregtech/textures/gui/picture/tic_bolt_molding.png';const meta=await sharp(gt.readFile(tab)).metadata();await crop('bolt-tab',tab,{left:0,top:0,width:meta.width,height:meta.height},gt);
await crop('mob-sword','assets/mobsinfo/textures/gui/MobHandler.png',{left:14,top:124,width:32,height:34});
await crop('mob-info','assets/mobsinfo/textures/gui/MobHandler.png',{left:54,top:124,width:20,height:34});
const godforge='assets/tectech/textures/gui/progressbar/godforge_plasma.png';const godmeta=await sharp(gt.readFile(godforge)).metadata();await crop('godforge',godforge,{left:0,top:0,width:godmeta.width,height:godmeta.height/2},gt);fs.copyFileSync(`${out}/godforge.png`,'public/ui/faithful/godforge.png');
fs.writeFileSync(`${out}/sources.json`,JSON.stringify(sources,null,2)+'\n');
console.log('Extracted',sources.length,'original recipe textures.');
