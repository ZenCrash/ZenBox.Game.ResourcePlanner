import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import sharp from "sharp";

// Extract original pixels only: progress sheets contain idle and active halves.
const archive = process.argv[2];
if (!archive) throw new Error("Pass the GTNH Faithful resource-pack zip path.");
const zip = new AdmZip(archive);
const destination = "public/ui/faithful";
fs.mkdirSync(destination, { recursive: true });
const layouts = JSON.parse(fs.readFileSync("lib/game-recipe-layouts.json", "utf8")).layouts;
const progress = [...new Set(["arrow", "arrow_multiple", "assemble", "circuit_assembler", "compress", "extract", "canner", "mixer", "macerate", "extrude", ...Object.values(layouts).map(layout => layout.texture)])];
const decorations = [...new Set(Object.values(layouts).flatMap(layout => layout.decorations.map(d => d.texture)))];
const overlays = [...new Set(["compressor", "extruder_shape", "furnace", "mold", ...Object.values(layouts).flatMap(layout => Object.values(layout.overlays).flat().filter(Boolean))])];
const sources = [];
for (const [directory, names] of [["progressbar", progress], ["overlay_slot", overlays]]) {
  for (const name of names) {
    const source = `assets/gregtech/textures/gui/${directory}/${name}.png`;
    const buffer = zip.readFile(source);
    // Godforge uses TecTech artwork, extracted by extract-screenshot-recipe-textures.mjs.
    if (!buffer && name === "godforge" && fs.existsSync(path.join(destination, "godforge.png"))) continue;
    if (!buffer) throw new Error(`Missing texture: ${source}`);
    const filename = directory === "progressbar" ? name : `slot-${name}`;
    if (directory === "progressbar") {
      const { width, height } = await sharp(buffer).metadata();
      if (width !== 40 || height !== 72) throw new Error(`Unexpected sprite dimensions: ${source}`);
      await sharp(buffer).extract({ left: 0, top: 0, width, height: height / 2 }).toFile(path.join(destination, filename + ".png"));
      fs.writeFileSync(path.join(destination, filename + "-sheet.png"), buffer);
    } else fs.writeFileSync(path.join(destination, filename + ".png"), buffer);
    sources.push({ file: filename + ".png", source, frame: directory === "progressbar" ? "Top half (idle), native 40 x 36 pixels" : "Original complete texture" });
  }
}
for (const name of decorations) {
  const source = `assets/gregtech/textures/gui/progressbar/${name}.png`;
  const buffer = zip.readFile(source);
  if (!buffer) throw new Error(`Missing decoration: ${source}`);
  fs.writeFileSync(path.join(destination, name + ".png"), buffer);
  sources.push({ file: name + ".png", source, frame: "Original complete texture" });
}
fs.writeFileSync(path.join(destination, "sources.json"), JSON.stringify({ resourcePack: path.basename(archive), textures: sources }, null, 2) + "\n");
console.log(`Extracted ${sources.length} original Faithful textures.`);
