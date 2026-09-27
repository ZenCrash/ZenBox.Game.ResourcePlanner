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
  followPointer = false,
  compact = false,
  placement = "left",
}: {
  children: ReactNode;
  followPointer?: boolean;
  compact?: boolean;
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
              y: bounds.top + bounds.height / 2,
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
      setPoint({ x: bounds.left, y: bounds.top + bounds.height / 2 });
    };
    const hide = () => setPoint(null);
    button.addEventListener("pointerenter", move);
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("focus", focus);
    button.addEventListener("blur", hide);
    button.addEventListener("click", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      button.removeEventListener("pointerenter", move);
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerleave", hide);
      button.removeEventListener("focus", focus);
      button.removeEventListener("blur", hide);
      button.removeEventListener("click", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [followPointer, placement]);

  useLayoutEffect(() => {
    if (!point || !tooltip.current) return;
    const element = tooltip.current;
    const bounds = element.getBoundingClientRect();
    const left =
      placement === "top-right" || placement === "side-right"
        ? point.x + 14
        : point.x - bounds.width - (followPointer || placement === "side-left" ? 14 : 0);
    const top =
      placement === "side-left" || placement === "side-right"
        ? point.y - bounds.height / 2
        : placement === "top-right"
        ? point.y - bounds.height - 14
        : point.y - (followPointer ? 16 : bounds.height);
    element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
  }, [point, children, followPointer, placement]);
  return (
    <>
      <span ref={anchor} hidden />
      {point &&
        createPortal(
          <span
            ref={tooltip}
            role="tooltip"
            className={`item-tooltip foreground-item-tooltip${compact ? " compact-item-tooltip" : ""}`}
          >
            {children}
          </span>,
          document.body,
        )}
    </>
  );
}
