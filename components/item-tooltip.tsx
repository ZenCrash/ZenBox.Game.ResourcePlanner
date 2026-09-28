"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function ItemTooltip({
  children,
  followPointer = true,
  compact = false,
  tight = false,
  placement = "side-right",
}: {
  children: ReactNode;
  followPointer?: boolean;
  compact?: boolean;
  tight?: boolean;
  placement?: "left" | "top-right" | "side-left" | "side-right";
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const button = anchor.current?.parentElement;
    if (!button) return;
    const showAtItem = () => {
      const bounds = button.getBoundingClientRect();
      setPoint(
        placement === "side-left" || placement === "side-right"
          ? {
              x: placement === "side-left" ? bounds.left : bounds.right,
              y: bounds.top,
            }
          : { x: bounds.right - 20, y: bounds.top - 8 },
      );
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (followPointer) setPoint({ x: event.clientX, y: event.clientY });
      else showAtItem();
    };
    const focus = () => {
      if (!followPointer) return showAtItem();
      const bounds = button.getBoundingClientRect();
      setPoint({ x: bounds.right, y: bounds.top });
    };
    const hide = () => setPoint(null);
    button.addEventListener("pointerenter", move);
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("focus", focus);
    button.addEventListener("blur", hide);
    button.addEventListener("click", hide);
    button.addEventListener("dragstart", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      button.removeEventListener("pointerenter", move);
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerleave", hide);
      button.removeEventListener("focus", focus);
      button.removeEventListener("blur", hide);
      button.removeEventListener("click", hide);
      button.removeEventListener("dragstart", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [followPointer, placement]);

  useLayoutEffect(() => {
    if (!point || !tooltip.current) return;
    const element = tooltip.current;
    const position = () => {
      const bounds = element.getBoundingClientRect();
      const right = point.x + 14;
      const left = point.x - bounds.width - 14;
      // Pointer tooltips prefer the right; port hints retain their explicit side.
      const preferLeft = !followPointer && (placement === "left" || placement === "side-left");
      const x = preferLeft
        ? (left >= 8 ? left : right)
        : (right + bounds.width <= window.innerWidth - 8 ? right : left);
      // Anchor the first row, so additional rows grow down instead of recentering.
      // Only shift upward when needed to keep the bottom inside the viewport.
      const y = point.y - (followPointer ? 16 : 0);
      element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [point, children, followPointer, placement]);
  return (
    <>
      <span ref={anchor} hidden />
      {point &&
        createPortal(
          <span
            ref={tooltip}
            role="tooltip"
            className={`item-tooltip foreground-item-tooltip${compact ? " compact-item-tooltip" : ""}${tight ? " tight-item-tooltip" : ""}`}
          >
            {children}
          </span>,
          document.body,
        )}
    </>
  );
}
