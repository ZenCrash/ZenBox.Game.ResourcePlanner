import type { Item } from "./model";

/** Let the browser compositor follow the pointer, not low-frequency dragover events. */
export function catalogDragImage(item: Item, zoom: number, transfer: DataTransfer) {
  const ghost = document.createElement("div");
  ghost.className = "catalog-drag-preview";
  Object.assign(ghost.style, { left: "-10000px", top: "0", transform: `scale(${zoom})` });
  const card = document.createElement("div");
  card.className = "machine-card";
  const view = document.createElement("div");
  view.className = "recipe-view item-source-card";
  const header = document.createElement("div");
  header.className = "recipe-title";
  header.textContent = "Item source";
  const content = document.createElement("div");
  content.className = "item-source-content";
  const slot = document.createElement("div");
  slot.className = "item-slot";
  if (item.image) {
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = "";
    slot.append(image);
  }
  const name = document.createElement("span");
  name.textContent = item.name;
  content.append(slot, name);
  view.append(header, content);
  card.append(view);
  ghost.append(card);
  document.body.append(ghost);
  transfer.setDragImage(ghost, 0, 0);
  setTimeout(() => ghost.remove(), 0);
}
