import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "../generated/app/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { catalog } from "../lib/db";
import { checkBundledCatalog } from "./check-bundled-catalog";

async function main() {
  // Fail before building or creating a distributable when the real data is absent.
  const preview = process.argv.includes("--preview");
  const manifest = await checkBundledCatalog({ allowPartial: preview });
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error(
      "This packaging target is Windows x64. Build on that platform so the bundled native SQLite module and Node runtime match.",
    );
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );
  if (build.status !== 0) throw new Error("Production build failed");
  const destination = path.resolve(
    "dist",
    `resource-planner-${preview ? "preview-" : ""}win-x64-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  await mkdir(destination, { recursive: true });
  await cp(".next/standalone", destination, {
    recursive: true,
    dereference: true,
    filter: (source) =>
      path.relative(".next/standalone", source).split(path.sep)[0] !== "data",
  });
  await cp(".next/static", path.join(destination, ".next/static"), {
    recursive: true,
  });
  await cp("public", path.join(destination, "public"), { recursive: true });
  await mkdir(path.join(destination, "data/catalogs"), { recursive: true });
  await mkdir(path.join(destination, "data/diagrams"), { recursive: true });
  await cp(
    "data/catalogs/gtnh-2.8.4.sqlite",
    path.join(destination, "data/catalogs/gtnh-2.8.4.sqlite"),
  );
  await cp(
    "data/catalogs/gtnh-2.8.4.coverage.json",
    path.join(destination, "catalog-coverage.json"),
  );
  await cp(
    "data/catalogs/gtnh-2.8.4.fluids.json",
    path.join(destination, "data/catalogs/gtnh-2.8.4.fluids.json"),
  );
  await mkdir(path.join(destination, "runtime"));
  await cp(process.execPath, path.join(destination, "runtime/node.exe"));
  // Node's license is stored alongside node.exe in official zip distributions; require it for release.
  const licenseCandidates = [
    path.join(path.dirname(process.execPath), "LICENSE"),
    path.join(path.dirname(process.execPath), "LICENSE.txt"),
    path.resolve("vendor/node-LICENSE"),
  ];
  let license: string | undefined;
  for (const candidate of licenseCandidates) {
    try {
      license = await readFile(candidate, "utf8");
      break;
    } catch {}
  }
  if (!license)
    throw new Error(
      "Add the license for the bundled Node runtime to vendor/node-LICENSE before distribution.",
    );
  await writeFile(path.join(destination, "runtime/LICENSE.txt"), license);
  // Generate the schema on the build machine. No Prisma CLI, npm or installation is needed on the receiving PC.
  const diff = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/app.prisma",
      "--script",
    ],
    { encoding: "utf8" },
  );
  if (diff.status !== 0)
    throw new Error(diff.stderr || "Could not create fresh project database");
  const fresh = new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: `file:${path.join(destination, "data/app.sqlite")}`,
    }),
  });
  try {
    for (const statement of diff.stdout
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await fresh.$executeRawUnsafe(statement);
  } finally {
    await fresh.$disconnect();
  }
  await access(path.join(destination, "server.js"));
  await access(
    path.join(
      destination,
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ),
  );
  const nativeCheck = spawnSync(
    path.join(destination, "runtime/node.exe"),
    [
      "-e",
      "require('./node_modules/better-sqlite3/build/Release/better_sqlite3.node'); console.log('Bundled SQLite native module loaded')",
    ],
    { cwd: destination, encoding: "utf8", windowsHide: true },
  );
  if (nativeCheck.status !== 0)
    throw new Error(
      nativeCheck.stderr || "Bundled SQLite runtime validation failed",
    );
  console.log(nativeCheck.stdout.trim());
  await writeFile(
    path.join(destination, "start.cmd"),
    '@echo off\r\ncd /d "%~dp0"\r\nset HOSTNAME=127.0.0.1\r\nif not defined PORT set PORT=3000\r\nset NODE_ENV=production\r\nset NEXT_TELEMETRY_DISABLED=1\r\necho Open http://127.0.0.1:%PORT% in your browser.\r\necho Press Ctrl+C in this window to stop the planner.\r\n"%~dp0runtime\\node.exe" server.js\r\nif errorlevel 1 pause\r\n',
  );
  await writeFile(
    path.join(destination, "catalog-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    path.join(destination, "README.txt"),
    "RESOURCE PLANNER — OFFLINE WINDOWS X64 EDITION\r\n\r\nKeep this entire folder together. Double-click start.cmd and open http://127.0.0.1:3000.\r\nNo internet, Minecraft, Java, npm or separate Node installation is needed.\r\n" +
      (preview
        ? "DEVELOPMENT PREVIEW: the bundled GTNH 2.8.4 catalog is partial. Some recipes, images, grouping and exact NEI interactions remain incomplete. See catalog-coverage.json.\r\n"
        : "GTNH 2.8.4 items, recipes and images are already bundled.\r\n") +
      "Close the server with Ctrl+C when finished.\r\nBack up data/app.sqlite and data/diagrams for your projects.\r\n",
  );
  console.log(`Offline package created: ${destination}`);
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => catalog.$disconnect());
