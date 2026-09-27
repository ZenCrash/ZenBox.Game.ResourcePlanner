"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { Plus, X, Ban, CircleCheck } from "lucide-react";
import { createPortal } from "react-dom";
import type { SummaryCalculation } from "@/lib/summary-rate";
import { TOTAL_EU_INPUT_ID } from "@/lib/summary-rate";
import type { AreaSummary } from "@/lib/area-summary";
import { SummaryRateCalculator } from "./summary-rate-calculator";

const number = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 3 });
export function SummaryArea({
  id,
  selected,
  data,
}: NodeProps<
  Node<{
    summary?: AreaSummary;
    setItemDisabled?: (itemId: string, disabled: boolean) => void;
    itemPortState?: (itemId: string) => { hasEnabled: boolean; hasDisabled: boolean };
    title?: string;
    updateTitle?: (title: string) => void;
    removeArea?: (id: string) => void;
    calculators?: SummaryCalculation[];
    updateCalculators?: (values: SummaryCalculation[]) => void;
  }>
>) {
  const summary = data.summary;
  const [menu, setMenu] = useState<{ itemId: string; x: number; y: number }>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPortState = menu ? data.itemPortState?.(menu.itemId) : undefined;
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
    <div className={`summary-area${selected ? " selected" : ""}`}>
      {menu && createPortal(<div ref={menuRef} role="menu" className="diagram-selection-menu line-context-menu nodrag nopan" style={{ position: "fixed", left: menu.x, top: menu.y }} onContextMenu={e => e.preventDefault()}>
        <button role="menuitem" disabled={menuPortState ? !menuPortState.hasEnabled : false} title="Disable every matching input and output inside this grouping. Their connections will be removed; Undo restores them." onClick={() => { data.setItemDisabled?.(menu.itemId, true); setMenu(undefined); }}><Ban size={16} />Disable all</button>
        <button role="menuitem" disabled={menuPortState ? !menuPortState.hasDisabled : false} onClick={() => { data.setItemDisabled?.(menu.itemId, false); setMenu(undefined); }}><CircleCheck size={16} />Enable all</button>
      </div>, document.body)}
      <NodeResizer
        isVisible={selected}
        minWidth={380}
        minHeight={260}
        color="#73baff"
      />
      <div className="summary-area-header">
        <div className="summary-area-title">
          <input
            className="summary-area-name nodrag nopan"
            aria-label="Grouping name"
            title="Click to edit grouping name"
            value={data.title ?? "Grouping"}
            maxLength={120}
            onChange={(event) => data.updateTitle?.(event.target.value)}
            onBlur={(event) => data.updateTitle?.(event.target.value.trim() || "Grouping")}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
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
        <div className="summary-area-content nodrag nopan">
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
                <div className="summary-flows">
                  {(
                    [
                      ["Needed", summary.inputs],
                      ["Produced", summary.outputs],
                      ["Disabled", summary.disabled],
                    ] as const
                  ).map(([title, items]) => (
                    <section
                      key={title}
                      className="summary-flow-column"
                      aria-label={title}
                    >
                      <strong>{title}</strong>
                      {items.length ? (
                        items.map(({ item, rate }, index) => (
                          <Fragment key={item.id}>
                            {title === "Needed" &&
                              summary.recursiveInputIds.includes(item.id) &&
                              (index === 0 ||
                                !summary.recursiveInputIds.includes(
                                  items[index - 1].item.id,
                                )) && (
                                <strong className="summary-recursive-heading">
                                  Partially supplied
                                </strong>
                              )}
                            <div
                              title={item.name}
                              className={`summary-flow-item${title === "Disabled" ? " summary-flow-disabled" : ""}`}
                              onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ itemId: item.id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 105)) }); }}
                            >
                              <b>
                                {number(rate)}{" "}
                                {item.kind === "fluid" ? "mB" : "items"}
                                /s
                              </b>
                              <span className="summary-flow-icon">
                                {item.image && <img src={item.image} alt="" />}
                              </span>
                              <span>
                                {item.name.replace(/§[0-9a-fk-or]/gi, "")}
                              </span>
                            </div>
                          </Fragment>
                        ))
                      ) : (
                        <small>None</small>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <div className="summary-calculators">
              <h3 className="summary-calculators-heading">Ratio calculators</h3>
              {(data.calculators ?? []).map((calculation) => (
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
            </div>
          </div>
          <small className="summary-note">
            Fully enclosed recipes · Base rates and minimum voltage tiers
            {summary.untimed
              ? ` · ${summary.untimed} untimed recipes excluded from item rates`
              : ""}
          </small>
        </div>
      )}
    </div>
  );
}
