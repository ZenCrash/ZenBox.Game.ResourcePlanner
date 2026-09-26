import type { CSSProperties } from "react";

const colors = [
  "#000000",
  "#0000aa",
  "#00aa00",
  "#00aaaa",
  "#aa0000",
  "#aa00aa",
  "#ffaa00",
  "#aaaaaa",
  "#555555",
  "#5555ff",
  "#55ff55",
  "#55ffff",
  "#ff5555",
  "#ff55ff",
  "#ffff55",
  "#ffffff",
];

/** Render the formatting codes captured from Minecraft tooltips as escaped React text. */
export function MinecraftText({ text }: { text: string }) {
  let style: CSSProperties = {};
  const parts = text.split(/(§[0-9a-fk-or])/gi);
  return parts.map((part, i) => {
    if (/^§[0-9a-fk-or]$/i.test(part)) {
      const code = part[1].toLowerCase();
      if (/^[0-9a-f]$/.test(code))
        style = { color: colors[parseInt(code, 16)] };
      else if (code === "r") style = {};
      else if (code === "l") style = { ...style, fontWeight: "bold" };
      else if (code === "o") style = { ...style, fontStyle: "italic" };
      else if (code === "m" || code === "n")
        style = {
          ...style,
          textDecorationLine: [
            style.textDecorationLine,
            code === "m" ? "line-through" : "underline",
          ]
            .filter(Boolean)
            .join(" "),
        };
      return null;
    }
    return (
      <span key={i} style={style}>
        {part}
      </span>
    );
  });
}
