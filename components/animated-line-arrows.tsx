"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ItemTooltipLines } from "./item-tooltip-lines";
import { ItemTooltip } from "./item-tooltip";
import { MinecraftText } from "./minecraft-text";
import { useDisplaySettings } from "./display-settings";
import type { Item } from "@/lib/model";
import type { Point } from "@/lib/diagram-geometry";
import { animatedDirectionMarkers } from "@/lib/line-direction";

type Animation = { points: Point[]; phase?: number; spacing?: number };
const listeners = new Map<Animation, (seconds: number) => void>();
let frame: number | undefined;
let clockStart = 0;
let elapsed = 0;
function tick(time: number) {
  elapsed = Math.max(0, (time - clockStart) / 1000);
  for (const draw of listeners.values()) draw(elapsed);
  frame = listeners.size ? requestAnimationFrame(tick) : undefined;
}

export function AnimatedLineArrows({ idPrefix, points, phase, color, scale = 1, item }: { item?: Item; idPrefix: string; points: Point[]; phase?: number; color: string; scale?: number }) {
  const { settings } = useDisplaySettings();
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const hoveredMarker = useRef<SVGElement | null>(null);
  const arrowScale = useRef(scale);
  arrowScale.current = scale * (item ? settings.animatedItemSize : 1);
  const group = useRef<SVGGElement>(null);
  const horizontalGroup = useRef<SVGGElement>(null);
  const verticalGroup = useRef<SVGGElement>(null);
  const animation = useRef<Animation>({ points });
  animation.current.points = points;
  animation.current.phase = phase;
  animation.current.spacing = item ? settings.animatedItemSpacing : undefined;
  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    if (!listeners.size) { clockStart = performance.now(); elapsed = 0; }
    const born = elapsed;
    const paths: SVGElement[] = [];
    const draw = (seconds: number) => {
      const markers = animatedDirectionMarkers(animation.current.points, seconds, animation.current.phase, animation.current.spacing);
      markers.forEach((marker, index) => {
        if (!paths[index]) {
          const ns = "http://www.w3.org/2000/svg";
          const path = document.createElementNS(ns, item ? "g" : "path");
          if (item) {
            path.style.pointerEvents = "all";
            const showTooltip = (event: Event) => {
              const pointer = event as PointerEvent;
              if (pointer.pointerType === "touch") return;
              hoveredMarker.current = path;
              setHoverPoint({ x: pointer.clientX, y: pointer.clientY });
            };
            path.addEventListener("pointerenter", showTooltip);
            path.addEventListener("pointermove", showTooltip);
            path.addEventListener("pointerleave", () => {
              if (hoveredMarker.current === path) {
                hoveredMarker.current = null;
                setHoverPoint(null);
              }
            });
            const bounds = document.createElementNS(ns, "rect");
            bounds.setAttribute("x", "-12"); bounds.setAttribute("y", "-12");
            bounds.setAttribute("width", "24"); bounds.setAttribute("height", "24");
            bounds.style.pointerEvents = "all";
            bounds.setAttribute("fill", "transparent"); bounds.setAttribute("stroke", "none");
            path.appendChild(bounds);
            if (item.image) {
              const image = document.createElementNS(ns, "image");
              image.setAttribute("href", item.image);
              image.setAttribute("x", "-12"); image.setAttribute("y", "-12");
              image.setAttribute("width", "24"); image.setAttribute("height", "24");
              image.style.pointerEvents = "all";
              image.style.imageRendering = "pixelated";
              path.appendChild(image);
            } else {
              const text = document.createElementNS(ns, "text");
              text.textContent = "?"; text.setAttribute("text-anchor", "middle");
              text.setAttribute("y", "5"); text.setAttribute("fill", "white");
              path.appendChild(text);
            }
            if (item.kind === "fluid") {
              const border = bounds.cloneNode() as SVGRectElement;
              border.setAttribute("stroke", "black"); border.setAttribute("stroke-width", "1");
              border.setAttribute("vector-effect", "non-scaling-stroke");
              path.appendChild(border);
            }
          } else path.setAttribute("d", "M8,0 L-6,-9 L-6,9 Z");
          element.appendChild(path);
          paths.push(path);
        }
        paths[index].setAttribute("transform", `translate(${marker.x},${marker.y}) rotate(${item ? 0 : marker.angle}) scale(${arrowScale.current})`);
        const parent = Math.abs(marker.angle) % 180 === 0 ? horizontalGroup.current : verticalGroup.current;
        if (parent && paths[index].parentNode !== parent) parent.appendChild(paths[index]);
        paths[index].setAttribute("opacity", String(marker.opacity));
      });
      while (paths.length > markers.length) {
        const removed = paths.pop()!;
        if (hoveredMarker.current === removed) { hoveredMarker.current = null; setHoverPoint(null); }
        removed.remove();
      }
    };
    const state = animation.current;
    listeners.set(state, draw);
    draw(born);
    if (frame === undefined) frame = requestAnimationFrame(tick);
    return () => {
      listeners.delete(state);
      hoveredMarker.current = null;
      setHoverPoint(null);
      paths.forEach((path) => path.remove());
      if (!listeners.size && frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
    };
  }, [item?.image, item?.name, item?.kind]);
  return <><g ref={group} pointerEvents={item ? "all" : "none"} fill={color} stroke="#242424" strokeWidth={1} strokeLinejoin="round">
    <g ref={horizontalGroup} id={`${idPrefix}-horizontal`} />
    <g ref={verticalGroup} id={`${idPrefix}-vertical`} />
  </g>
    {item && <ItemTooltip anchorRef={group} pointerPosition={hoverPoint} followPointer>
      <strong><MinecraftText text={item.name} /></strong>
      <ItemTooltipLines item={item} />
      {settings.showItemIds && <small>{item.registryId}:{item.metadata}</small>}
      <em>{item.mod}</em>
    </ItemTooltip>}
  </>;
}
