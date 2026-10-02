"use client";
import { Fragment, useEffect, useId, useRef, useState, useMemo, type DragEvent, type MouseEvent } from "react";
import { Folder, FolderOpen, ChevronDown, ChevronRight, LocateFixed, Eye, EyeOff, X, MoreHorizontal, Pencil, Trash2, Check, Plus, GripVertical, Factory, ArrowDownToLine, ArrowUpFromLine, Ban, CircleCheck } from "lucide-react";
import { interfaceTheme } from "@/lib/interface-theme";
import { useDisplaySettings } from "./display-settings";
import { groupThemeStyle, type GroupTheme } from "@/lib/group-theme";
import { IgnoredResourceIcon } from "./ignored-resource-icon";
import { createPortal } from "react-dom";
import { machineConnectionTree, type MachineConnection } from "@/lib/machine-connection-tree";
import type { AreaSummary } from "@/lib/area-summary";
import { connectionColors } from "@/lib/model";
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

function prioritizedConnectionColor(strokes: (string | undefined)[]) {
  return [connectionColors.shortage, connectionColors.balanced, connectionColors.surplus].find(color => strokes.includes(color)) ?? strokes.find(Boolean) ?? "#808080";
}

function ScaledMachineRow({ recipe, onLocate, whole, tree, row, hoveredId, onHover, showTree }: { showTree: boolean; hoveredId: string | null; onHover: (id: string | null) => void; recipe: ScaledMachineEntry; onLocate: (id: string) => void; whole: boolean; tree: ReturnType<typeof machineConnectionTree>; row: number }) {
  const amount = whole ? Math.ceil(recipe.amount) : recipe.amount;
  const connectionStrokes = tree.lines.filter(line => line.source === recipe.id || line.target === recipe.id).map(line => line.style?.stroke);
  const circleColor = prioritizedConnectionColor(connectionStrokes);
  const outputConnection = hoveredId ? tree.lines.find(line => line.source === hoveredId && line.target === recipe.id) : undefined;
  const inputConnection = hoveredId ? tree.lines.find(line => line.target === hoveredId && line.source === recipe.id) : undefined;
  const inputColor = prioritizedConnectionColor(tree.lines.filter(line => line.target === hoveredId && line.source === recipe.id).map(line => line.style?.stroke));
  const outputColor = prioritizedConnectionColor(tree.lines.filter(line => line.source === hoveredId && line.target === recipe.id).map(line => line.style?.stroke));
  const showConnectionChevrons = hoveredId !== recipe.id && !!(inputConnection || outputConnection);
  const rowLines = tree.lines.filter(line => row >= Math.min(line.from, line.to) && row <= Math.max(line.from, line.to));
  const segments = [
    { path: "M20 0 V20", lines: rowLines.filter(line => row > Math.min(line.from, line.to)) },
    { path: "M20 20 V40", lines: rowLines.filter(line => row < Math.max(line.from, line.to)) },
    { path: "M8 20 H20", lines: rowLines.filter(line => line.from === row || line.to === row) },
    { path: "M20 20 V8 H8 V20", lines: rowLines.filter(line => line.from === row && line.to === row) },
  ];
  return <div className="sidebar-group-entry sidebar-scaled-machine-row" style={{ paddingLeft: showTree ? 35 : 3, paddingRight: 6 }}
    onMouseEnter={() => onHover(recipe.id)} onMouseLeave={() => onHover(null)}>
    {showTree && <svg className="sidebar-machine-tree" width={32} viewBox="0 0 32 40" preserveAspectRatio="none" aria-label="Recipe connections">
      {segments.filter(segment => segment.lines.length > 0).map(segment => {
        const highlighted = segment.lines.filter(line => line.source === hoveredId || line.target === hoveredId);
        const visible = highlighted.length ? highlighted : segment.lines;
        const color = highlighted.length ? prioritizedConnectionColor(visible.map(line => line.style?.stroke)) : "#808080";
        // Draw each shared section once, so a solid underlay cannot fill its dash gaps.
        return <path key={segment.path} d={segment.path} className={highlighted.length ? "sidebar-machine-tree-glow" : undefined}
          style={{ color }} fill="none" stroke={color} strokeWidth="1.5"
          strokeDasharray={visible.every(line => line.data?.reference) ? "3 3" : undefined} />;
      })}
      {showConnectionChevrons ? <g className="sidebar-machine-tree-chevron" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {inputConnection && <path d={outputConnection ? "M10 16 L14 20 L10 24" : "M4 16 L8 20 L4 24"} stroke={inputColor} />}
        {outputConnection && <path d={inputConnection ? "M6 16 L2 20 L6 24" : "M12 16 L8 20 L12 24"} stroke={outputColor} />}
      </g> : <circle cx="8" cy="20" r={3} fill={hoveredId === recipe.id ? circleColor : "#121b29"} stroke={hoveredId === recipe.id ? circleColor : "#808080"} strokeWidth="1.5" />}
    </svg>}
    <button className="sidebar-scaled-machine-label" onClick={() => onLocate(recipe.id)}>
      {recipe.image && <img src={recipe.image} alt="" />}
      <span>{recipe.name.replace(/§./g, "")}<small>{number(amount)} × · {recipe.detail}</small></span>
    </button>

  </div>;
}

