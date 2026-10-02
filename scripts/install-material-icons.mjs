// Read native textures; write composed item PNGs only into this planner project.
// Usage: node scripts/install-material-icons.mjs [minecraft directory]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import Database from 'better-sqlite3';

const game = process.argv[2] || 'C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons/minecraft';
const project = process.cwd();
const assets = path.join(project, 'data/game-assets');
const sources = JSON.parse(fs.readFileSync('data/extraction/instance/minecraft/dumps/planner/material-icons.json', 'utf8'));
const db = new Database('data/catalogs/gtnh-2.8.4.sqlite');
const packName = 'GTNH-Faithful-x32.v2.1.4.zip';
const archives = [{ name: packName, zip: new AdmZip(path.join(game, 'resourcepacks', packName)) }];
const mods = fs.readdirSync(path.join(game, 'mods')).filter(x => x.endsWith('.jar'));
const loaded = new Set();
const textures = new Map();

function readTexture(icon) {
  const [namespace, name] = icon.split(':');
  if (!namespace || !name || /\.\./.test(icon)) throw Error(`Invalid texture name: ${icon}`);
  const entry = `assets/${namespace}/textures/items/${name}.png`;
  for (const archive of archives) {
    if (archive.zip.getEntry(entry)) return { bytes: archive.zip.readFile(entry), archive: archive.name, entry };
  }
  for (const name of [...mods].sort((a, b) => Number(!a.toLowerCase().includes(namespace)) - Number(!b.toLowerCase().includes(namespace)))) {
    if (loaded.has(name)) continue;
    loaded.add(name);
    const archive = { name, zip: new AdmZip(path.join(game, 'mods', name)) };
    archives.push(archive);
    if (archive.zip.getEntry(entry)) return { bytes: archive.zip.readFile(entry), archive: name, entry };
  }
  throw Error(`No native texture: ${entry}`);
}

async function texture(icon) {
  if (!textures.has(icon)) {
    const source = readTexture(icon);
    const meta = await sharp(source.bytes).metadata();
    // Animated sprites are vertical strips. Use their first native frame.
    const frame = await sharp(source.bytes).extract({ left: 0, top: 0, width: meta.width, height: meta.width })
      .resize(32, 32, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
    textures.set(icon, { frame, archive: source.archive, entry: source.entry });
  }
  return textures.get(icon);
}

const report = { method: 'Native base texture multiplied by runtime material RGB, with untinted native overlay; first animation frame; 32px PNG.', installed: [], skipped: [] };
for (const row of sources) {
  try {
    const item = db.prepare('select id,name,image from Item where id=?').get(row.id);
    if (!item) throw Error('Item absent from catalog');
    if (row.error || !row.base || !row.rgba) throw Error(row.error || 'No material icon');
    if (!item.image?.startsWith('/assets/')) throw Error('Unexpected current asset path');
    const previous = path.resolve(assets, item.image.slice('/assets/'.length));
    if (!previous.startsWith(assets + path.sep)) throw Error('Asset outside project');
    const old = await sharp(previous).ensureAlpha().raw().toBuffer();
    if (old.some((value, i) => i % 4 === 3 && value)) throw Error('Existing image is visible; preserved');
    const base = await texture(row.base);
    const rgba = Buffer.from(base.frame);
    for (let i = 0; i < rgba.length; i += 4)
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(rgba[i + c] * row.rgba[c] / 255);
    let result = sharp(rgba, { raw: { width: 32, height: 32, channels: 4 } });
    const overlay = row.overlay ? await texture(row.overlay) : null;
    if (overlay) result = result.composite([{ input: overlay.frame, raw: { width: 32, height: 32, channels: 4 } }]);
    const png = await result.png().toBuffer();
    const pixels = await sharp(png).ensureAlpha().raw().toBuffer();
    if (!pixels.some((value, i) => i % 4 === 3 && value)) throw Error('Composed image remains transparent');
    // Content-based name gives repaired icons fresh URLs without overwriting originals.
    const filename = createHash('sha256').update(png).digest('hex') + '.png';
    const image = '/assets/gtnh-2.8.4/items/' + filename;
    fs.writeFileSync(path.join(assets, 'gtnh-2.8.4/items', filename), png);
    db.prepare('update Item set image=? where id=?').run(image, row.id);
    report.installed.push({ id: row.id, name: item.name, previousImage: item.image, image, rgba: row.rgba,
      base: { archive: base.archive, entry: base.entry }, overlay: overlay && { archive: overlay.archive, entry: overlay.entry } });
  } catch (error) { report.skipped.push({ id: row.id, reason: error.message }); }
}
fs.writeFileSync('data/catalogs/gtnh-2.8.4.material-icon-repairs.json', JSON.stringify(report, null, 2) + '\n');
db.close();
console.log(JSON.stringify({ installed: report.installed.length, skipped: report.skipped }, null, 2));
