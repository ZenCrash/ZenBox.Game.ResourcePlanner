"use client";

import { useId } from "react";
import { useViewport } from "@xyflow/react";
import { GRID_SIZE } from "@/lib/diagram-geometry";

const MIN_DOT_SPACING = 12;

export function GridBackground() {
  const { x, y, zoom } = useViewport();
  const id = useId();
  // Show every 1st, 2nd, 4th, 8th… intersection, at least 12 screen pixels apart.
  const stride =
    2 **
    Math.max(0, Math.ceil(Math.log2(MIN_DOT_SPACING / (GRID_SIZE * zoom))));
  const gap = GRID_SIZE * zoom * stride;

  return (
    <svg className="grid-background" aria-hidden="true">
      <defs>
        <pattern
          id={`${id}-dots`}
          x={(x % gap) - gap / 2}
          y={(y % gap) - gap / 2}
          width={gap}
          height={gap}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={gap / 2} cy={gap / 2} r="1" fill="#272727" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />
    </svg>
  );
}
