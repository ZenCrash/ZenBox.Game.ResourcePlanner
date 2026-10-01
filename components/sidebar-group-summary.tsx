"use client";
import { useEffect, useId, useRef, useState, useMemo, type DragEvent, type MouseEvent } from "react";
import { ChevronDown, ChevronRight, LocateFixed, Eye, EyeOff, X, MoreHorizontal, Pencil, Trash2, Check, Plus, GripVertical, Factory, ArrowDownToLine, ArrowUpFromLine, Ban, CircleCheck } from "lucide-react";
import { createPortal } from "react-dom";
import { machineConnectionTree, type MachineConnection } from "@/lib/machine-connection-tree";
import type { AreaSummary } from "@/lib/area-summary";
import { summaryCalculationAvailable, TOTAL_EU_INPUT_ID, formatTotalEu, moveSummaryCalculation, type SummaryCalculation } from "@/lib/summary-rate";
import { AddFuelCalculators } from "./add-fuel-calculators";
import { SummaryRateCalculator } from "./summary-rate-calculator";

type RecipeEntry = { id: string; name: string; image?: string | null; detail: string };
type ScaledMachineEntry = RecipeEntry & { amount: number };
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

function CalculatorRow({ summary, calculation, onChange, onDelete, onAdd, onAddFuel, canAdd, initiallyEditing, onEditEnd, dragId, dropPosition, onDragStart, onDragEnd, onDragOver, onDrop, onMove }: {
  summary: AreaSummary; calculation: SummaryCalculation;
  onChange: (value: SummaryCalculation) => void; onDelete: () => void;
  onAddFuel: (value: SummaryCalculation) => void;
  onAdd: () => void; canAdd: boolean; initiallyEditing: boolean; onEditEnd: () => void;
  dragId: string | null; dropPosition?: "before" | "after";
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState<SummaryCalculation | null>(initiallyEditing ? calculation : null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initiallyEditing) row.current?.scrollIntoView({ block: "nearest" });
  }, [initiallyEditing]);
  const menu = useRef<HTMLDivElement>(null);
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  useEffect(() => setMenuHost(document.body), []);
  return <div ref={row} className={"sidebar-group-calculator" + (dragId === calculation.id ? " is-dragging" : "")}
    data-drop-position={dropPosition} onDragOver={onDragOver} onDrop={onDrop}>
    <button className="sidebar-calculator-grip" draggable title="Drag to reorder; use Up or Down arrows when focused" aria-label="Reorder ratio calculator"
      onDragStart={event => { if (row.current) event.dataTransfer.setDragImage(row.current, 12, 12); onDragStart(event); }} onDragEnd={onDragEnd}
      onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1); } }}>
      <GripVertical size={13} />
    </button>
    <SummaryRateCalculator summary={summary} calculation={draft ?? calculation} readOnly={!draft} onChange={setDraft} />
    {draft ? <div className="sidebar-calculator-actions">
      <button title="Save calculation" aria-label="Save calculation" onClick={() => { onChange(draft); setDraft(null); onEditEnd(); }}><Check size={12} /></button>
      <button title={initiallyEditing ? "Discard new calculation" : "Cancel editing"} aria-label={initiallyEditing ? "Discard new calculation" : "Cancel editing"} onClick={() => { if (initiallyEditing) onDelete(); setDraft(null); onEditEnd(); }}><X size={12} /></button>
    </div> : <button className="sidebar-calculator-menu-button" title="Calculation options" aria-label="Calculation options" aria-haspopup="menu" onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!menu.current) return;
      menu.current.style.left = Math.max(8, Math.min(bounds.right - 140, window.innerWidth - 148)) + "px";
      menu.current.style.top = (bounds.bottom + 3) + "px";
      menu.current.style.maxHeight = Math.max(0, window.innerHeight - bounds.bottom - 11) + "px";
      menu.current.showPopover();
      const menuWidth = menu.current.getBoundingClientRect().width;
      menu.current.style.left = Math.max(8, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 8)) + "px";
    }}><MoreHorizontal size={14} /></button>}
    {menuHost && createPortal(<div ref={menu} popover="auto" role="menu" aria-label="Calculation options" className="sidebar-calculator-menu">
      <button role="menuitem" onClick={() => { menu.current?.hidePopover(); setDraft(calculation); }}><Pencil size={13} />Edit</button>
      <button role="menuitem" onClick={() => { menu.current?.hidePopover(); onDelete(); }}><Trash2 size={13} />Delete</button>
      <div role="separator" className="sidebar-calculator-menu-divider" />
      <button role="menuitem" disabled={!canAdd} onClick={() => { menu.current?.hidePopover(); onAdd(); }}><Plus size={13} />Add recipe</button>
      <AddFuelCalculators summary={summary} disabled={!canAdd} menu onAdd={value => { menu.current?.hidePopover(); onAddFuel(value); }} />
    </div>, menuHost)}
  </div>;
}

