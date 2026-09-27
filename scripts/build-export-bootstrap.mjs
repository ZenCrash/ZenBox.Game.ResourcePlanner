import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
const launcher = process.argv[2];
if (!launcher) throw new Error("Pass the PrismLauncher root directory");
const output = path.resolve("data/extraction/bootstrap-classes");
mkdirSync(output, { recursive: true });
const forge = path.join(
  launcher,
  "libraries/net/minecraftforge/forge/1.7.10-10.13.4.1614-1.7.10/forge-1.7.10-10.13.4.1614-1.7.10-universal.jar",
);
const compilation = spawnSync(
  process.env.PLANNER_JAVAC ||
    path.join(launcher, "java/jre-legacy/bin/java.exe"),
  [
    ...(process.env.PLANNER_JAVAC
      ? ["--release", "8"]
      : ["-jar", "data/extraction/ecj.jar", "-1.8"]),
    "-proc:none",
    "-cp",
    forge,
    "-d",
    output,
    "tools/gtnh-export-bootstrap/PlannerExport.java",
  ],
  { stdio: "inherit", windowsHide: true },
);
if (compilation.status !== 0) process.exit(compilation.status ?? 1);
const zip = new AdmZip();
zip.addLocalFolder(output);
zip.addFile(
  "mcmod.info",
  Buffer.from(
    JSON.stringify([
      {
        modid: "plannerexport",
        name: "Planner Export Bootstrap",
        version: "1.0",
        mcversion: "1.7.10",
      },
    ]),
  ),
);
zip.writeZip(
  "data/extraction/instance/minecraft/mods/planner-export-bootstrap.jar",
);
writeFileSync(
  "data/extraction/instance/minecraft/planner-export.enabled",
  "Development-only copy. Never place this marker in the original instance.\n",
);
