"use client";
import { useId, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronDown, GripVertical } from "lucide-react";
import { plannerPriorityLabels, type PlannerPriority } from "@/lib/planner-priorities";

export function PlannerPriorityList({ values, hasInputs, onChange }: {
  values: PlannerPriority[];
  hasInputs: boolean;
  onChange: (values: PlannerPriority[]) => void;
}) {
  const [dragged, setDragged] = useState<PlannerPriority>();
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const move = (value: PlannerPriority, to: number) => {
    const next = values.filter(entry => entry !== value);
    next.splice(to, 0, value);
    onChange(next);
  };
  return <div className="planner-filter planner-priority-row">
    <span id={`${id}-label`}>Priority order</span>
    <button type="button" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={event => {
        const menu = popup.current;
        if (!menu) return;
        if (menu.matches(":popover-open")) { menu.hidePopover(); return; }
        const bounds = event.currentTarget.getBoundingClientRect();
        const width = Math.min(bounds.width, window.innerWidth - 16);
        menu.style.width = `${width}px`;
        menu.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`;
        menu.style.top = `${bounds.bottom + 4}px`;
        menu.showPopover();
        const height = menu.getBoundingClientRect().height;
        menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - height - 8))}px`;
        menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      }}>
      <span id={`${id}-value`}>{plannerPriorityLabels[values[0]]}</span><ChevronDown size={16} />
    </button>
    <div ref={popup} id={id} popover="auto" role="dialog" aria-label="Reorder priorities, highest first"
      className="machine-selector-menu planner-filter-menu planner-priority-menu nowheel"
      onToggle={event => setOpen(event.currentTarget.matches(":popover-open"))}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); popup.current?.hidePopover(); } }}>
    <ol className="planner-priority-list" aria-label="Priority order, highest first">
      {values.map((value, index) => <li key={value} draggable
        className={value === "yield" && !hasInputs ? "inactive-priority" : undefined}
        title={value === "yield" && !hasInputs ? "Used when input items are selected" : undefined}
        onDragStart={event => { setDragged(value); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", value); }}
        onDragEnd={() => setDragged(undefined)}
        onDragOver={event => { if (dragged) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
        onDrop={event => { event.preventDefault(); if (dragged) move(dragged, index); setDragged(undefined); }}>
        <GripVertical size={14} aria-hidden="true" />
        <span className="planner-priority-number">{index + 1}.</span>
        <span>{plannerPriorityLabels[value]}</span>
        <div className="planner-priority-move">
          <button type="button" disabled={index === 0} aria-label={`Move ${plannerPriorityLabels[value]} up`} onClick={() => move(value, index - 1)}><ArrowUp size={12} /></button>
          <button type="button" disabled={index === values.length - 1} aria-label={`Move ${plannerPriorityLabels[value]} down`} onClick={() => move(value, index + 1)}><ArrowDown size={12} /></button>
        </div>
      </li>)}
    </ol>
    </div>
  </div>;
}
