"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PortItemHighlightContext = createContext({
  itemId: null as string | null,
  hover: (_itemId: string | null) => {},
  hold: (_itemId: string) => {},
});

export const usePortItemHighlight = () => useContext(PortItemHighlightContext);

// Only the outline is portaled, leaving the item and its interactions in place.
export function PortItemOutline() {
  const anchor = useRef<HTMLSpanElement>(null);
  const [bounds, setBounds] = useState<{
    left: number; top: number; width: number; height: number;
    borderLeftWidth: number; borderRightWidth: number;
    borderTopWidth: number; borderBottomWidth: number;
  } | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const item = anchor.current?.parentElement;
      if (!item || item.closest(".machine-card-overview")) {
        setBounds(null);
      } else {
        const rect = item.getBoundingClientRect();
        const style = getComputedStyle(item);
        const scaleX = rect.width / (item.offsetWidth || 1);
        const scaleY = rect.height / (item.offsetHeight || 1);
        const left = parseFloat(style.borderLeftWidth) * scaleX;
        const right = parseFloat(style.borderRightWidth) * scaleX;
        const top = parseFloat(style.borderTopWidth) * scaleY;
        const bottom = parseFloat(style.borderBottomWidth) * scaleY;
        const next = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderLeftWidth: left,
          borderRightWidth: right,
          borderTopWidth: top,
          borderBottomWidth: bottom,
        };
        setBounds((previous) =>
          previous?.left === next.left && previous.top === next.top &&
          previous.width === next.width && previous.height === next.height &&
          previous.borderLeftWidth === left && previous.borderRightWidth === right &&
          previous.borderTopWidth === top && previous.borderBottomWidth === bottom
            ? previous
            : next,
        );
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <>
    <span ref={anchor} hidden />
    {bounds && createPortal(<span aria-hidden="true" className="port-item-outline" style={bounds} />, document.body)}
  </>;
}

export function PortItemHighlight({ children }: { children: ReactNode }) {
  const [hovered, hover] = useState<string | null>(null);
  const [held, hold] = useState<string | null>(null);
  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.button === 0) hold(null);
    };
    const cancel = () => { hold(null); hover(null); };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return (
    <PortItemHighlightContext.Provider value={{ itemId: held ?? hovered, hover, hold }}>
      {children}
    </PortItemHighlightContext.Provider>
  );
}
