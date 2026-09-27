"use client";

import { useRef, useState, type ReactNode } from "react";
import { useReactFlow } from "@xyflow/react";

const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export function PlannerWindow({ x, y, wheelBoundary, children }: { x: number; y: number; wheelBoundary: string; children: ReactNode }) {
  const flow = useReactFlow();
  const [bounds, setBounds] = useState({ x, y, width: 1100, height: 600 });
  const gesture = useRef<{ pointerId: number; clientX: number; clientY: number; zoom: number; direction: string; bounds: typeof bounds } | null>(null);
  return <div className={`planner-floating-window nodrag nopan nowheel ${wheelBoundary}`}
    style={{ transform: `translate(${bounds.x}px, ${bounds.y}px)`, width: bounds.width, height: bounds.height }}
    onPointerDownCapture={event => {
      if (event.button !== 0) return;
      const element = event.target as HTMLElement;
      // Do not intercept interactions with a planner nested inside this one.
      if (element.closest(".planner-floating-window") !== event.currentTarget) return;
      const grip = element.closest<HTMLElement>("[data-window-resize]");
      const header = element.closest(".recipe-browser-heading");
      if (!grip && (!header || element.closest("button, input, select"))) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, zoom: flow.getZoom(), direction: grip?.dataset.windowResize ?? "move", bounds };
    }}
    onPointerMove={event => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const dx = (event.clientX - active.clientX) / active.zoom;
      const dy = (event.clientY - active.clientY) / active.zoom;
      const b = active.bounds, d = active.direction;
      if (d === "move") setBounds({ ...b, x: b.x + dx, y: b.y + dy });
      else {
        const width = Math.max(640, b.width + (d.includes("w") ? -dx : d.includes("e") ? dx : 0));
        const height = Math.max(360, b.height + (d.includes("n") ? -dy : d.includes("s") ? dy : 0));
        setBounds({ width, height, x: b.x + (d.includes("w") ? b.width - width : 0), y: b.y + (d.includes("n") ? b.height - height : 0) });
      }
    }}
    onPointerUp={event => {
      if (gesture.current?.pointerId !== event.pointerId) return;
      gesture.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { gesture.current = null; }}
    onLostPointerCapture={() => { gesture.current = null; }}
  >
    {children}
    {directions.map(direction => <div key={direction} className={`planner-window-resize planner-window-resize-${direction}`} data-window-resize={direction} title="Resize planner window" />)}
  </div>;
}
