import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { diagramSchema, type DiagramDocument } from "./model";
const root = path.resolve("data/diagrams");
function location(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid diagram ID");
  return path.join(root, `${id}.json`);
}
export async function readDiagram(id: string) {
  return diagramSchema.parse(JSON.parse(await readFile(location(id), "utf8")));
}
export async function writeDiagram(id: string, document: DiagramDocument) {
  await mkdir(root, { recursive: true });
  const file = location(id);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(document, null, 2));
  await rename(temp, file);
}
const locks = new Map<string, Promise<unknown>>();
export async function locked<T>(
  id: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  locks.set(id, next);
  try {
    return await next;
  } finally {
    if (locks.get(id) === next) locks.delete(id);
  }
}
