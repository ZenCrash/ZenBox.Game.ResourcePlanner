import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
const instance = process.argv[2],
  client = process.argv[3];
if (!instance || !client)
  throw new Error(
    'Usage: node scripts/extract-assets.mjs "path/to/instance" "path/to/minecraft-client.jar"',
  );
const out = path.resolve("public/assets/gtnh-2.8.4");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(
  path.join(
    instance,
    "minecraft/config/txloader/load/mainmenu/textures/logo2.png",
  ),
  path.join(out, "logo.png"),
);
const zip = new AdmZip(client);
const logo = zip.readFile("assets/minecraft/textures/gui/title/minecraft.png");
if (!logo) throw new Error("Minecraft logo not found in client");
fs.writeFileSync("public/assets/minecraft-logo.png", logo);
console.log(
  "Copied original logos into project assets. Source files were opened read-only.",
);
