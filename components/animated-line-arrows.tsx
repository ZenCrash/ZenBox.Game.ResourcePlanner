"use client";
import { useLayoutEffect, useRef } from "react";
import type { Point } from "@/lib/diagram-geometry";
import { animatedDirectionMarkers } from "@/lib/line-direction";

type Animation = { points: Point[] };
const listeners = new Map<Animation, (seconds: number) => void>();
let frame: number | undefined;
let clockStart = 0;
let elapsed = 0;
function tick(time: number) {
  elapsed = Math.max(0, (time - clockStart) / 1000);
  for (const draw of listeners.values()) draw(elapsed);
  frame = listeners.size ? requestAnimationFrame(tick) : undefined;
}

export function AnimatedLineArrows({ idPrefix, points, color, scale = 1 }: { idPrefix: string; points: Point[]; color: string; scale?: number }) {
  const arrowScale = useRef(scale);
  arrowScale.current = scale;
  const group = useRef<SVGGElement>(null);
  const horizontalGroup = useRef<SVGGElement>(null);
  const verticalGroup = useRef<SVGGElement>(null);
  const animation = useRef<Animation>({ points });
  animation.current.points = points;
  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    if (!listeners.size) { clockStart = performance.now(); elapsed = 0; }
    const born = elapsed;
    const paths: SVGPathElement[] = [];
    const draw = (seconds: number) => {
      const markers = animatedDirectionMarkers(animation.current.points, seconds);
      markers.forEach((marker, index) => {
        if (!paths[index]) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "M8,0 L-6,-9 L-6,9 Z");
          element.appendChild(path);
          paths.push(path);
        }
        paths[index].setAttribute("transform", `translate(${marker.x},${marker.y}) rotate(${marker.angle}) scale(${arrowScale.current})`);
        const parent = Math.abs(marker.angle) % 180 === 0 ? horizontalGroup.current : verticalGroup.current;
        if (parent && paths[index].parentNode !== parent) parent.appendChild(paths[index]);
        paths[index].setAttribute("opacity", String(marker.opacity));
      });
      while (paths.length > markers.length) paths.pop()!.remove();
    };
    const state = animation.current;
    listeners.set(state, draw);
    draw(born);
    if (frame === undefined) frame = requestAnimationFrame(tick);
    return () => {
      listeners.delete(state);
      paths.forEach((path) => path.remove());
      if (!listeners.size && frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
    };
  }, []);
  return <g ref={group} pointerEvents="none" fill={color} stroke="#242424" strokeWidth={1} strokeLinejoin="round">
    <g ref={horizontalGroup} id={`${idPrefix}-horizontal`} />
    <g ref={verticalGroup} id={`${idPrefix}-vertical`} />
  </g>;
}
