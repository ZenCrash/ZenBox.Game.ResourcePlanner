import { mkdirSync, openSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const dir of ["data/catalogs", "data/diagrams", "public/assets"])
  mkdirSync(dir, { recursive: true });
// Prisma's Windows schema engine requires the empty database file to exist.
for (const file of ["data/app.sqlite", "data/catalogs/gtnh-2.8.4.sqlite"])
  closeSync(openSync(file, "a"));
for (const catalog of [false, true]) {
  for (const args of [["generate"], ["db", "push"]]) {
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
