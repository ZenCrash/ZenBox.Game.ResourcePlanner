import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import AdmZip from "adm-zip";
import { z } from "zod";

type Sqlite = {
  prepare: (sql: string) => {
    all: () => Record<string, unknown>[];
    get: () => Record<string, unknown>;
  };
  pragma: (sql: string) => unknown;
  backup: (file: string) => Promise<unknown>;
  close: () => void;
};
const Database = createRequire(import.meta.url)("better-sqlite3") as new (
  file: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => Sqlite;
export const packManifest = z.object({
  format: z.literal("resource-planner-game-pack"),
  formatVersion: z.literal(1),
  game: z.literal("gtnh"),
  version: z.literal("2.8.4"),
  name: z.literal("GT: New Horizons"),
});
export const manifest = packManifest.parse({
  format: "resource-planner-game-pack",
  formatVersion: 1,
  game: "gtnh",
  version: "2.8.4",
  name: "GT: New Horizons",
});
export const MAX_PACK_BYTES = 1024 * 1024 * 1024;
export function packPaths(root = process.cwd()) {
  return {
    database: path.join(
      /* turbopackIgnore: true */ root,
      "data/catalogs/gtnh-2.8.4.sqlite",
    ),
    assets: path.join(
      /* turbopackIgnore: true */ root,
      "data/game-assets/gtnh-2.8.4",
    ),
    marker: path.join(
      /* turbopackIgnore: true */ root,
      "data/game-packs/gtnh.json",
    ),
    downloads: path.join(
      /* turbopackIgnore: true */ root,
      "data/game-packs/downloads",
    ),
  };
}
export function isGtnhInstalled(root = process.cwd()) {
  const p = packPaths(root);
  try {
    return (
      packManifest.safeParse(
        JSON.parse(
          fs.readFileSync(/* turbopackIgnore: true */ p.marker, "utf8"),
        ),
      ).success &&
      fs.statSync(/* turbopackIgnore: true */ p.database).size > 4096 &&
      fs.statSync(/* turbopackIgnore: true */ p.assets).isDirectory()
    );
  } catch {
    return false;
  }
}
export function validateCatalog(file: string, assetNames: Set<string>) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    database.pragma("trusted_schema = OFF");
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    for (const table of [
      "CatalogInfo",
      "Item",
      "Recipe",
      "Ingredient",
      "ItemGroup",
      "IngredientVariant",
    ])
      if (!tables.has(table))
        throw new Error(`Missing catalog table: ${table}`);
    const info = database
      .prepare("SELECT id, version FROM CatalogInfo LIMIT 1")
      .get();
    if (info?.id !== "gtnh" || info.version !== "2.8.4")
      throw new Error("This ZIP is not a GTNH 2.8.4 catalog.");
    const items = database.prepare("SELECT image FROM Item").all();
    if (
      !items.length ||
      !Number(
        database.prepare("SELECT count(*) AS count FROM Recipe").get().count,
      )
    )
      throw new Error("The catalog contains no items or recipes.");
    database
      .prepare(
        "SELECT id, registryId, metadata, nbt, name, mod, `group`, tooltip, image, hidden, sortOrder, kind, collapsibleGroupId FROM Item LIMIT 1",
      )
      .get();
    database
      .prepare(
        "SELECT id, name, handler, durationTicks, euPerTick, enabled, layout, details FROM Recipe LIMIT 1",
      )
      .get();
    for (const sql of [
      "SELECT source, completeness, importedAt FROM CatalogInfo LIMIT 1",
      "SELECT id, recipeId, itemId, direction, amount, chance, consumed, slot, x, y, alternatives FROM Ingredient LIMIT 1",
      "SELECT id, name, collapsedColor, expandedColor FROM ItemGroup LIMIT 1",
      "SELECT ingredientId, itemId FROM IngredientVariant LIMIT 1",
    ])
      database.prepare(sql).get();
    for (const row of items)
      if (
        row.image &&
        (typeof row.image !== "string" ||
          !row.image.startsWith("/assets/gtnh-2.8.4/") ||
          !assetNames.has(row.image.slice(1)))
      )
        throw new Error(`Missing or invalid catalog image: ${row.image}`);
    if (
      JSON.stringify(database.pragma("quick_check")) !==
      '[{"quick_check":"ok"}]'
    )
      throw new Error("The catalog database is damaged.");
  } finally {
    database.close();
  }
}
export function validateArchive(zip: AdmZip) {
  const entries = zip.getEntries();
  if (entries.length > 160000)
    throw new Error("The ZIP contains too many files.");
  let expanded = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    const name = entry.entryName;
    if (
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      /[:\x00]/.test(name) ||
      ((entry.attr >>> 16) & 0xf000) === 0xa000
    )
      throw new Error("The ZIP contains an unsafe path or symbolic link.");
    const key = name.toLowerCase();
    if (names.has(key))
      throw new Error("The ZIP contains duplicate file paths.");
    names.add(key);
    if (entry.isDirectory) continue;
    if (
      name !== "manifest.json" &&
      name !== "catalog.sqlite" &&
      !/^assets\/gtnh-2\.8\.4\/[a-zA-Z0-9_./-]+\.png$/.test(name) &&
      !/^metadata\/gtnh-2\.8\.4[\w.-]*\.json$/.test(name)
    )
      throw new Error(`Unexpected file in game pack: ${name}`);
    expanded += entry.header.size;
    if (
      entry.header.size > 768 * 1024 * 1024 ||
      expanded > 3 * 1024 * 1024 * 1024
    )
      throw new Error("The expanded game pack is too large.");
  }
  const entry = zip.getEntry("manifest.json");
  if (!entry || entry.header.size > 16384 || !zip.getEntry("catalog.sqlite"))
    throw new Error(
      "Select a Resource Planner game-pack ZIP containing manifest.json and catalog.sqlite.",
    );
  packManifest.parse(JSON.parse(entry.getData().toString("utf8")));
  return entries;
}
export async function installPack(
  zipPath: string,
  root = process.cwd(),
  options: { replace?: boolean; beforeReplace?: () => Promise<void> } = {},
) {
  const p = packPaths(root);
  fs.mkdirSync(path.dirname(p.marker), { recursive: true });
  const lock = p.marker + ".lock";
  let lockFd: number;
  try {
    lockFd = fs.openSync(lock, "wx");
  } catch {
    throw new Error("Another game-pack installation is in progress.");
  }
  const stage = path.join(
    /* turbopackIgnore: true */ root,
    "data/game-packs",
    `install-${randomUUID()}`,
  );
  const saved: { original: string; backup: string }[] = [];
  const added: string[] = [];
  let rolledBack = false;
  let committed = false;
  const save = (original: string) => {
    if (!fs.existsSync(/* turbopackIgnore: true */ original)) return;
    const backup = path.join(
      /* turbopackIgnore: true */ stage,
      "previous",
      String(saved.length),
    );
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(original, backup);
    saved.push({ original, backup });
  };
  const move = (source: string, destination: string) => {
    fs.renameSync(source, destination);
    added.push(destination);
  };
  try {
    const replacing = isGtnhInstalled(root);
    if (replacing && !options.replace)
      throw new Error("GTNH is already installed.");
    if (
      !replacing &&
      (fs.existsSync(/* turbopackIgnore: true */ p.database) ||
        fs.existsSync(/* turbopackIgnore: true */ p.assets))
    )
      throw new Error(
        "Existing GTNH files need to be registered before importing another pack.",
      );
    if (fs.statSync(/* turbopackIgnore: true */ zipPath).size > MAX_PACK_BYTES)
      throw new Error("The ZIP exceeds the 1 GiB upload limit.");
    const zip = new AdmZip(zipPath);
    const entries = validateArchive(zip);
    fs.mkdirSync(stage, { recursive: true });
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const file = path.join(
        /* turbopackIgnore: true */ stage,
        entry.entryName,
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const content = entry.getData();
      if (content.length !== entry.header.size)
        throw new Error("Invalid ZIP entry size.");
      fs.writeFileSync(file, content);
    }
    validateCatalog(
      path.join(/* turbopackIgnore: true */ stage, "catalog.sqlite"),
      new Set(entries.map((entry) => entry.entryName)),
    );
    fs.mkdirSync(path.dirname(p.assets), { recursive: true });
    fs.mkdirSync(path.dirname(p.database), { recursive: true });
    if (replacing) {
      // Block new catalog requests before closing readers and swapping files.
      save(p.marker);
      await options.beforeReplace?.();
      save(p.database);
      for (const suffix of ["-wal", "-shm", "-journal"])
        save(p.database + suffix);
      save(p.assets);
      for (const name of fs.readdirSync(
        /* turbopackIgnore: true */ path.dirname(p.database),
      ))
        if (/^gtnh-2\.8\.4[\w.-]*\.json$/.test(name))
          save(
            path.join(
              /* turbopackIgnore: true */ path.dirname(p.database),
              name,
            ),
          );
    }
    move(
      path.join(/* turbopackIgnore: true */ stage, "assets/gtnh-2.8.4"),
      p.assets,
    );
    move(
      path.join(/* turbopackIgnore: true */ stage, "catalog.sqlite"),
      p.database,
    );
    const metadata = path.join(/* turbopackIgnore: true */ stage, "metadata");
    if (fs.existsSync(/* turbopackIgnore: true */ metadata))
      for (const name of fs.readdirSync(/* turbopackIgnore: true */ metadata))
        move(
          path.join(/* turbopackIgnore: true */ metadata, name),
          path.join(/* turbopackIgnore: true */ path.dirname(p.database), name),
        );
    const marker = path.join(
      /* turbopackIgnore: true */ stage,
      "installed.json",
    );
    fs.writeFileSync(
      marker,
      JSON.stringify({ ...manifest, revision: randomUUID() }, null, 2),
    );
    move(marker, p.marker);
    committed = true;
  } catch (error) {
    for (const file of added.reverse())
      fs.rmSync(file, { recursive: true, force: true });
    for (const entry of saved.reverse())
      fs.renameSync(entry.backup, entry.original);
    rolledBack = true;
    throw error;
  } finally {
    // Preserve backups for recovery if rollback itself failed.
    try {
      if (committed || rolledBack)
        fs.rmSync(stage, { recursive: true, force: true });
    } finally {
      fs.closeSync(lockFd);
      fs.unlinkSync(lock);
    }
  }
}
export function gamePackRevision() {
  return fs.readFileSync(
    /* turbopackIgnore: true */ packPaths().marker,
    "utf8",
  );
}