function MachineDetails({ summary, recipes, allowTypeToggle = false, connections = [], onLocate, onResourceContextMenu, setItemDisabled, itemPortState, ignoredItems = [], setItemIgnored }: {
  connections?: MachineConnection[];
  allowTypeToggle?: boolean;
  summary: AreaSummary; recipes?: ScaledMachineEntry[]; onLocate?: (id: string) => void;
  onResourceContextMenu: (event: MouseEvent, itemId: string) => void;
  ignoredItems?: string[];
  setItemIgnored?: (itemId: string, ignored: boolean) => void;
  setItemDisabled?: (itemId: string, disabled: boolean) => void;
  itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
}) {
  const id = useId();
  const [perRecipe, setPerRecipe] = useState(!allowTypeToggle);
  const tree = useMemo(() => machineConnectionTree((recipes ?? []).map(recipe => recipe.id), connections), [recipes, connections]);
  const byId = new Map(recipes?.map(recipe => [recipe.id, recipe]));
  const { settings } = useDisplaySettings();
  const [treeVisible, setShowTree] = useState(true);
  const showTree = settings.connectionTree && treeVisible;
  const [whole, setWhole] = useState(false);
  const [hoveredMachine, setHoveredMachine] = useState<string | null>(null);
  const [active, setActive] = useState<"amounts" | "needed" | "produced" | "disabled">("amounts");
  const tabs = [
    ["amounts", "Machine amounts", Factory],
    ["needed", "Needed", ArrowDownToLine],
    ["produced", "Produced", ArrowUpFromLine],
    ["disabled", "Disabled", Ban],
  ] as const;
  const ignored = [...summary.inputs, ...summary.outputs].filter(row => ignoredItems.includes(row.item.id));
  const resources = active === "needed" ? summary.inputs.filter(row => !ignoredItems.includes(row.item.id)) : active === "produced" ? summary.outputs.filter(row => !ignoredItems.includes(row.item.id)) : [...summary.disabled, ...ignored];
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
    <div className="sidebar-group-totals" title={`Total: ${number(summary.totalEu)} EU
Usage: ${number(summary.euPerTick)} EU/t`}><span>Total {formatTotalEu(summary.totalEu)} EU</span><span aria-hidden="true">·</span><span>{formatTotalEu(summary.euPerTick)} EU/t</span>
      {recipes && active === "amounts" && <>{settings.connectionTree && perRecipe && <button className="sidebar-machine-tree-toggle" title={showTree ? "Hide connection tree" : "Show connection tree"} aria-label={showTree ? "Hide connection tree" : "Show connection tree"} aria-pressed={showTree} onClick={() => setShowTree(value => !value)}>{showTree ? <Eye size={13} /> : <EyeOff size={13} />}</button>}
        {allowTypeToggle ? <button className="sidebar-machine-number-mode" aria-label="Show machines per recipe" aria-pressed={perRecipe}
        title={perRecipe ? "Showing individual recipes; click for totals by machine type" : "Showing totals by machine type; click for individual recipes"}
        onClick={() => setPerRecipe(value => !value)}>{perRecipe ? "Per recipe" : "By type"}</button> : <button className="sidebar-machine-number-mode" aria-label="Machine amount number format" aria-pressed={whole}
        title={whole ? "Showing rounded-up whole numbers; click for decimal numbers" : "Showing decimal numbers; click to round up to whole numbers"}
        onClick={() => setWhole(value => !value)}>{whole ? "Whole numbers" : "Decimal numbers"}</button>}
        </>}
    </div>
    <div className={`sidebar-machine-content${active === "amounts" ? " sidebar-machine-amounts" : ""}`} role="tabpanel" id={id + "panel"} aria-labelledby={id + active}>
      {active === "amounts" ? recipes && perRecipe ? tree.order.map((id, row) => <ScaledMachineRow key={id} recipe={byId.get(id)!} tree={tree} row={row} whole={whole} showTree={showTree} hoveredId={hoveredMachine} onHover={setHoveredMachine} onLocate={id => onLocate?.(id)} />) : summary.machines.map((machine, index) => <div className="sidebar-group-entry" key={machine.name + "/" + machine.tier + "/" + index}>
        {machine.image && <img src={machine.image} alt="" />}<span>{machine.name.replace(/§./g, "")}<small>{number(machine.count)} × · {machine.tier}</small></span>
      </div>) : resources.map(({ item, rate }, index) => {
        const isIgnored = active === "disabled" && index >= summary.disabled.length;
        const state = itemPortState?.(item.id);
        const name = item.name.replace(/§./g, "");
        const category = summary.recursiveInputIds.includes(item.id) ? "Partially supplied" : summary.outputs.some(row => row.item.id === item.id) ? "Produced" : summary.inputs.some(row => row.item.id === item.id) ? "Needed" : "Disabled";
        const partialHeader = active === "needed" && summary.recursiveInputIds.includes(item.id) &&
          (index === 0 || !summary.recursiveInputIds.includes(resources[index - 1].item.id));
        return <Fragment key={`${isIgnored ? "ignored" : "resource"}:${item.id}`}>
          {active === "disabled" && index === summary.disabled.length && <h4 className="sidebar-resource-subheader">Ignored</h4>}
          {partialHeader && <h4 className="sidebar-resource-subheader">Partially supplied</h4>}
          <div className={"sidebar-group-entry sidebar-resource-row" + (active === "disabled" ? " sidebar-resource-disabled" : "")} key={item.id} onContextMenu={event => onResourceContextMenu(event, item.id)}
          title={(active === "disabled" ? `${category}\n` : name + ": ") + rate.toLocaleString(undefined, { maximumSignificantDigits: 21 }) + (item.kind === "fluid" ? " mB/s" : " items/s")}>
          {isIgnored && <IgnoredResourceIcon showTitle={false} produced={summary.outputs.some(row => row.item.id === item.id)} partial={summary.recursiveInputIds.includes(item.id)} />}
          {item.image && <img src={item.image} alt="" className={item.kind === "fluid" ? "summary-fluid-image" : undefined} />}
          <span className="sidebar-resource-label">{name}<small>{number(rate)} {item.kind === "fluid" ? "mB/s" : "items/s"}</small></span>
          <div className="sidebar-resource-actions">
            {isIgnored ? <button title="Enable item" aria-label={"Enable " + name} onClick={() => setItemIgnored?.(item.id, false)}><CircleCheck size={14} /></button> : <>
            <button title="Disable all" aria-label={"Disable all " + name} disabled={!setItemDisabled || (state ? !state.hasEnabled : false)}
              onClick={() => setItemDisabled?.(item.id, true)}><Ban size={14} /></button>
            <button title="Enable all" aria-label={"Enable all " + name} disabled={!setItemDisabled || (state ? !state.hasDisabled : false)}
              onClick={() => setItemDisabled?.(item.id, false)}><CircleCheck size={14} /></button></>}
          </div>
        </div></Fragment>;
      })}
    </div>
  </>;
}

