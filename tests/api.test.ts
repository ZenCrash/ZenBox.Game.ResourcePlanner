import { test } from "node:test";
import assert from "node:assert/strict";
import { db, catalog } from "../lib/db";
import { blankDiagram } from "../lib/model";
test("project creation, persisted diagrams, revision conflicts, validation and deletion", async () => {
  const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const send = async (path: string, method: string, body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  let projectId: string | undefined;
  try {
    assert.equal(
      (await send("/api/projects", "POST", { name: "bad", version: "2.7.4" }))
        .status,
      400,
    );
    const response = await send("/api/projects", "POST", {
      name: "API validation fixture",
      version: "2.8.4",
    });
    assert.equal(response.status, 201);
    const project = await response.json();
    projectId = project.id;
    assert.equal(project.diagrams.length, 1);
    assert.equal(project.version, "2.8.4");
    const url = `/api/diagrams/${project.diagrams[0].id}`;
    const initial = await (await fetch(base + url)).json();
    const { catalogRevision, ...document } = initial;
    assert.match(catalogRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(document, blankDiagram());
    assert.equal((await (await fetch(base + url)).json()).catalogRevision, catalogRevision);
    const save = await send(url, "PUT", initial);
    assert.equal(save.status, 200);
    assert.equal((await save.json()).revision, 1);
    assert.equal((await send(url, "PUT", initial)).status, 409);
    assert.equal(
      (
        await send(url, "PUT", {
          ...initial,
          revision: 1,
          nodes: [
            {
              id: crypto.randomUUID(),
              recipeId: "nonexistent",
              position: { x: 1, y: 2 },
              machines: 1,
            },
          ],
        })
      ).status,
      400,
    );
    const created = await send("/api/diagrams", "POST", {
      name: "Another diagram",
      projectId,
    });
    assert.equal(created.status, 201);
    const diagram = await created.json();
    assert.equal(
      (await send(`/api/diagrams/${diagram.id}`, "DELETE")).status,
      200,
    );
    assert.equal(
      (await fetch(base + `/api/diagrams/${diagram.id}`)).status,
      404,
    );
  } finally {
    if (projectId) await db.project.delete({ where: { id: projectId } });
    await db.$disconnect();
    await catalog.$disconnect();
  }
});
