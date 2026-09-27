export const displaySettingsKey = "resource-planner:display-settings";
export const defaultDisplaySettings = {
  overviewZoom: 0.5,
  overviewLineItems: true,
  detailLineItems: true,
  crossingBridges: true,
  animatedArrows: false,
  disableArrows: false,
  guiScale: 1,
  lineThickness: 6,
};
export type DisplaySettings = typeof defaultDisplaySettings;

export function parseDisplaySettings(value: unknown): DisplaySettings {
  const result = { ...defaultDisplaySettings };
  if (!value || typeof value !== "object") return result;
  const stored = value as Record<string, unknown>;
  for (const key of ["overviewLineItems", "detailLineItems", "crossingBridges", "animatedArrows", "disableArrows"] as const) {
    if (typeof stored[key] === "boolean") result[key] = stored[key];
  }
  for (const [key, min, max] of [["overviewZoom", 0, 1], ["guiScale", 0.8, 1.5], ["lineThickness", 2, 12]] as const) {
    const number = stored[key];
    if (typeof number === "number" && Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
  }
  result.guiScale = Math.round(result.guiScale * 10) / 10;
  result.lineThickness = Math.round(result.lineThickness);
  return result;
}
