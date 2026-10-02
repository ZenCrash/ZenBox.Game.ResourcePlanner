import { normalizeInterfaceTheme, parseCustomThemes, type CustomTheme, type InterfaceThemeId } from "./interface-theme";
import { groupThemeIds, type GroupTheme } from "./group-theme";
export const displaySettingsKey = "resource-planner:display-settings";
export const defaultDisplaySettings = {
  theme: "blue" as InterfaceThemeId,
  customThemes: [] as CustomTheme[],
  overviewZoom: 0.5,
  overviewLineItems: true,
  detailLineItems: true,
  crossingBridges: true,
  animatedArrows: true,
  animatedItemImages: false,
  animatedItemSize: 1,
  animatedItemSpacing: 160,
  disableArrows: false,
  showItemIds: false,
  connectionTree: true,
  sidebarGroupThemes: true,
  guiScale: 1,
  lineThickness: 6,
};
export type DisplaySettings = typeof defaultDisplaySettings;

export function parseDisplaySettings(value: unknown): DisplaySettings {
  const result = { ...defaultDisplaySettings };
  if (!value || typeof value !== "object") return result;
  const stored = value as Record<string, unknown>;
  result.customThemes = parseCustomThemes(stored.customThemes);
  if (stored.theme !== "transparent" && stored.theme !== "default" && (groupThemeIds.includes(stored.theme as GroupTheme) || result.customThemes.some(theme => theme.id === stored.theme))) result.theme = normalizeInterfaceTheme(stored.theme as string) as DisplaySettings["theme"];
  for (const key of ["overviewLineItems", "detailLineItems", "crossingBridges", "animatedArrows", "animatedItemImages", "disableArrows", "showItemIds", "connectionTree", "sidebarGroupThemes"] as const) {
    if (typeof stored[key] === "boolean") result[key] = stored[key];
  }
  for (const [key, min, max] of [["overviewZoom", 0, 1], ["guiScale", 0.8, 1.5], ["lineThickness", 2, 12], ["animatedItemSize", 0.5, 3], ["animatedItemSpacing", 40, 480]] as const) {
    const number = stored[key];
    if (typeof number === "number" && Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
  }
  result.guiScale = Math.round(result.guiScale * 10) / 10;
  result.lineThickness = Math.round(result.lineThickness);
  return result;
}
