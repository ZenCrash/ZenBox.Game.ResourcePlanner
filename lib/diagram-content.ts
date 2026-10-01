import type { DiagramDocument } from "./model";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]),
  );
  return value;
}

// Camera position and measured card sizes are presentation state, not edits.
// Compare only the compact saved document, never the hydrated recipe catalog.
export function diagramContent(document: DiagramDocument): string {
  const byId = <T extends { id: string }>(values: T[]) => [...values].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(canonical({
    nodes: byId(document.nodes.map(({ size: _size, ...node }) => ({
      ...node,
      disabledPorts: [...(node.disabledPorts ?? [])].sort(),
    }))),
    edges: byId(document.edges),
    areas: byId(document.areas ?? []),
    labels: byId(document.labels ?? []),
  }));
}
