"use client";
import { GRID_SIZE } from "@/lib/diagram-geometry";
import { useLayoutEffect, useRef, type RefObject } from "react";

type Measurement = { card: HTMLElement; save: (width: number) => void };
const pending = new Map<HTMLElement, Measurement>();
let frame: number | undefined;
function schedule(measurement: Measurement) {
  pending.set(measurement.card, measurement);
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    const batch = [...pending.values()].filter(({ card }) => card.isConnected);
    pending.clear();
    // Write together, read together, then apply together: one layout pass per batch.
    const saved = batch.map(({ card }) => card.style.width);
    batch.forEach(({ card }) => { card.style.width = "max-content"; });
    const widths = batch.map(({ card }) => Math.ceil(Math.max(352, card.offsetWidth) / GRID_SIZE) * GRID_SIZE);
    batch.forEach(({ card, save }, i) => {
      card.style.width = saved[i];
      card.style.setProperty("--recipe-card-width", `${widths[i]}px`);
      save(widths[i]);
    });
  });
}

/** Cache each configuration's width; never measure on pointer movement. */
export function useRecipeCardWidth(ref: RefObject<HTMLDivElement | null>, content: object, deferred: boolean, mode: string, scale: number) {
  const cache = useRef(new WeakMap<object, Map<string, number>>());
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const key = `${mode}/${scale}`;
    const known = cache.current.get(content)?.get(key);
    if (known !== undefined) {
      card.style.setProperty("--recipe-card-width", `${known}px`);
      return;
    }
    if (deferred) return;
    schedule({ card, save: width => {
      let values = cache.current.get(content);
      if (!values) { values = new Map(); cache.current.set(content, values); }
      values.set(key, width);
    } });
    return () => { pending.delete(card); };
  }, [ref, content, deferred, mode, scale]);
}