const exportsInFlight = new Map<string, Promise<string>>();
export async function exportPack(root = process.cwd(), destination?: string) {
  const p = packPaths(root);
  if (!isGtnhInstalled(root))
    throw new Error("Install GTNH before downloading its game pack.");
  const target =
    destination ??
    path.join(
      /* turbopackIgnore: true */ p.downloads,
      "gtnh-2.8.4.gamepack.zip",
    );
  const pending = exportsInFlight.get(target);
  if (pending) return pending;
  const work = (async () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = target + `.${randomUUID()}.tmp`;
    const snapshot = temporary + ".sqlite";
    const lock = p.marker + ".lock";
    let lockFd: number;
    try {
      lockFd = fs.openSync(lock, "wx");
    } catch {
      throw new Error("Another game-pack operation is in progress.");
    }
    let database: Sqlite | undefined;
    try {
      database = new Database(p.database, {
        readonly: true,
        fileMustExist: true,
      });
      await database.backup(snapshot);
      const zip = new AdmZip();
      zip.addFile(
        "manifest.json",
        Buffer.from(JSON.stringify(manifest, null, 2)),
      );
      zip.addLocalFile(snapshot, "", "catalog.sqlite");
      zip.addLocalFolder(p.assets, "assets/gtnh-2.8.4");
      for (const name of fs.readdirSync(
        /* turbopackIgnore: true */ path.dirname(p.database),
      ))
        if (/^gtnh-2\.8\.4[\w.-]*\.json$/.test(name))
          zip.addLocalFile(
            path.join(
              /* turbopackIgnore: true */ path.dirname(p.database),
              name,
            ),
            "metadata",
          );
      await zip.writeZipPromise(temporary);
      fs.renameSync(temporary, target);
      return target;
    } finally {
      database?.close();
      fs.closeSync(lockFd);
      fs.unlinkSync(lock);
      fs.rmSync(snapshot, { force: true });
      fs.rmSync(temporary, { force: true });
    }
  })();
  exportsInFlight.set(target, work);
  try {
    return await work;
  } finally {
    exportsInFlight.delete(target);
  }
}
