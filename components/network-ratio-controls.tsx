"use client";
import { Minus, Plus, Workflow } from "lucide-react";
import { stepMachineRatio } from "@/lib/perfect-ratio";
import { ItemTooltip } from "./item-tooltip";

export function NetworkRatioControls({ base, current, apply, includeInfo = false }: {
  base: Record<string, number> | null;
  current: Record<string, number>;
  apply: (counts: Record<string, number>) => void;
  includeInfo?: boolean;
}) {
  return <div className={`line-ratio-controls network-ratio-option${includeInfo ? " info-ratio-option" : ""}`}>
    <div className="line-ratio-action" aria-disabled={!base}>
      <Workflow size={20} />Set machines to perfect ratio
      <ItemTooltip compact followPointer placement="top-right">
        <strong>Set machines to perfect ratio</strong>
        <span>Balances the chosen network with whole machine counts, then scales that ratio together. {includeInfo ? "Includes info lines using fluid/container capacities." : "Info lines are excluded."}</span>
        {!base && <span>No supported whole-machine solution was found.</span>}
      </ItemTooltip>
    </div>
    {([-1, 1] as const).map(step => {
      const counts = stepMachineRatio(base, current, step);
      const enabled = !!counts && Object.entries(counts).some(([id, count]) => current[id] !== count);
      const title = `${step === 1 ? "Increase" : "Decrease"} perfect machine ratio${includeInfo ? " including info lines" : ""}`;
      const Icon = step === 1 ? Plus : Minus;
      return <button key={step} className="line-ratio-step" role="menuitem" type="button" aria-label={title} disabled={!enabled}
        onClick={() => { if (counts) apply(counts); }}>
        <Icon size={14} />
        <ItemTooltip compact followPointer placement="top-right"><strong>{title}</strong>
          <span>{step === 1 ? "If unbalanced, rounds up to a balanced ratio without lowering any count. Otherwise adds one ratio unit." : "If unbalanced, rounds down toward a balanced ratio. Otherwise removes one ratio unit. If no lower perfect ratio is available, resets all affected machines to 1."}</span>
        </ItemTooltip>
      </button>;
    })}
  </div>;
}
