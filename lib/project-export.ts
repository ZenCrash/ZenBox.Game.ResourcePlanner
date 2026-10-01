import { zipSync } from "fflate";
import { reconcileTree, type TreeEntry } from "./diagram-tree";
import { itemSourceRecipe, type DiagramDocument, type Item, type Recipe } from "./model";
import { download, exportDiagram } from "./export";

export function archivePaths(entries: TreeEntry[], diagrams: { id: string; name: string }[], format: string) {
  const tree = reconcileTree(entries, diagrams);
  const names = new Map(diagrams.map(d => [d.id, d.name]));
  const paths = new Map<string, string>();
  const used = new Set<string>();
  const visiting = new Set<string>();
  const safe = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, "_$1") || "Untitled";
  function path(entry: TreeEntry): string {
    if (paths.has(entry.id)) return paths.get(entry.id)!;
    if (visiting.has(entry.id)) throw new Error("Invalid folder hierarchy");
    visiting.add(entry.id);
    const parent = tree.find(e => e.id === entry.parentId && e.kind === "folder");
    const prefix = parent ? path(parent) : "";
    const base = safe(entry.kind === "folder" ? entry.name ?? "Folder" : names.get(entry.id) ?? "Diagram");
    const suffix = entry.kind === "folder" ? "/" : `.${format}`;
    let result = prefix + base + suffix, n = 2;
    while (used.has(result.toLowerCase().replace(/\/$/, ""))) result = `${prefix}${base} (${n++})${suffix}`;
    used.add(result.toLowerCase().replace(/\/$/, ""));
    paths.set(entry.id, result);
    visiting.delete(entry.id);
    return result;
  }
  return tree.map(entry => ({ ...entry, path: path(entry) }));
}

export async function exportProjectZip(options: {
  name: string; diagrams: { id: string; name: string }[]; entries: TreeEntry[];
  format: "json" | "svg" | "pdf";
  current?: { id: string; document: DiagramDocument; recipes: Recipe[] };
  progress: (text: string) => void;
}) {
  const read = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load export data (${response.status})`);
    return response.json();
  };
  const files: Record<string, Uint8Array> = {};
  let count = 0;
  for (const entry of archivePaths(options.entries, options.diagrams, options.format)) {
    if (entry.kind === "folder") { files[entry.path] = new Uint8Array(); continue; }
    const name = options.diagrams.find(d => d.id === entry.id)!.name;
    options.progress(`Exporting ${++count}/${options.diagrams.length}: ${name}`);
    const current = options.current?.id === entry.id ? options.current : undefined;
    const doc = current?.document ?? await read<DiagramDocument>(`/api/diagrams/${entry.id}`);
    if (options.format === "json") {
      files[entry.path] = new TextEncoder().encode(JSON.stringify(doc, null, 2));
      continue;
    }
    const recipes = current ? [...current.recipes] : [];
    if (!current) {
      const ids = [...new Set(doc.nodes.filter(n => !n.itemId).map(n => n.recipeId))];
      const items = [...new Set(doc.nodes.flatMap(n => n.itemId ? [n.itemId] : []))];
      for (let i = 0; i < ids.length; i += 40) recipes.push(...await read<Recipe[]>(`/api/recipes?ids=${encodeURIComponent(ids.slice(i, i + 40).join(','))}`));
      for (let i = 0; i < items.length; i += 40) recipes.push(...(await read<Item[]>(`/api/items?ids=${encodeURIComponent(items.slice(i, i + 40).join(','))}`)).map(itemSourceRecipe));
    }
    if (doc.nodes.some(n => !recipes.some(r => r.id === n.recipeId))) throw new Error(`Missing recipe data for ${name}`);
    const blob = await exportDiagram(doc, recipes, options.format, name, true);
    files[entry.path] = new Uint8Array(await blob!.arrayBuffer());
  }
  options.progress("Creating ZIP…");
  const zip = zipSync(files);
  download(new Blob([new Uint8Array(zip)], { type: "application/zip" }), `${options.name}-${options.format}.zip`, "application/zip");
}
