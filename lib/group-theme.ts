import type { CSSProperties } from "react";
export const groupThemeIds = ["transparent", "black", "dark-blue", "dark-green", "dark-aqua", "dark-red", "dark-purple", "gold", "gray", "blue", "green", "aqua", "red", "light-purple", "yellow", "white", "default"] as const;
export type GroupTheme = typeof groupThemeIds[number];
const colors = ["transparent", "#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#ffaa00", "#aaaaaa", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"];
export const groupThemes = groupThemeIds.filter(id => id !== "default").map((id, i) => ({ id, name: id.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" "), color: id === "blue" ? "#488bc3" : colors[i] }));
const blend = (a: string, b: string, weight: number) => "#" + [1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*weight + parseInt(b.slice(i,i+2),16)*(1-weight)).toString(16).padStart(2,"0")).join("");
export function groupTheme(theme: GroupTheme = "blue") {
  const selected = groupThemes.find(value => value.id === theme) ?? groupThemes[9];
  if (selected.id === "transparent") return { ...selected, border: "#777777", header: "transparent", body: "transparent", accent: "#dddddd", sidebar: "transparent", sidebarHeader: "transparent", sidebarBorder: "#555555", hover: "#ffffff0d" };
  if (selected.id === "blue") return { ...selected, border: "#488bc3", header: "#153959", body: "#173c64", accent: "#9bd3ff", sidebar: "#121b29", sidebarHeader: "linear-gradient(to bottom, #2b4663, #1d324a)", sidebarBorder: "#394b62", hover: "#1b283a" };
  return { ...selected, border: blend(selected.color,"#777777",.7), header: blend(selected.color,"#101820",.25), body: blend(selected.color,"#17202a",.23), accent: blend(selected.color,"#ffffff",.4), sidebar: blend(selected.color,"#12151a",.07), sidebarHeader: `linear-gradient(to bottom, ${blend(selected.color,"#202a35",.27)}, ${blend(selected.color,"#18202b",.18)})`, sidebarBorder: blend(selected.color,"#39414b",.25), hover: blend(selected.color,"#1b2530",.13) };
}
export function groupThemeStyle(theme?: GroupTheme | ReturnType<typeof groupTheme>): CSSProperties {
  const t=typeof theme === "object" ? theme : groupTheme(theme);
  return { "--area-border":t.border, "--area-header":t.id === "transparent" ? "transparent" : t.header+"ee", "--area-body":t.id === "transparent" ? "transparent" : t.body+"80", "--area-accent":t.accent,
    "--group-header":t.sidebarHeader, "--group-header-hover":t.id === "blue" && t.color === "#488bc3" ? "linear-gradient(to bottom, #365675, #28425d)" : `linear-gradient(to bottom, ${t.hover}, ${t.header})`, "--group-body":t.sidebar, "--group-section-body":t.sidebar, "--group-section-header":t.sidebar, "--group-border":t.sidebarBorder, "--group-hover":t.hover,
  } as CSSProperties;
}

export function resolvedGroupTheme(theme: GroupTheme | undefined, interfaceTheme: Exclude<GroupTheme, "transparent"> = "blue"): GroupTheme {
  return theme === "default" ? interfaceTheme : theme ?? "blue";
}
