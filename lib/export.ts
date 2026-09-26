import {
  createPortColorResolver,
  port,
  rate,
  supplyColor,
  connectionColors,
  hasRecipeTiming,
  hasIngredientPort,
  applyVariants,
  type DiagramDocument,
  type Recipe,
} from "./model";
import { connectionRoute, connectionLabelPosition } from "./diagram-geometry";
import { recipePowerInfo } from "./recipe-power";
import { connectionSummary } from "./connection-summary";
import { initialPortRows } from "./port-layout";
import { GRID_SIZE } from "./diagram-geometry";
import { summarizeArea } from "./area-summary";
export function download(content: string | Blob, name: string, type: string) {
  const blob =
    typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const escape = (value: unknown) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function exportDiagram(
  doc: DiagramDocument,
  recipes: Recipe[],
  format: "svg" | "pdf",
  name: string,
) {
  const baseRecipes = new Map(recipes.map((r) => [r.id, r]));
  const map = new Map(
    doc.nodes.map((node) => [
      node.id,
      applyVariants(baseRecipes.get(node.recipeId)!, node.variants),
    ]),
  );
  const portRows = new Map(
    doc.nodes.map((node) => [
      node.id,
      Object.assign(
        {},
        ...["input", "output"].map((direction) =>
          initialPortRows(
            map
              .get(node.id)!
              .ingredients.filter(
                (i) => i.direction === direction && hasIngredientPort(i),
              )
              .map((i) => `${direction}:${i.slot}`),
            node.portRows,
          ),
        ),
      ) as Record<string, number>,
    ]),
  );
  const summaries = (doc.areas ?? []).map((area) => ({
    area,
    summary: summarizeArea(
      area,
      doc.nodes.map((node) => ({
        position: node.position,
        width: node.size?.width ?? 340,
        height: node.size?.height ?? 240,
        recipe: map.get(node.id)!,
        machines: node.machines,
        variants: node.variants,
      })),
    ),
  }));
  const portY = (node: DiagramDocument["nodes"][number], handle: string) =>
    Math.round(node.position.y / GRID_SIZE) * GRID_SIZE +
    portRows.get(node.id)![handle] * GRID_SIZE;
  const itemColor = createPortColorResolver(
    doc.nodes.flatMap((node) => {
      const recipe = map.get(node.id);
      return recipe ? [recipe] : [];
    }),
  );
  const bends = doc.edges.flatMap((edge) => [
    ...(edge.waypoints ?? (edge.bend ? [edge.bend] : [])),
    ...(edge.labelPosition
      ? [
          edge.labelPosition,
          { x: edge.labelPosition.x + 400, y: edge.labelPosition.y + 80 },
        ]
      : []),
  ]);
  const minX = Math.min(
      0,
      ...doc.nodes.map((n) => n.position.x - 205),
      ...bends.map((point) => point.x - 50),
      ...(doc.areas ?? []).map((area) => area.position.x - 10),
    ),
    minY = Math.min(
      0,
      ...doc.nodes.map((n) => n.position.y - 45),
      ...bends.map((point) => point.y - 50),
      ...(doc.areas ?? []).map((area) => area.position.y - 10),
    );
  const width = Math.max(
      900,
      ...doc.nodes.map((n) => n.position.x + 560 - minX),
      ...bends.map((point) => point.x + 50 - minX),
      ...(doc.areas ?? []).map(
        (area) => area.position.x + area.width + 10 - minX,
      ),
    ),
    height = Math.max(
      550,
      ...doc.nodes.map((n) => n.position.y + 460 - minY),
      ...bends.map((point) => point.y + 50 - minY),
      ...(doc.areas ?? []).map(
        (area) => area.position.y + area.height + 10 - minY,
      ),
    );
  const images = new Map<string, string>();
  const paths = [
    ...new Set([
      ...[...map.values()].flatMap(
        (r) =>
          r.ingredients.map((i) => i.item.image).filter(Boolean) as string[],
      ),
      ...summaries.flatMap(({ summary }) =>
        summary.machines.flatMap((m) => (m.image ? [m.image] : [])),
      ),
    ]),
  ];
  await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Cannot export missing image: ${path}`);
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      images.set(path, data);
    }),
  );
  const text = (
    x: number,
    y: number,
    value: unknown,
    fill = "#e0e6e1",
    size = 12,
    anchor = "start",
  ) =>
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="${size}" text-anchor="${anchor}">${escape(value)}</text>`;
  let body = `<rect width="100%" height="100%" fill="#171c19"/>${text(30, 32, `${name} · GTNH 2.8.4`, "#b8d8bd", 18)}<g transform="translate(${-minX},${-minY + 50})">`;
  for (const { area, summary } of summaries) {
    const { x, y } = area.position;
    const number = (value: number) =>
      value.toLocaleString("en-US", { maximumFractionDigits: 3 });
    body += `<rect x="${x}" y="${y}" width="${area.width}" height="${area.height}" rx="8" fill="#173c64" fill-opacity="0.6" stroke="#488bc3" stroke-width="2"/>`;
    body += `<path d="M ${x + 8} ${y} H ${x + area.width - 8} Q ${x + area.width} ${y} ${x + area.width} ${y + 8} V ${y + 44} H ${x} V ${y + 8} Q ${x} ${y} ${x + 8} ${y} Z" fill="#153959"/>`;
    body += text(x + 12, y + 27, "Area summary", "#e8f4ff", 14);
    if (!summary.recipeCount) continue;
    body += text(
      x + 12,
      y + 66,
      `${number(summary.euPerTick)} EU/t · ${number(summary.totalEu)} EU total`,
      "#e8f4ff",
      14,
    );
    body += text(
      x + 12,
      y + 86,
      `${number(summary.machineCount)} machines · ${summary.recipeCount} recipes`,
      "#e8f4ff",
      12,
    );
    summary.machines.forEach((machine, index) => {
      const my = y + 98 + index * 24;
      const icon = machine.image && images.get(machine.image);
      if (icon)
        body += `<image href="${icon}" x="${x + 12}" y="${my}" width="20" height="20"/>`;
      body += text(
        x + 38,
        my + 15,
        `${number(machine.count)} × ${machine.name} (${machine.tier})`,
        "#e8f4ff",
        11,
      );
    });
    const top = y + 122 + summary.machines.length * 24;
    (
      [
        ["Needed", summary.inputs],
        ["Produced", summary.outputs],
      ] as const
    ).forEach(([title, items], column) => {
      const left = x + 12 + (column * area.width) / 2;
      body += text(left, top, title, "#9bd3ff", 12);
      if (!items.length) body += text(left, top + 20, "None", "#b2cbe1", 11);
      items.forEach(({ item, rate }, index) => {
        const iy = top + 8 + index * 24;
        const icon = item.image && images.get(item.image);
        if (icon)
          body += `<image href="${icon}" x="${left}" y="${iy}" width="20" height="20"/>`;
        body += text(
          left + 24,
          iy + 15,
          `${item.name.replace(/§[0-9a-fk-or]/gi, "")}: ${number(rate)} ${item.kind === "fluid" ? "mB" : "items"}/s`,
          "#e8f4ff",
          10,
        );
      });
    });
  }
  const labels: {
    route: ReturnType<typeof connectionRoute>;
    summary: ReturnType<typeof connectionSummary>;
    labelPosition?: { x: number; y: number };
  }[] = [];
  const inputSupply = new Map<string, number>();
  for (const edge of doc.edges) {
    const node = doc.nodes.find((n) => n.id === edge.source);
    const recipe = node && map.get(node.id);
    const output = recipe && port(recipe, edge.sourceHandle);
    const key = `${edge.target}/${edge.targetHandle}`;
    const supplied =
      node && recipe && output && hasRecipeTiming(recipe)
        ? rate(output, recipe, node.machines)
        : NaN;
    inputSupply.set(key, (inputSupply.get(key) ?? 0) + supplied);
  }
  for (const edge of doc.edges) {
    const a = doc.nodes.find((n) => n.id === edge.source),
      b = doc.nodes.find((n) => n.id === edge.target);
    if (!a || !b) continue;
    const ar = map.get(a.id)!,
      br = map.get(b.id)!,
      output = port(ar, edge.sourceHandle),
      input = port(br, edge.targetHandle);
    if (
      !input ||
      !output ||
      !hasIngredientPort(input) ||
      !hasIngredientPort(output)
    )
      continue;
    const x1 = a.position.x + 340,
      y1 = portY(a, edge.sourceHandle),
      x2 = b.position.x,
      y2 = portY(b, edge.targetHandle);
    const route = connectionRoute(
      { x: x1, y: y1 },
      { x: x2, y: y2 },
      edge.bend,
      edge.targetBendX,
      edge.waypoints,
    );
    const color = hasRecipeTiming(br)
      ? supplyColor(
          inputSupply.get(`${edge.target}/${edge.targetHandle}`) ?? NaN,
          rate(input, br, b.machines),
        )
      : connectionColors.unrated;
    body += `<path d="${route.path}" fill="none" stroke="${color}" stroke-width="2"/>`;
    const summary = connectionSummary(
      output,
      ar,
      a.machines,
      input,
      br,
      b.machines,
    );
    labels.push({ route, summary, labelPosition: edge.labelPosition });
  }
  for (const { route, summary, labelPosition } of labels) {
    const labelWidth = Math.max(
      220,
      summary.item.length * 7 + 20,
      (Math.max(summary.from.length, summary.target.length) * 7 + 20) * 2,
    );
    const position =
      labelPosition ??
      connectionLabelPosition(
        route,
        labelWidth,
        64,
        labels.map((label) => label.route.points),
      );
    const lx = position.x + labelWidth / 2,
      ly = position.y;
    body += `<rect x="${position.x}" y="${ly}" width="${labelWidth}" height="64" rx="3" fill="#242927"/>`;
    body += text(lx, ly + 16, summary.item, "#e7e7e5", 12, "middle");
    body += text(lx, ly + 32, summary.ratio, "#e7e7e5", 11, "middle");
    body += text(
      lx - labelWidth / 4,
      ly + 53,
      summary.from,
      "#e7e7e5",
      11,
      "middle",
    );
    body += text(lx, ly + 53, "→", "#a8b4ac", 12, "middle");
    body += text(
      lx + labelWidth / 4,
      ly + 53,
      summary.target,
      "#e7e7e5",
      11,
      "middle",
    );
  }
  for (const node of doc.nodes) {
    const r = map.get(node.id);
    if (!r) continue;
    const { x, y } = node.position;
    if (r.sourceItemId) {
      const item = r.ingredients[0].item;
      const image = item.image && images.get(item.image);
      body += `<g transform="translate(${x},${y})"><rect width="340" height="110" rx="3" fill="#c6c6c6" stroke="#555" stroke-width="3"/>${text(170, 24, "Item source", "#373737", 15, "middle")}${image ? `<image href="${image}" x="22" y="47" width="32" height="32"/>` : ""}${text(65, 67, item.name, "#373737", 12)}<circle cx="340" cy="${portY(node, "output:0") - y}" r="6" fill="#171c19" stroke="${itemColor(item.id)}" stroke-width="2"/></g>`;
      continue;
    }
    body += `<g transform="translate(${x},${y})"><rect width="340" height="240" rx="3" fill="#c6c6c6" stroke="#555" stroke-width="3"/><path d="M0,240 V0 H340" fill="none" stroke="#fff" stroke-width="3"/>${text(170, 24, r.handler, "#373737", 15, "middle")}`;
    for (const direction of ["input", "output"]) {
      r.ingredients
        .filter((i) => i.direction === direction)
        .forEach((i, index) => {
          const slotX = (direction === "input" ? 22 : 224) + (index % 2) * 38,
            slotY = 69 + Math.floor(index / 2) * 37;
          body += `<rect x="${slotX + 1}" y="${slotY + 1}" width="34" height="34" fill="#8b8b8b" stroke="#373737" stroke-width="2"/>`;
          const image = i.item.image && images.get(i.item.image);
          if (image)
            body += `<image href="${image}" x="${slotX + 2}" y="${slotY + 2}" width="32" height="32" style="image-rendering:pixelated"/>`;
          body += text(
            slotX + 32,
            slotY + 31,
            `${i.amount}${i.item.kind === "fluid" ? "L" : ""}`,
            "#fff",
            12,
            "end",
          );
          if (!hasIngredientPort(i)) return;
          const px = direction === "input" ? 0 : 340,
            py = portY(node, `${direction}:${i.slot}`) - node.position.y;
          const connected = doc.edges.some((edge) =>
            direction === "input"
              ? edge.target === node.id &&
                edge.targetHandle === `${direction}:${i.slot}`
              : edge.source === node.id &&
                edge.sourceHandle === `${direction}:${i.slot}`,
          );
          body += `<circle cx="${px}" cy="${py}" r="6" fill="#171c19" stroke="${itemColor(i.itemId)}" stroke-width="2"/>`;
          if (!connected)
            body += text(
              px + (direction === "input" ? -12 : 12),
              py - 3,
              i.item.name,
              "#e0e6e1",
              11,
              direction === "input" ? "end" : "start",
            );
          if (!connected && hasRecipeTiming(r))
            body += text(
              px + (direction === "input" ? -12 : 12),
              py + 12,
              `${rate(i, r, node.machines).toFixed(3)} ${i.item.kind === "fluid" ? "mB" : "items"}/s`,
              "#98a599",
              10,
              direction === "input" ? "end" : "start",
            );
        });
    }
    const power = recipePowerInfo(r);
    body += `${text(155, 97, "→", "#666", 26)}${text(20, 158, `Time: ${r.durationTicks / 20}s`, "#373737", 12)}${power.voltage ? text(20, 174, power.voltage, "#373737", 12) : ""}${power.amperage ? text(20, 190, power.amperage, "#373737", 12) : ""}${text(14, 218, "Machines", "#373737")}<rect x="240" y="199" width="86" height="28" fill="#555" stroke="#373737"/>${text(250, 218, node.machines, "#fff")}</g>`;
  }
  body += "</g>";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 50}" viewBox="0 0 ${width} ${height + 50}">${body}</svg>`;
  if (format === "svg") download(svg, `${name}.svg`, "image/svg+xml");
  else {
    const { jsPDF } = await import("jspdf");
    await import("svg2pdf.js");
    const scale = Math.min(1, 14000 / Math.max(width, height + 50));
    const pdf = new jsPDF({
      orientation: width >= height + 50 ? "landscape" : "portrait",
      unit: "pt",
      format: [width * scale, (height + 50) * scale],
    });
    const element = new DOMParser().parseFromString(
      svg,
      "image/svg+xml",
    ).documentElement;
    await pdf.svg(element, {
      width: width * scale,
      height: (height + 50) * scale,
    });
    pdf.save(`${name.replace(/[<>:"/\\|?*]/g, "-")}.pdf`);
  }
}
