"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { Plus, X, Palette, EyeOff, Ban, CircleCheck, Pencil, Trash2, SquareDashed } from "lucide-react";
import { groupTheme, groupThemes, groupThemeStyle, type GroupTheme } from "@/lib/group-theme";
import { interfaceTheme } from "@/lib/interface-theme";
import { useDisplaySettings } from "./display-settings";
import { IgnoredResourceIcon } from "./ignored-resource-icon";
import { createPortal } from "react-dom";
import type { SummaryCalculation } from "@/lib/summary-rate";
import { summaryCalculationAvailable, TOTAL_EU_INPUT_ID } from "@/lib/summary-rate";
import type { AreaSummary } from "@/lib/area-summary";
import { AddFuelCalculators } from "./add-fuel-calculators";
import { SummaryRateCalculator } from "./summary-rate-calculator";

const number = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 3 });
export function SummaryArea({
  id,
  selected,
  data,
}: NodeProps<
  Node<{
    isContainer?: boolean;
    summary?: AreaSummary;
    theme?: GroupTheme;
    updateTheme?: (theme: GroupTheme) => void;
    ignoredItems?: string[];
    setItemIgnored?: (itemId: string, ignored: boolean) => void;
    setItemDisabled?: (itemId: string, disabled: boolean) => void;
    itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
    title?: string;
    updateTitle?: (title: string) => void;
    removeArea?: (id: string) => void;
    selectRecipes?: () => void;
    selectArea?: () => void;
    calculators?: SummaryCalculation[];
    updateCalculators?: (values: SummaryCalculation[]) => void;
  }>
>) {
  const { settings } = useDisplaySettings();
  const theme = data.theme === "default" ? interfaceTheme(settings) : groupTheme(data.theme);
  const defaultSelected = data.theme === "default" || ((data.theme ?? "blue") === "blue" && settings.theme === "blue");
  const summary = data.isContainer ? undefined : data.summary;
  const ignoredIds = data.ignoredItems ?? [];
  const ignored = [...(summary?.inputs ?? []), ...(summary?.outputs ?? [])].filter(row => ignoredIds.includes(row.item.id));
  const visibleInputs = summary?.inputs.filter(row => !ignoredIds.includes(row.item.id)) ?? [];
  const visibleOutputs = summary?.outputs.filter(row => !ignoredIds.includes(row.item.id)) ?? [];
  const calculators = useMemo(() => (data.calculators ?? []).filter(calculation =>
    !summary || (
      summaryCalculationAvailable(summary, calculation)
    ),
  ), [data.calculators, summary]);
  useEffect(() => {
    if (summary && calculators.length !== (data.calculators?.length ?? 0)) {
      data.updateCalculators?.(calculators);
    }
  }, [summary, calculators, data.calculators, data.updateCalculators]);
  const [menu, setMenu] = useState<{ itemId?: string; x: number; y: number }>();
  const [themePicker, setThemePicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const rename = () => { setDraft(data.title ?? "Grouping"); setEditing(true); setMenu(undefined); };
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPortState = menu?.itemId ? data.itemPortState?.(menu.itemId) : undefined;
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as globalThis.Node)) setMenu(undefined); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(undefined); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("wheel", close, true); window.removeEventListener("keydown", key); };
  }, [menu]);
  return (
    <div className={`summary-area${selected ? " selected" : ""}`} style={groupThemeStyle(theme)} onContextMenu={event => {
      event.preventDefault(); event.stopPropagation();
      setThemePicker(false);
      setMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 250)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 290)) });
    }}>
      {menu && createPortal(<div ref={menuRef} role="menu" className="diagram-selection-menu line-context-menu nodrag nopan" style={{ position: "fixed", left: menu.x, top: menu.y }} onContextMenu={e => e.preventDefault()}>
        {menu.itemId ? ignoredIds.includes(menu.itemId) ? <button role="menuitem" onClick={() => { data.setItemIgnored?.(menu.itemId!, false); setMenu(undefined); }}><CircleCheck size={16} />Enable item</button> : <>
{(summary?.inputs.some(row => row.item.id === menu.itemId) || summary?.outputs.some(row => row.item.id === menu.itemId)) && <><button role="menuitem" onClick={() => { data.setItemIgnored?.(menu.itemId!, true); setMenu(undefined); }}><EyeOff size={16} />Ignore item</button><div role="separator" className="sidebar-calculator-menu-divider" /></>}
        <button role="menuitem" disabled={menuPortState ? !menuPortState.hasEnabled : false} title="Disable every matching input and output inside this grouping. Their connections will be removed; Undo restores them." onClick={() => { data.setItemDisabled?.(menu.itemId!, true); setMenu(undefined); }}><Ban size={16} />Disable all</button>
        <button role="menuitem" disabled={menuPortState ? !menuPortState.hasDisabled : false} onClick={() => { data.setItemDisabled?.(menu.itemId!, false); setMenu(undefined); }}><CircleCheck size={16} />Enable all</button>
        
        </> : <>
          {data.selectRecipes && <button role="menuitem" onClick={() => { data.selectRecipes?.(); setMenu(undefined); }}><SquareDashed size={16} />Select recipes in group</button>}
          <button role="menuitem" onClick={rename}><Pencil size={16} />Rename group</button>
          <button role="menuitem" onClick={() => { setMenu(undefined); data.removeArea?.(id); }}><Trash2 size={16} />Delete group</button>
          <div className="group-theme-menu-row"><Palette size={16} aria-hidden="true" /><span>Color</span><button type="button" className="group-theme-swatch" data-transparent={data.theme === "transparent" || undefined} aria-label={"Choose group theme: " + theme.name} aria-expanded={themePicker} style={{ background: theme.color }} onClick={() => setThemePicker(value => !value)}>{data.theme === "transparent" && <Ban aria-hidden="true" />}</button></div>
          {themePicker && <div className="group-theme-palette" role="group" aria-label="Group themes">
            <div className="group-theme-default-row"><button type="button" className="group-theme-default-swatch" title="Default" aria-label="Default interface theme" aria-pressed={defaultSelected} style={{ background: interfaceTheme(settings).color }} onClick={() => { data.updateTheme?.("default"); setThemePicker(false); setMenu(undefined); }} /><span>Default</span></div>
            {groupThemes.filter(theme => theme.id !== "dark-aqua" && (theme.id !== "blue" || settings.theme !== "blue")).map(theme => <button type="button" key={theme.id} data-transparent={theme.id === "transparent" || undefined} title={theme.name} aria-label={theme.name} aria-pressed={!defaultSelected && (data.theme ?? "blue") === theme.id} style={{ background: theme.color }} onClick={() => { data.updateTheme?.(theme.id); setThemePicker(false); setMenu(undefined); }}>{theme.id === "transparent" && <Ban aria-hidden="true" />}</button>)}
          </div>}
        </>}
      </div>, document.body)}
      <NodeResizer
        isVisible
        onResizeStart={() => data.selectArea?.()}
        minWidth={380}
        minHeight={260}
        color={theme.accent}
      />
      <div className="summary-area-header">
        <div className="summary-area-title">
          {editing ? <input
            className="summary-area-name nodrag nopan"
            aria-label="Grouping name"
            autoFocus
            onFocus={event => event.currentTarget.select()}
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => { const title = draft.trim(); if (title && title !== data.title) data.updateTitle?.(title); setEditing(false); }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setEditing(false);
            }}
          /> : <span className="summary-area-name">{data.title ?? "Grouping"}</span>}
          <button className="nodrag nopan" aria-label="Rename group" title="Rename group" onClick={rename}><Pencil size={18} /></button>
          <button
            className="nodrag nopan"
            aria-label="Delete grouping"
            onClick={() => data.removeArea?.(id)}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {summary && summary.recipeCount > 0 && (
        <div className="summary-area-content nopan">
          <div className="summary-layout">
            <div className="summary-overview">
              <div className="summary-totals">
                <strong>{number(summary.euPerTick)} EU/t</strong>
                <strong title="Energy for one recipe cycle per configured machine; recipes without timing are excluded">
                  {number(summary.totalEu)} EU total
                </strong>
                <div className="summary-counts">
                  <strong>{number(summary.machineCount)} machines</strong>
                  <span>{summary.recipeCount} recipes</span>
                </div>
              </div>
              <div className="summary-breakdown">
                <div className="summary-machines">
                  {summary.machines.map((machine) => (
                    <span
                      key={`${machine.name}/${machine.tier}`}
                      title={`${machine.name} · ${machine.tier}`}
                    >
                      {machine.image && <img src={machine.image} alt="" />}{" "}
                      {number(machine.count)} × {machine.name}{" "}
                      <b>{machine.tier}</b>
                    </span>
                  ))}
                </div>

              </div>
            </div>
                <div className="summary-flows">
                  {(
                    [
                      [
                        ["Needed", visibleInputs.filter(({ item }) => !summary.recursiveInputIds.includes(item.id))],
                        ["Partially supplied", visibleInputs.filter(({ item }) => summary.recursiveInputIds.includes(item.id))],
                      ],
                      [["Produced", visibleOutputs]],
                      [["Disabled", summary.disabled], ["Ignored", ignored]],
                    ] as const
                  ).map(column => column.filter(([, items]) => items.length > 0))
                    .filter(column => column.length > 0).map(column => (
                    <section
                      key={column[0][0]}
                      className="summary-flow-column"
                      aria-label={column.map(([title]) => title).join(" and ")}
                    >
                      {column.map(([title, items], index) => (
                        <Fragment key={title}>
                      <strong className={index > 0 ? "summary-recursive-heading" : undefined}>{title}</strong>
                      {items.map(({ item, rate }) => (
                            <div key={item.id}
                              title={item.name}
                              className={`summary-flow-item${title === "Ignored" ? " summary-flow-ignored" : ""}${(title === "Disabled" || title === "Ignored") ? " summary-flow-disabled" : ""}`}
                              onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ itemId: item.id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 145)) }); }}
                            >
                              {title === "Ignored" && <IgnoredResourceIcon size={24} produced={summary.outputs.some(row => row.item.id === item.id)} partial={summary.recursiveInputIds.includes(item.id)} />}
                              <b>
                                {number(rate)}{" "}
                                {item.kind === "fluid" ? "mB" : "items"}
                                /s
                              </b>
                              <span className="summary-flow-icon">
                                {item.image && <img src={item.image} alt="" />}
                              </span>
                              <span className="summary-flow-name">
                                {item.name.replace(/§[0-9a-fk-or]/gi, "")}
                              </span>
                            </div>
                      ))}
                        </Fragment>
                      ))}
                    </section>
                  ))}
                </div>
            <div className="summary-calculators nodrag nopan">
              <h3 className="summary-calculators-heading">Ratio calculators</h3>
              {calculators.map((calculation) => (
                <div className="summary-saved-calculation" key={calculation.id}>
                  <SummaryRateCalculator
                    summary={summary}
                    calculation={calculation}
                    onChange={(updated) =>
                      data.updateCalculators?.(
                        (data.calculators ?? []).map((value) =>
                          value.id === updated.id ? updated : value,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label="Delete ratio calculator"
                    onClick={() =>
                      data.updateCalculators?.(
                        (data.calculators ?? []).filter(
                          (value) => value.id !== calculation.id,
                        ),
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="summary-add-calculators">
              <button
                type="button"
                disabled={
                  !summary.outputs.length ||
                  (data.calculators?.length ?? 0) >= 100
                }
                onClick={() =>
                  data.updateCalculators?.([
                    ...(data.calculators ?? []),
                    {
                      id: crypto.randomUUID(),
                      inputId: summary.inputs[0]?.item.id ?? TOTAL_EU_INPUT_ID,
                      outputId: summary.outputs[0].item.id,
                      side: "input",
                      value: String(summary.inputs[0]?.rate ?? summary.totalEu),
                    },
                  ])
                }
              >
                <Plus size={16} /> Add ratio calculator
              </button>
              <AddFuelCalculators summary={summary} disabled={(data.calculators?.length ?? 0) >= 100}
                onAdd={value => data.updateCalculators?.([...(data.calculators ?? []), value])} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
