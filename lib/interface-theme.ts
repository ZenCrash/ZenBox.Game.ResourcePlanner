import { groupTheme, type GroupTheme } from "./group-theme";
export type InterfaceThemeId = Exclude<GroupTheme, "transparent" | "default"> | `custom:${string}`;
export const themeColorFields = ["background", "panel", "header", "border", "accent"] as const;
export type CustomTheme = { id: `custom:${string}`; name: string } & Record<typeof themeColorFields[number], string>;
export function parseCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((theme): theme is CustomTheme => {
    if (!theme || typeof theme !== "object" || typeof theme.id !== "string" || !theme.id.startsWith("custom:") || seen.has(theme.id) || typeof theme.name !== "string" || !theme.name.trim() || !themeColorFields.every(key => typeof theme[key] === "string" && /^#[0-9a-f]{6}$/i.test(theme[key]))) return false;
    seen.add(theme.id); return true;
  }).map(theme => ({ id: theme.id, name: theme.name.trim().slice(0, 60), background: theme.background, panel: theme.panel, header: theme.header, border: theme.border, accent: theme.accent }));
}
export const interfacePresets = [
  { id: "blue", name: "Default", background: "#121b29", panel: "#173c64", header: "#153959", border: "#488bc3", accent: "#9bd3ff" },
  { id: "black", name: "Charcoal", background: "#101214", panel: "#191d22", header: "#22272d", border: "#606c79", accent: "#c4ced8" },
  { id: "dark-blue", name: "Midnight", background: "#10121d", panel: "#191f33", header: "#202a42", border: "#526a99", accent: "#abbfea" },
  { id: "dark-green", name: "Forest", background: "#0e1612", panel: "#182a20", header: "#203629", border: "#4c7c60", accent: "#a2d1b2" },
  { id: "dark-aqua", name: "Teal", background: "#0d1519", panel: "#17292f", header: "#1e343d", border: "#477985", accent: "#9dced5" },
  { id: "dark-purple", name: "Plum", background: "#141018", panel: "#241c2e", header: "#30233b", border: "#78608c", accent: "#ceb2e4" },
  { id: "dark-red", name: "Burgundy", background: "#180f12", panel: "#2d1b21", header: "#39232a", border: "#8b5864", accent: "#e0b0ba" },
  { id: "gold", name: "Amber", background: "#16120e", panel: "#282219", header: "#332a1e", border: "#8a7650", accent: "#d8c59d" },
] as const;
export function normalizeInterfaceTheme(id: string): string {
  const aliases: Record<string, string> = { gray: "black", white: "black", green: "dark-green", aqua: "dark-aqua", red: "dark-red", "light-purple": "dark-purple", yellow: "gold" };
  return aliases[id] ?? id;
}
export function interfaceTheme(settings: { theme: InterfaceThemeId; customThemes: CustomTheme[] }) {
  if (settings.theme === "blue") return groupTheme("blue");
  const custom = settings.customThemes.find(theme => theme.id === settings.theme) ?? interfacePresets.find(theme => theme.id === normalizeInterfaceTheme(settings.theme));
  if (!custom) return groupTheme("blue");
  return { ...groupTheme("blue"), name: custom.name, color: custom.accent, border: custom.border,
    header: custom.header, body: custom.panel, accent: custom.accent, sidebar: custom.background,
    sidebarHeader: `linear-gradient(to bottom, ${custom.header}, ${custom.panel})`, sidebarBorder: custom.border,
    hover: `color-mix(in srgb, ${custom.panel} 85%, white)` };
}

export function coordinatedThemeColors(theme: CustomTheme, field: typeof themeColorFields[number], hex: string): CustomTheme {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const light = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  let hue = delta === 0 ? 0 : max === rgb[0] ? ((rgb[1] - rgb[2]) / delta) % 6 : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const levels = { background: .07, panel: .13, header: .18, border: .42, accent: .8 };
  const anchor = levels[field];
  const result = { ...theme };
  for (const key of themeColorFields) {
    const target = levels[key];
    const l = target <= anchor ? light * target / anchor : light + (1 - light) * (target - anchor) / (1 - anchor);
    const c = (1 - Math.abs(2 * l - 1)) * saturation;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const channels = hue < 60 ? [c,x,0] : hue < 120 ? [x,c,0] : hue < 180 ? [0,c,x] : hue < 240 ? [0,x,c] : hue < 300 ? [x,0,c] : [c,0,x];
    result[key] = "#" + channels.map(channel => Math.round(255 * (channel + l - c / 2)).toString(16).padStart(2, "0")).join("");
  }
  result[field] = hex;
  return result;
}
