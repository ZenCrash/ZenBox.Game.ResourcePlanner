"use client";
import { Fragment } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { Plus, X } from "lucide-react";
import type { SummaryCalculation } from "@/lib/summary-rate";
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
    removeArea?: (id: string) => void;
    calculators?: SummaryCalculation[];
    updateCalculators?: (values: SummaryCalculation[]) => void;
  }>
>) {
  const summary = data.summary;
  return (
    <div className={`summary-area${selected ? " selected" : ""}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={380}
        minHeight={260}
        color="#73baff"
      />
      <div className="summary-area-header">
        <div className="summary-area-title">
          <strong>Area summary</strong>
          <button
            className="nodrag nopan"
            aria-label="Delete summary area"
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
                              className="summary-flow-item"
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
                  !summary.inputs.length ||
                  !summary.outputs.length ||
                  (data.calculators?.length ?? 0) >= 100
                }
                onClick={() =>
                  data.updateCalculators?.([
                    ...(data.calculators ?? []),
                    {
                      id: crypto.randomUUID(),
                      inputId: summary.inputs[0].item.id,
                      outputId: summary.outputs[0].item.id,
                      side: "input",
                      value: String(summary.inputs[0].rate),
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
