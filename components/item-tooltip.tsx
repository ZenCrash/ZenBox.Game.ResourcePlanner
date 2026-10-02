"use client";

import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { tooltipModifierMask } from '@/lib/item-tooltip-variants';
export const TooltipModifierContext = createContext(0);

export function ItemTooltip({
  children,
  anchorRef,
  pointerPosition,
  anchorContainerSelector,
  followPointer = true,
  compact = false,
  tight = false,
  placement = "side-right",
}: {
  children: ReactNode;
  pointerPosition?: { x: number; y: number } | null;
  anchorRef?: RefObject<SVGGElement | null>;
  anchorContainerSelector?: string;
  followPointer?: boolean;
  compact?: boolean;
  tight?: boolean;
  placement?: "left" | "top-right" | "side-left" | "side-right" | "top-end";
}) {
  const [modifierMask, setModifierMask] = useState(0);
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [hoverPoint, setPoint] = useState<{ x: number; y: number } | null>(null);
  const point = pointerPosition !== undefined ? pointerPosition : hoverPoint;

  useEffect(() => {
    if (pointerPosition !== undefined) return;
    const button = anchorRef?.current ?? anchor.current?.parentElement;
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
    const move = (inputEvent: Event) => {
      const event = inputEvent as PointerEvent;
      setModifierMask(tooltipModifierMask(event));
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
  }, [followPointer, placement, anchorRef, pointerPosition]);

  const visible = !!point;
  useEffect(() => {
    if (!visible) return;
    const update = (event: KeyboardEvent | PointerEvent) => setModifierMask(tooltipModifierMask(event));
    const reset = () => setModifierMask(0);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('pointermove', update);
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('keydown', update); window.removeEventListener('keyup', update); window.removeEventListener('pointermove', update); window.removeEventListener('blur', reset); };
  }, [visible]);

  useLayoutEffect(() => {
    if (!point || !tooltip.current) return;
    const element = tooltip.current;
    const trigger = anchorRef?.current ?? anchor.current?.parentElement;
    const container = anchorContainerSelector ? trigger?.closest(anchorContainerSelector) : trigger;
    const position = () => {
      if (placement === "top-end" && container) {
        const area = container.getBoundingClientRect();
        element.style.maxWidth = Math.max(0, Math.min(area.right - 16, window.innerWidth - 16)) + "px";
        element.style.maxHeight = Math.max(0, area.top - 16) + "px";
        const size = element.getBoundingClientRect();
        element.style.left = Math.max(8, area.right - size.width - 8) + "px";
        element.style.top = Math.max(8, area.top - size.height - 8) + "px";
        return;
      }
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
    if (container && placement === "top-end") observer.observe(container);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [point, children, followPointer, placement, anchorRef, anchorContainerSelector]);
  return (
    <>
      {!anchorRef && <span ref={anchor} hidden />}
      {point &&
        createPortal(
          <span
            ref={tooltip}
            role="tooltip"
            className={`item-tooltip foreground-item-tooltip${compact ? " compact-item-tooltip" : ""}${tight ? " tight-item-tooltip" : ""}`}
          >
            <TooltipModifierContext.Provider value={modifierMask}>{children}</TooltipModifierContext.Provider>
          </span>,
          document.body,
        )}
    </>
  );
}
