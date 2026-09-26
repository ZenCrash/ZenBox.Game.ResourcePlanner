import { mkdirSync, openSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const dir of ["data/catalogs", "data/diagrams", "data/game-assets"])
  mkdirSync(dir, { recursive: true });
// Prisma's Windows schema engine requires the empty database file to exist.
for (const file of ["data/app.sqlite"]) closeSync(openSync(file, "a"));
for (const catalog of [false, true]) {
  for (const args of [["generate"], ["db", "push"]]) {
    if (catalog && args[0] !== "generate") continue;
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", ...args],
      {
        stdio: "inherit",
        env: { ...process.env, ...(catalog ? { CATALOG_DB: "1" } : {}) },
      },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
