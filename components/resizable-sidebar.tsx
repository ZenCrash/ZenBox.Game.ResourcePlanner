"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { useDisplaySettings } from "./display-settings";

export function ResizableSidebar({ side, defaultWidth, children }: {
  side: "left" | "right";
  defaultWidth: number;
  children: (collapse: () => void) => ReactNode;
}) {
  const { settings } = useDisplaySettings();
  const collapsedWidth = 36 * (side === "right" ? settings.guiScale : 1);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(defaultWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [maximum, setMaximum] = useState(defaultWidth);
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    const measure = () => setMaximum(parent.clientWidth / 3);
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    measure();
    return () => observer.disconnect();
  }, []);
  const resize = (requested: number) => {
    if (requested < 150) setCollapsed(true);
    else {
      setCollapsed(false);
      setWidth(Math.min(maximum, Math.max(180, requested)));
    }
  };
  const ExpandIcon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  return <div ref={root} className={`resizable-sidebar sidebar-${side}${collapsed ? " is-collapsed" : ""}`} style={{ width: collapsed ? collapsedWidth : Math.min(width, maximum) }}>
    {collapsed && <button className="sidebar-expand" type="button" title={`Expand ${side} sidebar`} aria-label={`Expand ${side} sidebar`} onClick={() => setCollapsed(false)}><ExpandIcon size={18} /></button>}
    <div className="resizable-sidebar-content" hidden={collapsed}>{children(() => setCollapsed(true))}</div>
    <div
      className="sidebar-resize-handle"
      role="separator"
      aria-label={`Resize ${side} sidebar`}
      aria-orientation="vertical"
      aria-valuemin={Math.round(collapsedWidth)}
      aria-valuemax={Math.floor(maximum)}
      aria-valuenow={Math.round(collapsed ? collapsedWidth : Math.min(width, maximum))}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const delta = (event.key === "ArrowRight" ? 20 : -20) * (side === "left" ? 1 : -1);
        resize(collapsed && delta > 0 ? 180 : Math.min(width, maximum) + delta);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { x: event.clientX, width: collapsed ? collapsedWidth : Math.min(width, maximum) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        resize(drag.current.width + (event.clientX - drag.current.x) * (side === "left" ? 1 : -1));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
    />
  </div>;
}
