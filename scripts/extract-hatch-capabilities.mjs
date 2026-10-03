// Read-only extraction from exported GTNH structure tooltips.
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
const db = new Database('data/catalogs/gtnh-2.8.4.sqlite', { readonly: true });
const records = {};
for (const row of db.prepare('SELECT i.id, i.name, v.variants FROM Item i JOIN ItemTooltipVariant v ON v.itemId = i.id').all()) {
  const lines = (JSON.parse(row.variants)['1'] ?? []).map(line => line.replace(/§./g, '').trim());
  const energy = lines.filter(line => /Energy Hatch:/i.test(line));
  if (!energy.length || energy.every(line => /laser only/i.test(line))) continue;
  const text = energy.join(' ');
  const range = text.match(/Energy Hatch:\s*(\d+)\s*-\s*(\d+)/i);
  const fixed = /(?:1x Energy Hatch:|Exactly one|Energy Hatch:\s*1(?:x|$)|1 Energy Hatch$)/im.test(lines.join('\n')) ? 1
    : /Energy Hatch:.*2 Required/i.test(text) ? 2 : undefined;
  const tier = text.match(/\b(ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV)\+/)?.[1]
    ?? lines.join(' ').match(/Energy Hatches must be (\w+) or better/i)?.[1];
  records[row.id] = { name: row.name, min: fixed ?? (range ? Number(range[1]) : 1),
    // Unspecified structural limits are deliberately NOT advertised as verified.
    max: fixed ?? (range ? Number(range[2]) : 2), verifiedAmountLimit: !!(fixed || range),
    ...(tier ? { minTier: tier } : {}), notes: energy.join(' · ') };
}
db.close();
writeFileSync('lib/multiblock-hatch-capabilities.json', JSON.stringify(records, null, 2) + '\n');
console.log(`Extracted ${Object.keys(records).length} explicit normal energy-hatch capabilities.`);
