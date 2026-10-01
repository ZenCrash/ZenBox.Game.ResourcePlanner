import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import AdmZip from "adm-zip";
import { archivePaths } from "../lib/project-export";

test("project ZIP preserves nested and empty folders and disambiguates names", () => {
  const paths = archivePaths([
    { id: "folder", kind: "folder", parentId: null, name: "Factory" },
    { id: "nested", kind: "folder", parentId: "folder", name: "Fuel" },
    { id: "empty", kind: "folder", parentId: null, name: "Empty" },
    { id: "one", kind: "diagram", parentId: "nested" },
    { id: "two", kind: "diagram", parentId: "nested" },
  ], [{ id: "one", name: "Oil" }, { id: "two", name: "Oil" }, { id: "three", name: "../Unsafe" }], "json");
  assert.deepEqual(paths.map(p => p.path), ["Factory/", "Factory/Fuel/", "Empty/", "Factory/Fuel/Oil.json", "Factory/Fuel/Oil (2).json", "..-Unsafe.json"]);
  const content = Object.fromEntries(paths.map(p => [p.path, new TextEncoder().encode(p.kind === "folder" ? "" : '{"schemaVersion":1}')]));
  const zip = new AdmZip(Buffer.from(zipSync(content)));
  assert.equal(zip.getEntry("Empty/")?.isDirectory, true);
  assert.equal(zip.readAsText("Factory/Fuel/Oil.json"), '{"schemaVersion":1}');
  assert.equal(zip.getEntries().length, 6);
});