function ScaledMachineRow({ recipe, onLocate, whole, tree, row, hoveredId, onHover, showTree }: { showTree: boolean; hoveredId: string | null; onHover: (id: string | null) => void; recipe: ScaledMachineEntry; onLocate: (id: string) => void; whole: boolean; tree: ReturnType<typeof machineConnectionTree>; row: number }) {
  const amount = whole ? Math.ceil(recipe.amount) : recipe.amount;
  const outputConnection = hoveredId ? tree.lines.find(line => line.source === hoveredId && line.target === recipe.id) : undefined;
  const inputConnection = hoveredId ? tree.lines.find(line => line.target === hoveredId && line.source === recipe.id) : undefined;
  const connection = outputConnection ?? inputConnection;
  const circleFill = hoveredId === recipe.id ? "#a7c9e9" : connection ? connection.style?.stroke ?? "#60a5fa" : "#121b29";
  const circleOutline = hoveredId !== recipe.id && outputConnection ? outputConnection.style?.stroke ?? "#60a5fa" : hoveredId !== recipe.id && inputConnection ? "#808080" : "#a7c9e9";
  return <div className="sidebar-group-entry sidebar-scaled-machine-row" style={{ paddingRight: showTree ? tree.width : 6 }}
    onMouseEnter={() => onHover(recipe.id)} onMouseLeave={() => onHover(null)}>
    {showTree && <svg className="sidebar-machine-tree" width={tree.width} viewBox={"0 0 " + tree.width + " 40"} preserveAspectRatio="none" aria-label="Recipe connections">
      {tree.lines.filter(line => row >= Math.min(line.from, line.to) && row <= Math.max(line.from, line.to)).map(line => {
        const x = 20 + line.lane * 8, low = Math.min(line.from, line.to), high = Math.max(line.from, line.to);
        const path = low === high ? "M8 20 H" + x + " V8 H8 V20" : row === low ? "M8 20 H" + x + " V40" : row === high ? "M" + x + " 0 V20 H8" : "M" + x + " 0 V40";
        const highlighted = line.source === hoveredId || line.target === hoveredId;
        return <g className={highlighted ? "sidebar-machine-tree-glow" : undefined} style={{ color: line.style?.stroke ?? "#60a5fa" }} key={line.id ?? line.source + "/" + line.target} fill="none" stroke={line.style?.stroke ?? "#60a5fa"} strokeWidth="1.5" strokeDasharray={line.data?.reference ? "3 3" : undefined}>
          <path d={path} />
          {row === line.to && <path d="m12 17-4 3 4 3" />}
          <title>{line.feedback ? "Recycling connection" : line.data?.reference ? "Info connection" : "Production connection"}</title>
        </g>;
      })}
      <circle cx="8" cy="20" r="3" fill={circleFill} stroke={circleOutline} strokeWidth="1.5" />
    </svg>}
    <button className="sidebar-scaled-machine-label" onClick={() => onLocate(recipe.id)} title={recipe.detail}>
      {recipe.image && <img src={recipe.image} alt="" />}
      <span>{recipe.name.replace(/§./g, "")}<small title={recipe.amount.toLocaleString(undefined, { maximumSignificantDigits: 21 }) + " machines"}>{number(amount)} × · {recipe.detail}</small></span>
    </button>

  </div>;
}

