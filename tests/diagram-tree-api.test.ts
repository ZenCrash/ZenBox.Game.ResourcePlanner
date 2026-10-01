import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
test("diagram rename and tree hierarchy persist, reject invalid moves and detect stale updates", async () => {
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const send = (url: string, method: string, body: unknown) =>
    fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let id: string | undefined;
  try {
    const created = await send("/api/projects", "POST", {
      name: "Diagram tree API fixture",
      version: "2.8.4",
    });
    assert.equal(created.status, 201);
    const project = await created.json();
    id = project.id;
    assert.equal(project.diagrams[0].name, "My Production");
    const initialTree = await (await fetch(base + "/api/projects/" + id + "/tree")).json();
    assert.equal(initialTree.entries.find((entry: { kind: string }) => entry.kind === "folder")?.name, "My Recepies");
    assert.ok(initialTree.entries.some((entry: { id: string; kind: string }) => entry.kind === "diagram" && entry.id === project.diagrams[0].id));
    const first = project.diagrams[0].id;
    const diagramUrl = "/api/diagrams/" + first;
    const before = await (await fetch(base + diagramUrl)).json();
    const renamed = await send(diagramUrl, "PATCH", {
      name: "Renamed production",
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).name, "Renamed production");
    assert.equal(
      (await db.diagram.findUnique({ where: { id: first } }))?.name,
      "Renamed production",
    );
    assert.deepEqual(await (await fetch(base + diagramUrl)).json(), before);
    assert.equal((await send(diagramUrl, "PATCH", { name: " " })).status, 400);
    const second = await (
      await send("/api/diagrams", "POST", { projectId: id, name: "Second" })
    ).json();
    const url = "/api/projects/" + id + "/tree";
    const original = await (await fetch(base + url)).json();
    const folder = crypto.randomUUID();
    const entries = [
      {
        id: folder,
        kind: "folder",
        name: "Materials",
        parentId: null,
        collapsed: true,
      },
      { id: second.id, kind: "diagram", parentId: folder },
      { id: first, kind: "diagram", parentId: folder },
    ];
    const response = await send(url, "PUT", {
      revision: original.revision,
      entries,
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.deepEqual(await (await fetch(base + url)).json(), saved);
    assert.deepEqual(saved.entries, entries);
    assert.equal(
      (await send(url, "PUT", { revision: original.revision, entries })).status,
      409,
    );
    assert.equal(
      (
        await send(url, "PUT", {
          revision: saved.revision,
          entries: entries.map((e) =>
            e.id === folder ? { ...e, parentId: folder } : e,
          ),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await send(url, "PUT", {
          revision: saved.revision,
          entries: [
            ...entries,
            { id: crypto.randomUUID(), kind: "diagram", parentId: null },
          ],
        })
      ).status,
      400,
    );
    assert.deepEqual(await (await fetch(base + url)).json(), saved);
  } finally {
    if (id) {
      await db.setting.deleteMany({ where: { key: "diagram-tree:" + id } });
      await db.project.delete({ where: { id } });
    }
    await db.$disconnect();
  }
});
