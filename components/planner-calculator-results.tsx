"use client";
import { useEffect, useRef, useState } from 'react';
import type { AreaSummary } from '@/lib/area-summary';
import type { SummaryCalculation } from '@/lib/summary-rate';
import { SummaryRateCalculator } from './summary-rate-calculator';

export function PlannerCalculatorResults({ summary, calculators }: { summary: AreaSummary; calculators: SummaryCalculation[] }) {
  const container = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 28 });
  useEffect(() => {
    const outer = container.current, inner = row.current;
    if (!outer || !inner) return;
    const measure = () => {
      const scale = Math.min(1, outer.clientWidth / Math.max(1, inner.offsetWidth));
      const height = inner.offsetHeight * scale;
      setSize(previous => previous.scale === scale && previous.height === height ? previous : { scale, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="planner-calculator-results-fit" style={{ height: size.height + 16 }} aria-label="Suggestion calculator results">
    <div ref={row} className="planner-calculator-results" style={{ transform: `scale(${size.scale})` }}>
      {calculators.map(calculation => <SummaryRateCalculator key={calculation.id} summary={summary} calculation={calculation} readOnly onChange={() => {}} />)}
    </div>
  </div>;
}
