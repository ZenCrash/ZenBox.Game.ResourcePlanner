export type TooltipVariants = Record<string, string[]>;
export function tooltipModifierMask(event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }) {
  return (event.shiftKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.altKey ? 4 : 0);
}
export function itemTooltipLines(tooltip: string, name: string, variants?: TooltipVariants, mask = 0): string[] {
  let normal: string[] = [];
  try { const parsed: unknown = JSON.parse(tooltip); if (Array.isArray(parsed)) normal = parsed.filter((line): line is string => typeof line === 'string'); } catch {}
  const lines = variants?.[String(mask)] ?? normal;
  return lines.filter((line, index) => index !== 0 || line.replace(/§./g, '') !== name.replace(/§./g, ''));
}
