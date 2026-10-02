"use client";
import { memo, type ReactNode } from "react";

/** Defer both rendering and the sidebar's membership calculations until release. */
export const FrozenGroupingSidebar = memo(function FrozenGroupingSidebar({ render }: { frozen: boolean; render: () => ReactNode }) {
  return render();
}, (_previous, next) => next.frozen);
