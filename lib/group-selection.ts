import type { Node } from "@xyflow/react";

export function recipeInsideGroup(node: Node, group: Node): boolean {
  return node.type === "recipe" &&
    node.position.x >= group.position.x && node.position.y >= group.position.y &&
    node.position.x + (node.measured?.width ?? 340) <= group.position.x + (group.width ?? 640) &&
    node.position.y + (node.measured?.height ?? 240) <= group.position.y + (group.height ?? 480);
}
