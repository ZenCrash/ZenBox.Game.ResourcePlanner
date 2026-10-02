import fs from 'node:fs';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
const game=process.argv[2] || 'C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons/minecraft';
const pack=new AdmZip(game+'/resourcepacks/GTNH-Faithful-x32.v2.1.4.zip'),gt=new AdmZip(game+'/mods/gregtech-5.09.51.482.jar');
const out='public/ui/recipe-layouts',sources=[];
async function extract(name,source,rect,idle=false,transparent=false){const zip=pack.getEntry(source)?pack:gt;let buffer=zip.readFile(source);if(!buffer)throw Error(source);let img=sharp(buffer);let m=await img.metadata();rect ||= {left:0,top:0,width:m.width,height:idle?m.height/2:m.height};img=img.extract(rect);if(transparent){let {data,info}=await img.ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=0;i<data.length;i+=4)if(data[i]===198&&data[i+1]===198&&data[i+2]===198)data[i+3]=0;img=sharp(data,{raw:info});}await img.png().toFile(out+'/'+name+'.png');sources.push({name,source,rect,archive:zip===pack?'Faithful':'GregTech'});}
for(let i=1;i<=3;i++)await extract('research-'+i,`assets/tectech/textures/gui/progressbar/research_station_${i}.png`,null,true);
for(const name of ['heat_sink','rack_large'])await extract(name,`assets/tectech/textures/gui/picture/${name}.png`);
await extract('space-mining','assets/gtnhintergalactic/textures/gui/progressbar/space_mining_module_arrow.png');
await extract('hammer-recycling-tab','assets/gregtech/textures/gui/picture/forge_hammer_recycling.png');
await extract('squeezer','assets/forestry/textures/gui/squeezersocket.png',{left:10,top:22,width:332,height:136},false,true);
await extract('brewing','assets/minecraft/textures/gui/container/brewing_stand.png',{left:108,top:26,width:132,height:116},false,true);
fs.writeFileSync(out+'/additional-sources.json',JSON.stringify(sources,null,2)+'\n');console.log('Extracted',sources.length,'native layout textures');
