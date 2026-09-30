import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveTreeEntries,
  reconcileTree,
  selectTreeEntry,
  subtree,
  validateTree,
  visibleTree,
  type TreeEntry,
} from "../lib/diagram-tree";
const entries: TreeEntry[] = [
  { id: "folder", kind: "folder", parentId: null, name: "Folder" },
  { id: "nested", kind: "folder", parentId: "folder", name: "Nested" },
  { id: "a", kind: "diagram", parentId: "nested" },
  { id: "b", kind: "diagram", parentId: "folder" },
  { id: "c", kind: "diagram", parentId: null },
  { id: "empty", kind: "folder", parentId: null, name: "Empty" },
];
test("folder selection includes every descendant; deselecting one diagram deselects ancestors", () => {
  const selected = selectTreeEntry(entries, new Set(["c"]), "folder", true);
  assert.deepEqual([...selected].sort(), ["a", "b", "c", "folder", "nested"]);
  const fewer = selectTreeEntry(entries, selected, "a", true);
  assert.deepEqual([...fewer].sort(), ["b", "c"]);
  assert.deepEqual(
    [...selectTreeEntry(entries, selected, "folder", true)],
    ["c"],
  );
  assert.deepEqual([...selectTreeEntry(entries, selected, "a", false)], ["a"]);
});
test("collapsed folders hide rows without losing descendants or their selection", () => {
  const collapsed = entries.map((e) =>
    e.id === "folder" ? { ...e, collapsed: true } : e,
  );
  assert.deepEqual(
    visibleTree(collapsed).map((r) => r.entry.id),
    ["folder", "c", "empty"],
  );
  assert.deepEqual([...subtree(collapsed, "folder")].sort(), [
    "a",
    "b",
    "folder",
    "nested",
  ]);
  assert.equal(visibleTree(entries).find((r) => r.entry.id === "a")?.depth, 2);
});
test("a selected folder moves as a unit without extracting its selected descendants", () => {
  const selected = selectTreeEntry(entries, new Set(), "folder", false);
  const result = moveTreeEntries(entries, selected, "c", "after");
  assert.deepEqual(
    visibleTree(result).map((r) => r.entry.id),
    ["c", "folder", "nested", "a", "b", "empty"],
  );
  assert.equal(result.find((e) => e.id === "a")?.parentId, "nested");
  assert.equal(result.find((e) => e.id === "b")?.parentId, "folder");
  assert.deepEqual(entries[0].id, "folder");
});
test("moving several diagrams into a folder keeps display order and supports moving back to root", () => {
  const result = moveTreeEntries(
    entries,
    new Set(["c", "a"]),
    "empty",
    "inside",
  );
  assert.deepEqual(
    result.filter((e) => e.parentId === "empty").map((e) => e.id),
    ["a", "c"],
  );
  const root = moveTreeEntries(result, new Set(["a", "c"]), null, "inside");
  assert.deepEqual(
    root.filter((e) => e.parentId === null).map((e) => e.id),
    ["folder", "empty", "a", "c"],
  );
});
test("moving a folder onto its descendants or its own selection is a no-op", () => {
  assert.equal(
    moveTreeEntries(entries, new Set(["folder"]), "a", "before"),
    entries,
  );
  assert.equal(
    moveTreeEntries(entries, new Set(["folder"]), "nested", "inside"),
    entries,
  );
  assert.equal(
    moveTreeEntries(entries, new Set(["c"]), "a", "inside"),
    entries,
  );
});
test("tree validation rejects cycles, foreign diagrams, and invalid parents", () => {
  const diagrams = new Set(["a", "b", "c"]);
  assert.doesNotThrow(() => validateTree(entries, diagrams));
  assert.throws(
    () =>
      validateTree(
        entries.map((e) =>
          e.id === "folder" ? { ...e, parentId: "nested" } : e,
        ),
        diagrams,
      ),
    /itself/,
  );
  assert.throws(() => validateTree(entries, new Set(["a"])), /belong/);
  assert.throws(
    () =>
      validateTree(
        entries.map((e) => (e.id === "folder" ? { ...e, parentId: "c" } : e)),
        diagrams,
      ),
    /parent/,
  );
});
test("reconciliation retains folders and order, removes deleted diagrams and adds new diagrams", () => {
  const result = reconcileTree(entries, [
    { id: "a" },
    { id: "c" },
    { id: "new" },
  ]);
  assert.equal(
    result.some((e) => e.id === "b"),
    false,
  );
  assert.equal(result.find((e) => e.id === "a")?.parentId, "nested");
  assert.deepEqual(result.at(-1), {
    id: "new",
    kind: "diagram",
    parentId: null,
  });
});