function MachineDetails({ summary, recipes, connections = [], onLocate, onResourceContextMenu, setItemDisabled, itemPortState }: {
  connections?: MachineConnection[];
  summary: AreaSummary; recipes?: ScaledMachineEntry[]; onLocate?: (id: string) => void;
  onResourceContextMenu: (event: MouseEvent, itemId: string) => void;
  setItemDisabled?: (itemId: string, disabled: boolean) => void;
  itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
}) {
  const id = useId();
  const tree = useMemo(() => machineConnectionTree((recipes ?? []).map(recipe => recipe.id), connections), [recipes, connections]);
  const byId = new Map(recipes?.map(recipe => [recipe.id, recipe]));
  const [showTree, setShowTree] = useState(true);
  const [whole, setWhole] = useState(false);
  const [hoveredMachine, setHoveredMachine] = useState<string | null>(null);
  const [active, setActive] = useState<"amounts" | "needed" | "produced" | "disabled">("amounts");
  const tabs = [
    ["amounts", "Machine amounts", Factory],
    ["needed", "Needed", ArrowDownToLine],
    ["produced", "Produced", ArrowUpFromLine],
    ["disabled", "Disabled", Ban],
  ] as const;
  const resources = active === "needed" ? summary.inputs : active === "produced" ? summary.outputs : summary.disabled;
  return <>
    <div className="sidebar-machine-tabs" role="tablist" aria-label="Machine details">
      {tabs.map(([key, label, Icon], index) => <button key={key} role="tab" id={id + key}
        title={label} aria-label={label} aria-selected={active === key} aria-controls={id + "panel"}
        tabIndex={active === key ? 0 : -1} onClick={() => setActive(key)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setActive(tabs[next][0]); document.getElementById(id + tabs[next][0])?.focus();
        }}><Icon size={15} aria-hidden="true" /></button>)}
    </div>
    <div className="sidebar-group-totals"><span title={number(summary.totalEu) + " EU"}>Total {formatTotalEu(summary.totalEu)} EU</span><span aria-hidden="true">·</span><span>{number(summary.euPerTick)} EU/t</span>
      {recipes && active === "amounts" && <><button className="sidebar-machine-number-mode" aria-label="Machine amount number format" aria-pressed={whole}
        title={whole ? "Showing rounded-up whole numbers; click for decimal numbers" : "Showing decimal numbers; click to round up to whole numbers"}
        onClick={() => setWhole(value => !value)}>{whole ? "Whole numbers" : "Decimal numbers"}</button>
        <button className="sidebar-machine-tree-toggle" title={showTree ? "Hide connection tree" : "Show connection tree"} aria-label={showTree ? "Hide connection tree" : "Show connection tree"} aria-pressed={showTree} onClick={() => setShowTree(value => !value)}>{showTree ? <EyeOff size={13} /> : <Eye size={13} />}</button></>}
    </div>
    <div className="sidebar-machine-content" role="tabpanel" id={id + "panel"} aria-labelledby={id + active}>
      {active === "amounts" ? recipes ? tree.order.map((id, row) => <ScaledMachineRow key={id} recipe={byId.get(id)!} tree={tree} row={row} whole={whole} showTree={showTree} hoveredId={hoveredMachine} onHover={setHoveredMachine} onLocate={id => onLocate?.(id)} />) : summary.machines.map((machine, index) => <div className="sidebar-group-entry" key={machine.name + "/" + machine.tier + "/" + index}>
        {machine.image && <img src={machine.image} alt="" />}<span>{machine.name.replace(/§./g, "")}<small>{number(machine.count)} × · {machine.tier}</small></span>
      </div>) : resources.map(({ item, rate }) => {
        const state = itemPortState?.(item.id);
        const name = item.name.replace(/§./g, "");
        return <div className={"sidebar-group-entry sidebar-resource-row" + (active === "disabled" ? " sidebar-resource-disabled" : "")} key={item.id} onContextMenu={event => onResourceContextMenu(event, item.id)}
          title={name + ": " + rate.toLocaleString(undefined, { maximumSignificantDigits: 21 }) + (item.kind === "fluid" ? " mB/s" : " items/s")}>
          {item.image && <img src={item.image} alt="" className={item.kind === "fluid" ? "summary-fluid-image" : undefined} />}
          <span className="sidebar-resource-label">{name}<small>{number(rate)} {item.kind === "fluid" ? "mB/s" : "items/s"}{active === "needed" && summary.recursiveInputIds.includes(item.id) ? " · Partially supplied" : ""}</small></span>
          <div className="sidebar-resource-actions">
            <button title="Disable all" aria-label={"Disable all " + name} disabled={!setItemDisabled || (state ? !state.hasEnabled : false)}
              onClick={() => setItemDisabled?.(item.id, true)}><Ban size={14} /></button>
            <button title="Enable all" aria-label={"Enable all " + name} disabled={!setItemDisabled || (state ? !state.hasDisabled : false)}
              onClick={() => setItemDisabled?.(item.id, false)}><CircleCheck size={14} /></button>
          </div>
        </div>;
      })}
    </div>
  </>;
}

