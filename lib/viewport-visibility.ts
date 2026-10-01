export function outsideViewport(
  bounds: { x: number; y: number; width: number; height: number },
  transform: [number, number, number], width: number, height: number, margin = 240,
) {
  if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return false;
  const [x, y, zoom] = transform;
  return bounds.x * zoom + x > width + margin || bounds.y * zoom + y > height + margin ||
    (bounds.x + bounds.width) * zoom + x < -margin || (bounds.y + bounds.height) * zoom + y < -margin;
}
