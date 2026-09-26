"use client";
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { AreaSummary } from "@/lib/area-summary";
import {
  convertSummaryRate,
  type SummaryCalculation,
} from "@/lib/summary-rate";

type Flow = AreaSummary["inputs"][number];
const name = (flow: Flow) => flow.item.name.replace(/§[0-9a-fk-or]/gi, "");
const format = (value: number | null) =>
  value === null ? "" : String(Number(value.toPrecision(12)));

function ResourcePicker({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: Flow[];
  selected: Flow;
  onSelect: (id: string) => void;
}) {
  const flyout = useRef<HTMLDivElement>(null);
  return (
    <div className="summary-resource-picker">
      <button
        type="button"
        className="summary-resource-trigger"
        aria-haspopup="menu"
        aria-label={`${label} resource: ${name(selected)}`}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const menu = flyout.current;
          if (!menu) return;
          menu.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 260))}px`;
          menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 240))}px`;
          menu.showPopover();
        }}
      >
        {selected.item.image && <img src={selected.item.image} alt="" />}
        <span>{name(selected)}</span>
        <ChevronDown size={14} />
      </button>
      <div
        ref={flyout}
        popover="auto"
        role="menu"
        aria-label={`${label} resources`}
        className="summary-resource-options nodrag nopan nowheel"
      >
        {items.map((flow) => (
          <button
            key={flow.item.id}
            type="button"
            role="menuitemradio"
            aria-checked={flow.item.id === selected.item.id}
            onClick={() => {
              onSelect(flow.item.id);
              flyout.current?.hidePopover();
            }}
          >
            {flow.item.image && <img src={flow.item.image} alt="" />}
            <span>{name(flow)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SummaryRateCalculator({
  summary,
  calculation: edit,
  onChange,
}: {
  summary: AreaSummary;
  calculation: SummaryCalculation;
  onChange: (value: SummaryCalculation) => void;
}) {
  const { inputId, outputId } = edit;
  const setInputId = (inputId: string) => onChange({ ...edit, inputId });
  const setOutputId = (outputId: string) => onChange({ ...edit, outputId });
  const input = summary.inputs.find((flow) => flow.item.id === inputId);
  const output = summary.outputs.find((flow) => flow.item.id === outputId);
  if (!input || !output)
    return (
      <small>
        Selected resource is no longer in this area&apos;s inputs or outputs.
      </small>
    );
  const numeric = edit?.value.trim() ? Number(edit.value) : null;
  const inputValue = !edit
    ? format(input.rate)
    : edit.side === "input"
      ? edit.value
      : numeric === null
        ? ""
        : format(convertSummaryRate(numeric, output.rate, input.rate));
  const outputValue = !edit
    ? format(output.rate)
    : edit.side === "output"
      ? edit.value
      : numeric === null
        ? ""
        : format(convertSummaryRate(numeric, input.rate, output.rate));
  return (
    <div
      className="summary-rate-calculator nodrag nopan"
      aria-label="Resource rate calculator"
      title="Scales the area's net input/output ratio. Partially supplied resources use the remaining shortage."
    >
      {(
        [
          ["input", "Needed", input, summary.inputs, inputValue, setInputId],
          [
            "output",
            "Produced",
            output,
            summary.outputs,
            outputValue,
            setOutputId,
          ],
        ] as const
      ).map(([side, label, selected, items, value, select]) => (
        <div className="summary-rate-side" key={side}>
          <label className="summary-rate-field">
            <input
              type="number"
              min="0"
              step="any"
              aria-label={`${label} resource rate`}
              value={value}
              onChange={(event) =>
                onChange({ ...edit, side, value: event.target.value })
              }
            />
            <span>{selected.item.kind === "fluid" ? "mB/s" : "items/s"}</span>
          </label>
          <ResourcePicker
            label={label}
            items={items}
            selected={selected}
            onSelect={select}
          />
        </div>
      ))}
    </div>
  );
}
