import type { Point } from "./diagram-geometry";

export type OverviewItem = {
  id: string;
  itemId: string;
  position: Point;
  selected: boolean;
  order: number;
};

export function hiddenOverviewItems(items: OverviewItem[]) {
  const visible: OverviewItem[] = [];
  const hidden = new Set<string>();
  for (const item of [...items].sort((a, b) =>
    Number(b.selected) - Number(a.selected) || b.order - a.order)) {
    if (visible.some((front) => front.itemId === item.itemId &&
      Math.abs(front.position.x - item.position.x) < 80 &&
      Math.abs(front.position.y - item.position.y) < 80)) {
      hidden.add(item.id);
    } else visible.push(item);
  }
  return hidden;
}
