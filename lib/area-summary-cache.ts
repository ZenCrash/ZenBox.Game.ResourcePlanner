import { summarizeArea, type SummaryBounds, type SummaryRecipe } from "./area-summary";

/** Freeze totals during group manipulation; check membership again on release. */
export class AreaSummaryCache {
  private entries = new Map<string, { members: SummaryRecipe[]; summary: ReturnType<typeof summarizeArea> }>();
  get(id: string, area: SummaryBounds, recipes: SummaryRecipe[], interacting = false) {
    const cached = this.entries.get(id);
    if (interacting && cached) return cached.summary;
    const members = recipes.filter(node => !node.recipe.sourceItemId &&
      node.position.x >= area.position.x && node.position.y >= area.position.y &&
      node.position.x + node.width <= area.position.x + area.width &&
      node.position.y + node.height <= area.position.y + area.height);
    if (cached && cached.members.length === members.length && members.every((node, i) => {
      const old = cached.members[i];
      return node.recipe === old.recipe && node.machines === old.machines && node.machineId === old.machineId &&
        node.variants === old.variants && node.disabledPorts === old.disabledPorts &&
        node.utilization === old.utilization;
    })) return cached.summary;
    const summary = summarizeArea(area, members);
    this.entries.set(id, { members, summary });
    return summary;
  }
  retain(ids: Set<string>) {
    for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id);
  }
}