export function SidebarGroupSummary({ title, onRename, connections, summary, scaledSummary, scaledMachineRows, onRequestScaled, calculators, onCalculatorsChange, scaledRecipes, onLocate, setItemDisabled, itemPortState }: {
  connections: MachineConnection[];
  onRename: (title: string) => void;
  title: string; summary?: AreaSummary; scaledSummary?: AreaSummary; scaledMachineRows: ScaledMachineEntry[]; onRequestScaled: () => void; calculators: SummaryCalculation[]; onCalculatorsChange: (values: SummaryCalculation[]) => void; scaledRecipes: RecipeEntry[];
  onLocate: (id?: string) => void;
  setItemDisabled?: (itemId: string, disabled: boolean) => void;
  itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const cancelRename = useRef(false);
  const [resourceMenu, setResourceMenu] = useState<{ itemId: string; x: number; y: number }>();
  const resourceMenuRef = useRef<HTMLDivElement>(null);
  const portState = resourceMenu && itemPortState?.(resourceMenu.itemId);
  const openResourceMenu = (event: MouseEvent, itemId: string) => {
    if (!setItemDisabled) return;
    event.preventDefault(); event.stopPropagation();
    setResourceMenu({ itemId, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 218)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 105)) });
  };
  useEffect(() => {
    if (!resourceMenu) return;
    const close = (event: Event) => { if (!resourceMenuRef.current?.contains(event.target as Node)) setResourceMenu(undefined); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setResourceMenu(undefined); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("wheel", close, true); window.removeEventListener("keydown", key); };
  }, [resourceMenu]);
  const dragging = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" }>();
  const finishDrag = () => { dragging.current = null; setDragId(null); setDropTarget(undefined); };
  const dropPosition = (event: DragEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" as const : "after" as const;
  };
  const [newCalculatorId, setNewCalculatorId] = useState<string>();
  const addCalculator = () => {
    if (!summary?.outputs.length || calculators.length >= 100) return;
    const id = crypto.randomUUID();
    setNewCalculatorId(id);
    onCalculatorsChange([...calculators, {
      id, inputId: summary.inputs[0]?.item.id ?? TOTAL_EU_INPUT_ID,
      outputId: summary.outputs[0].item.id, side: "input",
      value: String(summary.inputs[0]?.rate ?? summary.totalEu),
    }]);
  };
  const tabId = useId();
  const [tab, setTab] = useState<"ratios" | "machines" | "scaled">("ratios");
  const availableCalculators = calculators.filter(calculation => summary &&
    summaryCalculationAvailable(summary, calculation));
  const selectionKey = availableCalculators.map(calculation => calculation.id).join("/");
  const [open, setOpen] = useState(!!selectionKey);
  useEffect(() => { if (selectionKey) setOpen(true); }, [selectionKey]);

  return <div className="sidebar-area-summary">
    {resourceMenu && createPortal(<div ref={resourceMenuRef} role="menu" className="diagram-selection-menu line-context-menu nodrag nopan"
      style={{ position: "fixed", left: resourceMenu.x, top: resourceMenu.y }} onContextMenu={event => event.preventDefault()}>
      <button role="menuitem" disabled={portState ? !portState.hasEnabled : false}
        title="Disable every matching input and output inside this grouping. Their connections will be removed; Undo restores them."
        onClick={() => { setItemDisabled?.(resourceMenu.itemId, true); setResourceMenu(undefined); }}><Ban size={16} />Disable all</button>
      <button role="menuitem" disabled={portState ? !portState.hasDisabled : false}
        onClick={() => { setItemDisabled?.(resourceMenu.itemId, false); setResourceMenu(undefined); }}><CircleCheck size={16} />Enable all</button>
    </div>, document.body)}

    <div className="sidebar-group-heading">
      {editingName ? <input className="sidebar-group-name-input" aria-label="Group name" value={nameDraft} maxLength={120} autoFocus
        onFocus={event => event.currentTarget.select()} onChange={event => setNameDraft(event.target.value)}
        onBlur={() => { if (!cancelRename.current && nameDraft.trim() && nameDraft.trim() !== title) onRename(nameDraft.trim()); setEditingName(false); }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelRename.current = true; event.currentTarget.blur(); } }} /> : <button className="sidebar-group-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{title}</strong>
      </button>}
      <button className="sidebar-group-locate" title="Rename group" aria-label={`Rename ${title}`} onClick={() => { cancelRename.current = false; setNameDraft(title); setEditingName(true); }}><Pencil size={13} /></button>
      <button className="sidebar-group-locate" title="Show group in diagram" aria-label={`Show ${title} in diagram`} onClick={() => onLocate()}><LocateFixed size={13} /></button>
    </div>
    {open && <div className="sidebar-group-content">
      <div className="sidebar-group-tabs-row">
        <div className="sidebar-group-tabs" role="tablist" aria-label="Group details">
          {([
            ["ratios", "Ratio calculators", availableCalculators.length],
            ["machines", "Machines", summary ? new Set(summary.machines.map(machine => JSON.stringify([machine.name.replace(/§./g, ""), machine.tier]))).size : 0],
            ["scaled", "Scaled", scaledSummary?.recipeCount ?? scaledRecipes.length],
          ] as const).map(([key, label, count], index, tabs) => <button key={key}
            id={tabId + "-" + key} role="tab" aria-selected={tab === key} aria-controls={tabId + "-panel-" + key}
            tabIndex={tab === key ? 0 : -1} onClick={() => { setTab(key); if (key === "scaled") onRequestScaled(); }}
            onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault(); setTab(tabs[next][0]); if (tabs[next][0] === "scaled") onRequestScaled();
              document.getElementById(tabId + "-" + tabs[next][0])?.focus();
            }}>{label} ({count})</button>)}
        </div>

      </div>
      <div className="sidebar-group-section-content" role="tabpanel" id={tabId + "-panel-ratios"} aria-labelledby={tabId + "-ratios"} hidden={tab !== "ratios"}>
        {summary && availableCalculators.map(calculation => <CalculatorRow key={calculation.id} summary={summary}
          dragId={dragId} dropPosition={dropTarget?.id === calculation.id ? dropTarget.position : undefined}
          onDragStart={event => { dragging.current = calculation.id; setDragId(calculation.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-group-ratio-calculator", calculation.id); }}
          onDragEnd={finishDrag}
          onDragOver={event => {
            if (!dragging.current) return;
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
            if (dragging.current === calculation.id) { setDropTarget(undefined); return; }
            const position = dropPosition(event);
            setDropTarget(old => old?.id === calculation.id && old.position === position ? old : { id: calculation.id, position });
          }}
          onDrop={event => {
            if (!dragging.current) return;
            event.preventDefault(); event.stopPropagation();
            const next = moveSummaryCalculation(calculators, dragging.current, calculation.id, dropPosition(event));
            if (next !== calculators) onCalculatorsChange(next);
            finishDrag();
          }}
          onMove={direction => {
            const index = availableCalculators.findIndex(value => value.id === calculation.id);
            const target = availableCalculators[index + direction];
            if (target) onCalculatorsChange(moveSummaryCalculation(calculators, calculation.id, target.id, direction < 0 ? "before" : "after"));
          }}
          calculation={calculation} initiallyEditing={newCalculatorId === calculation.id}
          onAddFuel={value => { if (calculators.length >= 100) return; setNewCalculatorId(value.id); onCalculatorsChange([...calculators, value]); }}
          onEditEnd={() => setNewCalculatorId(undefined)} onAdd={addCalculator} canAdd={calculators.length < 100}
          onChange={updated => onCalculatorsChange(calculators.map(value => value.id === updated.id ? updated : value))}
          onDelete={() => onCalculatorsChange(calculators.filter(value => value.id !== calculation.id))} />)}
      </div>
      <div className="sidebar-group-section-content" role="tabpanel" id={tabId + "-panel-machines"} aria-labelledby={tabId + "-machines"} hidden={tab !== "machines"}>
        {summary && summary.machines.length > 0 && <MachineDetails summary={summary} onResourceContextMenu={openResourceMenu} setItemDisabled={setItemDisabled} itemPortState={itemPortState} />}
      </div>
      <div className="sidebar-group-section-content" role="tabpanel" id={tabId + "-panel-scaled"} aria-labelledby={tabId + "-scaled"} hidden={tab !== "scaled"}>
        {scaledSummary && scaledSummary.machines.length > 0 && <MachineDetails summary={scaledSummary} recipes={scaledMachineRows} connections={connections} onLocate={onLocate} onResourceContextMenu={openResourceMenu} setItemDisabled={setItemDisabled} itemPortState={itemPortState} />}
      </div>
    </div>}
  </div>;
}
