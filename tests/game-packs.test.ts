import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import AdmZip from "adm-zip";
import {
  manifest,
  installPack,
  isGtnhInstalled,
  exportPack,
  validateArchive,
  packPaths,
} from "../lib/game-packs";
const Database = createRequire(import.meta.url)("better-sqlite3");
function fixture(root: string) {
  const database = path.join(root, "source.sqlite");
  const db = new Database(database);
  db.exec(`CREATE TABLE CatalogInfo (id TEXT, version TEXT, source TEXT, completeness TEXT, importedAt TEXT); INSERT INTO CatalogInfo VALUES ('gtnh','2.8.4','test','partial','2026-09-26');
  CREATE TABLE Item AS SELECT 'stone' AS id, 'minecraft:stone' AS registryId, 0 AS metadata, '' AS nbt, 'Stone' AS name, 'Minecraft' AS mod, 'Blocks' AS 'group', '[]' AS tooltip, '/assets/gtnh-2.8.4/items/stone.png' AS image, 0 AS hidden, 0 AS sortOrder, 'item' AS kind, NULL AS collapsibleGroupId;
  CREATE TABLE Recipe AS SELECT 'r' AS id, 'Test' AS name, 'Test' AS handler, 20 AS durationTicks, 30 AS euPerTick, 1 AS enabled, '{}' AS layout, '[]' AS details;
  CREATE TABLE Ingredient (id INTEGER, recipeId TEXT, itemId TEXT, direction TEXT, amount REAL, chance REAL, consumed INTEGER, slot INTEGER, x REAL, y REAL, alternatives TEXT); CREATE TABLE ItemGroup (id TEXT, name TEXT, collapsedColor TEXT, expandedColor TEXT); CREATE TABLE IngredientVariant (ingredientId INTEGER, itemId TEXT);`);
  db.close();
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
  zip.addLocalFile(database, "", "catalog.sqlite");
  zip.addFile("assets/gtnh-2.8.4/items/stone.png", Buffer.from("test icon"));
  return zip;
}
test("fresh install, export and re-import preserve catalog and images without personal data", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planner-pack-"));
  try {
    const zip = fixture(root),
      file = path.join(root, "pack.zip"),
      target = path.join(root, "target");
    zip.writeZip(file);
    assert.equal(isGtnhInstalled(target), false);
    await installPack(file, target);
    assert.equal(isGtnhInstalled(target), true);
    await assert.rejects(installPack(file, target), /already installed/);
    fs.writeFileSync(
      path.join(target, "data", "personal-secret.txt"),
      "not game data",
    );
    const exported = await exportPack(target);
    const exportedZip = new AdmZip(exported);
    assert.ok(
      !exportedZip.getEntries().some((e) => e.entryName.includes("personal")),
    );
    await installPack(exported, path.join(root, "second-pc"));
    assert.equal(isGtnhInstalled(path.join(root, "second-pc")), true);
    assert.deepEqual(
      fs.readFileSync(path.join(packPaths(target).assets, "items/stone.png")),
      Buffer.from("test icon"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("invalid and incomplete packs leave no installed catalog", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planner-pack-bad-"));
  try {
    const zip = fixture(root);
    zip.deleteFile("assets/gtnh-2.8.4/items/stone.png");
    const file = path.join(root, "bad.zip");
    zip.writeZip(file);
    const target = path.join(root, "target");
    await assert.rejects(
      installPack(file, target),
      /Missing or invalid catalog image/,
    );
    assert.equal(isGtnhInstalled(target), false);
    assert.equal(fs.existsSync(packPaths(target).database), false);
    assert.equal(fs.existsSync(packPaths(target).marker + ".lock"), false);
    zip.addFile(
      "manifest.json",
      Buffer.from(JSON.stringify({ ...manifest, version: "2.9.0" })),
    );
    assert.throws(() => validateArchive(zip));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("archive validation rejects traversal, executable payloads, links and excessive expansion", () => {
  const minimal = () => {
    const z = new AdmZip();
    z.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
    z.addFile("catalog.sqlite", Buffer.from("db"));
    return z;
  };
  const traversal = minimal();
  traversal.getEntry("catalog.sqlite")!.entryName = "../escape.sqlite";
  assert.throws(() => validateArchive(traversal), /unsafe/);
  const executable = minimal();
  executable.addFile("run.exe", Buffer.from("bad"));
  assert.throws(() => validateArchive(executable), /Unexpected/);
  const link = minimal();
  link.getEntry("catalog.sqlite")!.attr = (0xa000 << 16) >>> 0;
  assert.throws(() => validateArchive(link), /symbolic link/);
  const oversized = minimal();
  oversized.getEntry("catalog.sqlite")!.header.size = 1024 ** 3;
  assert.throws(() => validateArchive(oversized), /too large/);
});
