// Reads launcher libraries; all game writes go to data/extraction/instance/minecraft.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import AdmZip from "adm-zip";
const launcher = process.argv[2];
if (!launcher)
  throw new Error(
    'Usage: node scripts/launch-extraction.mjs "path/to/PrismLauncher"',
  );
const game = path.resolve("data/extraction/instance/minecraft");
if (
  !game.startsWith(path.resolve("data/extraction") + path.sep) ||
  !fs.existsSync(path.join(game, "mods"))
)
  throw new Error("Prepare the extraction copy first");
const natives = path.resolve("data/extraction/natives");
fs.mkdirSync(natives, { recursive: true });
const libraries = [];
for (const [component, version] of [
  ["net.minecraft", "1.7.10"],
  ["net.minecraftforge", "10.13.4.1614"],
  ["org.lwjgl", "2.9.4-nightly-20150209"],
]) {
  const meta = JSON.parse(
    fs.readFileSync(
      path.join(launcher, "meta", component, version + ".json"),
      "utf8",
    ),
  );
  for (const lib of meta.libraries ?? []) {
    if (lib.rules) {
      let allowed = false;
      for (const rule of lib.rules)
        if (!rule.os || rule.os.name === "windows")
          allowed = rule.action === "allow";
      if (!allowed) continue;
    }
    const [group, artifact, version, classifier] = lib.name.split(":");
    const base = path.join(
      launcher,
      "libraries",
      group.replaceAll(".", "/"),
      artifact,
      version,
    );
    const file = path.join(
      base,
      `${artifact}-${version}${classifier ? "-" + classifier : ""}.jar`,
    );
    if (fs.existsSync(file)) libraries.push(file);
    if (lib.natives?.windows) {
      const nativeFile = path.join(
        base,
        `${artifact}-${version}-${lib.natives.windows.replace("${arch}", "64")}.jar`,
      );
      if (fs.existsSync(nativeFile)) {
        const zip = new AdmZip(nativeFile);
        for (const entry of zip.getEntries())
          if (entry.entryName.endsWith(".dll"))
            fs.writeFileSync(
              path.join(natives, path.basename(entry.entryName)),
              zip.readFile(entry),
            );
      }
    }
  }
}
libraries.push(
  path.join(
    launcher,
    "libraries/com/mojang/minecraft/1.7.10/minecraft-1.7.10-client.jar",
  ),
);
const args = [
  "-Xms1G",
  "-Xmx10G",
  `-Djava.library.path=${natives}`,
  "-cp",
  [...new Set(libraries)].join(path.delimiter),
  "net.minecraft.launchwrapper.Launch",
  "--tweakClass",
  "cpw.mods.fml.common.launcher.FMLTweaker",
  "--username",
  "PlannerExport",
  "--version",
  "1.7.10",
  "--gameDir",
  game,
  "--assetsDir",
  path.join(launcher, "assets"),
  "--assetIndex",
  "1.7.10",
  "--accessToken",
  "0",
  "--userProperties",
  "{}",
  "--width",
  "1100",
  "--height",
  "750",
];
const log = fs.openSync(path.resolve("data/extraction/launch.log"), "a");
const child = spawn(path.join(launcher, "java/jre-legacy/bin/java.exe"), args, {
  cwd: game,
  detached: true,
  stdio: ["ignore", log, log],
  windowsHide: true,
});
child.unref();
console.log(
  `Extraction copy launched, PID ${child.pid}. Log: data/extraction/launch.log`,
);
