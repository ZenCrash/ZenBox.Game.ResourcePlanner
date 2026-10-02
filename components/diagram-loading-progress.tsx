"use client";
import { useLayoutEffect, useState, type CSSProperties } from "react";

/** Cosmetic progress; the parent dismisses the popup only when loading finishes. */
export function DiagramLoadingProgress() {
  const [startPercent, setStartPercent] = useState(10);
  const [jumpPercent, setJumpPercent] = useState(50);
  const [percent, setPercent] = useState(10);
  useLayoutEffect(() => {
    const initial = 10 + Math.floor(Math.random() * 21);
    const jump = 50 + Math.floor(Math.random() * 21);
    setJumpPercent(jump);
    setStartPercent(initial);
    setPercent(initial);
    const started = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - started;
      const next = elapsed < 500 ? initial : Math.min(99, jump + Math.floor((elapsed - 500) / 1500 * (99 - jump)));
      setPercent(next);
      if (next === 99) window.clearInterval(timer);
    }, 30);
    return () => window.clearInterval(timer);
  }, []);
  return <>
    <div className="diagram-loading-bar" role="progressbar" aria-label="Loading diagram" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={{ "--loading-start": startPercent / 100, "--loading-jump": jumpPercent / 100 } as CSSProperties}><span /></div>
    <strong className="diagram-loading-percent" aria-hidden="true">
      <span className="diagram-loading-numbers">
        {[startPercent, ...Array.from({ length: 100 - jumpPercent }, (_, index) => jumpPercent + index)].map((value, index) => <span key={value} style={{
          animationName: value === 99 ? "diagram-number-hold" : "diagram-number-show",
          animationDelay: index === 0 ? "0s" : `${0.5 + (value - jumpPercent) * 1.5 / (99 - jumpPercent)}s`,
          animationDuration: index === 0 ? "0.5s" : value === 99 ? "0.001s" : `${1.5 / (99 - jumpPercent)}s`,
          animationFillMode: value === 99 ? "forwards" : "none",
        }}>{value}%</span>)}
      </span>
    </strong>
  </>;
}