let draggingGroup: { id: string; parentId?: string } | undefined;

export function SidebarGroupSummary({ groupId, parentId, onReorder, depth = 0, nestedGroups, theme, title, onRename, connections, summary, scaledSummary, machineRows, scaledMachineRows, onRequestScaled, calculators, onCalculatorsChange, scaledRecipes, onLocate, setItemDisabled, itemPortState, ignoredItems = [], setItemIgnored }: {
  groupId: string;
  parentId?: string;
  onReorder: (source: string, after: boolean) => void;
  depth?: number;
  nestedGroups?: import("react").ReactNode;
  theme?: GroupTheme;
  connections: MachineConnection[];
  onRename: (title: string) => void;
  title: string; summary?: AreaSummary; scaledSummary?: AreaSummary; machineRows: ScaledMachineEntry[]; scaledMachineRows: ScaledMachineEntry[]; onRequestScaled: () => void; calculators: SummaryCalculation[]; onCalculatorsChange: (values: SummaryCalculation[]) => void; scaledRecipes: RecipeEntry[];
  ignoredItems?: string[];
  setItemIgnored?: (itemId: string, ignored: boolean) => void;
  onLocate: (id?: string) => void;
  setItemDisabled?: (itemId: string, disabled: boolean) => void;
  itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
}) {
  const { settings } = useDisplaySettings();
  const [groupDrop, setGroupDrop] = useState<"before" | "after">();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const cancelRename = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editingName) return;
    const blurOutside = (event: PointerEvent) => {
      const input = nameInput.current;
      if (input && !input.contains(event.target as Node)) input.blur();
    };
    // The diagram prevents default pointer behavior, so blur before it handles the click.
    document.addEventListener("pointerdown", blurOutside, true);
    return () => document.removeEventListener("pointerdown", blurOutside, true);
  }, [editingName]);
  const [resourceMenu, setResourceMenu] = useState<{ itemId: string; x: number; y: number }>();
  const resourceMenuRef = useRef<HTMLDivElement>(null);
  const portState = resourceMenu && itemPortState?.(resourceMenu.itemId);
  const openResourceMenu = (event: MouseEvent, itemId: string) => {
    if (!setItemDisabled) return;
    event.preventDefault(); event.stopPropagation();
    setResourceMenu({ itemId, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 218)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 145)) });
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
  const isParent = !!nestedGroups;
  const [open, setOpen] = useState(!!selectionKey || isParent);
  useEffect(() => { if (isParent) setOpen(true); }, [isParent]);
  useEffect(() => { if (selectionKey) setOpen(true); }, [selectionKey]);

  return <div className="sidebar-area-summary" style={{ ...groupThemeStyle(settings.sidebarGroupThemes && theme !== "transparent" && theme !== "default" ? theme : interfaceTheme(settings)), "--group-indent": `${depth * 12}px` } as import("react").CSSProperties}>
    {resourceMenu && createPortal(<div ref={resourceMenuRef} role="menu" className="diagram-selection-menu line-context-menu nodrag nopan"
      style={{ position: "fixed", left: resourceMenu.x, top: resourceMenu.y }} onContextMenu={event => event.preventDefault()}>
      {ignoredItems.includes(resourceMenu.itemId) ? <button role="menuitem" onClick={() => { setItemIgnored?.(resourceMenu.itemId, false); setResourceMenu(undefined); }}><CircleCheck size={16} />Enable item</button> : <>
{(summary?.inputs.some(row => row.item.id === resourceMenu.itemId) || summary?.outputs.some(row => row.item.id === resourceMenu.itemId) || scaledSummary?.inputs.some(row => row.item.id === resourceMenu.itemId) || scaledSummary?.outputs.some(row => row.item.id === resourceMenu.itemId)) && <><button role="menuitem" onClick={() => { setItemIgnored?.(resourceMenu.itemId, true); setResourceMenu(undefined); }}><EyeOff size={16} />Ignore item</button><div role="separator" className="sidebar-calculator-menu-divider" /></>}
      <button role="menuitem" disabled={portState ? !portState.hasEnabled : false}
        title="Disable every matching input and output inside this grouping. Their connections will be removed; Undo restores them."
        onClick={() => { setItemDisabled?.(resourceMenu.itemId, true); setResourceMenu(undefined); }}><Ban size={16} />Disable all</button>
      <button role="menuitem" disabled={portState ? !portState.hasDisabled : false}
        onClick={() => { setItemDisabled?.(resourceMenu.itemId, false); setResourceMenu(undefined); }}><CircleCheck size={16} />Enable all</button>
      </>}
    </div>, document.body)}

    <div className={"sidebar-group-heading" + (groupDrop ? " group-drop-" + groupDrop : "")}
      onDragOver={event => {
        if (!draggingGroup || draggingGroup.id === groupId || draggingGroup.parentId !== parentId) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
        const rect=event.currentTarget.getBoundingClientRect();
        setGroupDrop(event.clientY >= rect.top + rect.height / 2 ? "after" : "before");
      }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setGroupDrop(undefined); }}
      onDrop={event => {
        event.preventDefault(); event.stopPropagation(); setGroupDrop(undefined);
        if (!draggingGroup || draggingGroup.id === groupId || draggingGroup.parentId !== parentId) return;
        const rect=event.currentTarget.getBoundingClientRect();
        onReorder(draggingGroup.id,event.clientY >= rect.top + rect.height / 2); draggingGroup=undefined;
      }}>
      <button type="button" className="sidebar-group-grip" draggable title="Drag to reorder within this group" aria-label={"Reorder " + title}
        onClick={event => event.stopPropagation()}
        onDragStart={event => { event.stopPropagation(); draggingGroup={id:groupId,parentId}; event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("application/x-group-order",groupId); }}
        onDragEnd={() => { draggingGroup=undefined; setGroupDrop(undefined); }}><GripVertical size={14} /></button>
      {editingName ? <input ref={nameInput} className="sidebar-group-name-input" aria-label="Group name" value={nameDraft} maxLength={120} autoFocus
        onFocus={event => event.currentTarget.select()} onChange={event => setNameDraft(event.target.value)}
        onBlur={() => { if (!cancelRename.current && nameDraft.trim() && nameDraft.trim() !== title) onRename(nameDraft.trim()); setEditingName(false); }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelRename.current = true; event.currentTarget.blur(); } }} /> : <button className="sidebar-group-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{nestedGroups && (open ? <FolderOpen size={14} /> : <Folder size={14} />)}<strong>{title}</strong>
      </button>}
      <button className="sidebar-group-locate" title="Rename group" aria-label={`Rename ${title}`} onClick={() => { cancelRename.current = false; setNameDraft(title); setEditingName(true); }}><Pencil size={13} /></button>
      <button className="sidebar-group-locate" title="Show group in diagram" aria-label={`Show ${title} in diagram`} onClick={() => onLocate()}><LocateFixed size={13} /></button>
    </div>
    {open && (nestedGroups ? <div className="sidebar-nested-groups">{nestedGroups}</div> : <div className="sidebar-group-content">
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
            }}>{label}{key === "ratios" ? ` (${count})` : ""}</button>)}
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
        {summary && summary.machines.length > 0 && <MachineDetails summary={summary} recipes={machineRows} allowTypeToggle connections={connections} onLocate={onLocate} onResourceContextMenu={openResourceMenu} ignoredItems={ignoredItems} setItemIgnored={setItemIgnored} setItemDisabled={setItemDisabled} itemPortState={itemPortState} />}
      </div>
      <div className="sidebar-group-section-content" role="tabpanel" id={tabId + "-panel-scaled"} aria-labelledby={tabId + "-scaled"} hidden={tab !== "scaled"}>
        {scaledSummary && scaledSummary.machines.length > 0 && <MachineDetails summary={scaledSummary} recipes={scaledMachineRows} connections={connections} onLocate={onLocate} onResourceContextMenu={openResourceMenu} ignoredItems={ignoredItems} setItemIgnored={setItemIgnored} setItemDisabled={setItemDisabled} itemPortState={itemPortState} />}
      </div>
    </div>)}
  </div>;
}
