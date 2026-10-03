"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlowProvider,
  useStore,
  type Node,
  type Edge,
} from "@xyflow/react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  WandSparkles,
  X,
  Ban,
} from "lucide-react";
import type {
  PlannerOptions,
  PlannerPlan,
  PlannerResult,
} from "@/lib/auto-planner";
import {
  type Item,
  type Recipe,
  type VariantSelection,
} from "@/lib/model";
import { machineTiers } from "@/lib/machine-selection";
import { Inventory } from "./inventory";
import { ItemSlot } from "./recipe-view";
import { PlannerFilterDropdown } from "./planner-filter-dropdown";
import { PlannerPriorityList } from "./planner-priority-list";
import { defaultPlannerPriorities } from "@/lib/planner-priorities";
import { plannerBalance } from "@/lib/planner-balance";
import { plannerDefaultCalculators } from '@/lib/planner-calculators';
import { summarizePlanner } from '@/lib/planner-summary';
import { PlannerCalculatorResults } from './planner-calculator-results';
import { PlannerPreview } from "./planner-preview";
import { plannerPositions } from "@/lib/planner-columns";
import { readPlannerFilters, plannerFiltersKey } from "@/lib/planner-filters";

export type PlannedNode = Node<
  {
    recipe: Recipe;
    machineId?: string;
    multiblock?: import("@/lib/multiblock").MultiblockConfig;
    machines: number;
    variants: VariantSelection;
    disabledPorts?: string[];
  },
  "recipe"
>;
export type PlannedGraph = { nodes: PlannedNode[]; edges: Edge[]; ignoredItems?: string[]; group?: { title: string; headerHeight?: number; theme?: import('@/lib/group-theme').GroupTheme; calculators?: import('@/lib/summary-rate').SummaryCalculation[]; targetItem?: Item; fuelDefaultsPending?: boolean } };
const emptyPreviewGraph: PlannedGraph = { nodes: [], edges: [] };

export function plannerGraph(plan: PlannerPlan): PlannedGraph {
  const balance = plannerBalance(plan);
  const positions = plannerPositions(plan.steps.length, plan.links,
    new Set(plan.steps.flatMap((step, index) => step.recovery ? [index] : [])));
  const rowHeight = Math.max(
    500,
    ...plan.steps.map(
      (step) =>
        Math.max(
          ...["input", "output"].map(
            (direction) =>
              step.recipe.ingredients.filter((i) => i.direction === direction)
                .length,
          ),
        ) *
          42 +
        240,
    ),
  );
  const nodes: PlannedNode[] = plan.steps.map((step, index) => ({
    id: `plan-${index}`,
    type: "recipe",
    position: {
      x: positions.get(index)!.column * 860,
      y: positions.get(index)!.row * rowHeight,
    },
    data: {
      recipe: step.recipe,
      machineId: step.machineId,
      multiblock: step.multiblock,
      machines: balance.machines[index],
      variants: step.variants,
    },
  }));
  const edges: Edge[] = plan.links.map((link, index) => {
    const item = plan.steps[link.source].recipe.ingredients.find(
      (i) => i.direction === "output" && i.slot === link.sourceSlot,
    )!.item;
    return {
      id: `plan-edge-${index}`,
      source: nodes[link.source].id,
      target: nodes[link.target].id,
      sourceHandle: `output:${link.sourceSlot}`,
      targetHandle: `input:${link.targetSlot}`,
      type: "grid",
      data: { item },
    };
  });
  return { nodes, edges };
}

const format = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function AutoRecipePlanner({
  onClose,
  onAdd,
  embedded = false,
  initialTarget,
  initialMachineLimits,
}: {
  embedded?: boolean;
  initialTarget?: Item;
  initialMachineLimits?: { allowMultiblocks: boolean; maxTier: number };
  onClose: () => void;
  onAdd: (graph: PlannedGraph) => void;
}) {
  // An inline planner lives inside another flow's transformed viewport. Cancel
  // that transform's scale for its own canvas: React Flow measures handles in
  // screen pixels and only divides by its own viewport zoom.
  const parentZoom = useStore((state) => embedded ? state.transform[2] : 1);
  const [saved] = useState(readPlannerFilters);
  const [target, setTarget] = useState<Item | undefined>(initialTarget ?? saved.target);
  const [inputs, setInputs] = useState<Item[]>(saved.inputs ?? (saved.input ? [saved.input] : []));
  const [picker, setPicker] = useState<"target" | "input" | null>(null);
  const [priorities, setPriorities] = useState(saved.priorities ?? defaultPlannerPriorities(saved.priority));
  const [allowMultiblocks, setAllowMultiblocks] = useState(
    initialMachineLimits?.allowMultiblocks ?? saved.allowMultiblocks,
  );
  const [maxTier, setMaxTier] = useState(initialMachineLimits?.maxTier ?? saved.maxTier);
  const [maxSteps, setMaxSteps] = useState(saved.maxSteps);
  const [maxSuggestions, setMaxSuggestions] = useState(saved.maxSuggestions);
  const [bannedMachineIds, setBannedMachineIds] = useState(
    saved.bannedMachineIds,
  );
  const [recipeTypes, setRecipeTypes] = useState(saved.recipeTypes);
  const [filterChoices, setFilterChoices] = useState<{
    machines: Item[];
    recipeTypes: string[];
  }>();
  const [filterError, setFilterError] = useState("");
  const [filterAttempt, setFilterAttempt] = useState(0);
  const [excludedRecipes, setExcludedRecipes] = useState<string[]>([]);
  const [excludedPlans, setExcludedPlans] = useState<string[]>([]);
  const [result, setResult] = useState<PlannerResult>();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const plan = result?.plans[page];
  const baseGraph = useMemo(() => {
    if (!plan) return undefined;
    const graph = plannerGraph(plan);
    if (!embedded && plan.steps.length > 1) {
      const targetItem = plan.steps.flatMap(step => step.recipe.ingredients).find(i => i.direction === 'output' && i.itemId === (plan.targetOutputId ?? target?.id))?.item;
      graph.group = { title: target?.name.replace(/§./g, '') ?? 'Production', targetItem,
        calculators: targetItem ? plannerDefaultCalculators(targetItem, false) : [], fuelDefaultsPending: true };
    }
    return graph;
  }, [plan, embedded, target?.name]);
  const [edited, setEdited] = useState<{ base: PlannedGraph; graph: PlannedGraph }>();
  const graph = edited && edited.base === baseGraph ? edited.graph : baseGraph;
  const calculatorSummary = useMemo(() => graph?.group ? summarizePlanner(graph) : undefined, [graph]);
  const modified = !!graph && !!baseGraph && (graph.nodes.length !== baseGraph.nodes.length || graph.edges.length !== baseGraph.edges.length || graph.nodes.some((node, i) => node.data !== baseGraph.nodes[i]?.data));
  const valid =
    !!target?.id &&
    !inputs.some(input => input.id === target.id) &&
    [Number(maxSteps), Number(maxSuggestions)].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= 100,
    );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (embedded) return;
    try {
      sessionStorage.setItem(
        plannerFiltersKey,
        JSON.stringify({
          target,
          inputs,
          priorities,
          allowMultiblocks,
          maxTier,
          maxSteps,
          maxSuggestions,
          bannedMachineIds,
          recipeTypes,
        }),
      );
    } catch {}
  }, [
    embedded,
    target,
    inputs,
    priorities,
    allowMultiblocks,
    maxTier,
    maxSteps,
    maxSuggestions,
    bannedMachineIds,
    recipeTypes,
  ]);
  useEffect(() => {
    const request = new AbortController();
    fetch("/api/auto-planner", { signal: request.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Could not load machine and recipe type filters.",
          );
        if (!request.signal.aborted) {
          setFilterChoices(data);
          setFilterError("");
        }
      })
      .catch((error) => {
        if (!request.signal.aborted) setFilterError((error as Error).message);
      });
    return () => request.abort();
  }, [filterAttempt]);
  const invalidate = () => {
    controller.current?.abort();
    setBusy(false);
    setResult(undefined);
    setPage(0);
    setError("");
  };
  async function search(
    recipeExclusions = excludedRecipes,
    planExclusions = excludedPlans,
  ) {
    if (!valid) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setResult(undefined);
    setPage(0);
    const options: PlannerOptions = {
      targetId: target!.id,
      exactTarget: embedded,
      inputIds: inputs.map(input => input.id),
      priority: "eu",
      priorities,
      allowMultiblocks,
      maxTier,
      maxSteps: Number(maxSteps),
      maxSuggestions: Number(maxSuggestions),
      excludedRecipes: recipeExclusions,
      excludedPlans: planExclusions,
      bannedMachineIds,
      recipeTypes,
    };
    try {
      const response = await fetch("/api/auto-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        signal: current.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not search recipes.");
      if (!current.signal.aborted) setResult(data);
    } catch (error) {
      if (!current.signal.aborted) setError((error as Error).message);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  const choose = (item: Item) => {
    invalidate();
    if (picker === "target") setTarget(item);
    else setInputs(current => current.some(input => input.id === item.id) ? current : [...current, item]);
    setPicker(null);
  };
  return (
    <div className={embedded ? "planner-inline nodrag nopan nowheel" : "modal-backdrop"} onClick={embedded ? undefined : onClose}>
      <section
        className="dialog auto-planner-dialog"
        role="dialog"
        aria-modal={!embedded}
        aria-label="Auto Wizzard"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (picker) setPicker(null);
            else onClose();
          }
        }}
      >
        <div className="recipe-browser-heading item-picker-heading">
          <button
            type="button"
            aria-label="Back to planner"
            disabled={!picker}
            onClick={() => setPicker(null)}
          >
            <ArrowLeft size={17} />
          </button>
          <div className="recipe-view">
            <h2 className="recipe-title">
              <span className="item-slot">
                <WandSparkles size={24} />
              </span>
              <span>
                Auto Wizzard
              </span>
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Auto Wizzard"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
          <div className="planner-layout">
            <form
              className="planner-options settings-section"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
            <p className="planner-explanation">
              Choose a target to compare recipes. Add inputs to find production routes.
            </p>
              <h3>Items</h3>
              <div className="planner-input-list">
                <span>Input items (optional)</span>
                <div className="planner-input-values">
                {inputs.map(input => (
                  <div className="planner-input-choice" key={input.id}>
                    <span className="planner-selected-input">
                      {input.image && <img src={input.image} alt="" />}
                      {input.name.replace(/§./g, "")}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${input.name.replace(/§./g, "")} input`}
                      onClick={() => {
                        invalidate();
                        setInputs(current => current.filter(value => value.id !== input.id));
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" className="planner-item-choice" disabled={inputs.length >= 100} onClick={() => setPicker("input")}>
                  <Plus size={16} /> Add input item
                </button>
                </div>
              </div>
              <label>
                <span>Target item</span>
                <button
                  type="button"
                  className="planner-item-choice"
                  onClick={() => setPicker("target")}
                >
                  {target?.image && <img src={target.image} alt="" />}
                  <span>{target?.name.replace(/§./g, "") ?? "Choose target item"}</span>
                  <Search size={16} />
                </button>
              </label>
              <h3>Search options</h3>
              <PlannerPriorityList values={priorities} hasInputs={inputs.length > 0}
                onChange={values => { invalidate(); setPriorities(values); }} />
              <PlannerFilterDropdown
                  label="Maximum machine tier"
                  emptyLabel="Choose tier"
                  singleSelect
                  items={machineTiers.map((tier, index) => ({ id: String(index), name: tier }))}
                  selected={[String(maxTier)]}
                  onChange={([value]) => {
                    invalidate();
                    setMaxTier(Number(value));
                  }}
              />
              <label>
                <span>Maximum recipe steps</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={maxSteps}
                  onChange={(event) => {
                    invalidate();
                    setMaxSteps(event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Maximum suggestions</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={maxSuggestions}
                  onChange={(event) => {
                    invalidate();
                    setMaxSuggestions(event.target.value);
                  }}
                />
              </label>
              <label className="planner-checkbox settings-switch-row">
                <span>Allow multiblock structures</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={allowMultiblocks}
                  onChange={(event) => {
                    invalidate();
                    setAllowMultiblocks(event.target.checked);
                  }}
                />
              </label>
              <h3>Filters</h3>
              <PlannerFilterDropdown
                label="Banned machines"
                emptyLabel="No machines banned"
                loading={!filterChoices && !filterError}
                items={(filterChoices?.machines ?? []).map((machine) => ({
                  id: machine.id,
                  name: machine.name,
                  machine,
                }))}
                selected={bannedMachineIds}
                onChange={(ids) => {
                  invalidate();
                  setBannedMachineIds(ids);
                }}
              />
              <PlannerFilterDropdown
                label="Allowed recipe types"
                emptyLabel="All recipe types"
                loading={!filterChoices && !filterError}
                items={(filterChoices?.recipeTypes ?? []).map((name) => ({
                  id: name,
                  name,
                }))}
                selected={recipeTypes}
                onChange={(ids) => {
                  invalidate();
                  setRecipeTypes(ids);
                }}
              />
              {filterError && (
                <div role="alert">
                  {filterError}
                  <button
                    type="button"
                    onClick={() => setFilterAttempt((value) => value + 1)}
                  >
                    Retry loading filters
                  </button>
                </div>
              )}
              <button type="submit" disabled={!valid || busy}>
                <Search size={16} />
                {busy ? "Searching…" : "Find suggestions"}
              </button>
              {busy && (
                <button type="button" onClick={invalidate}>
                  Cancel search
                </button>
              )}

            {plan && graph && (
              <>
                <div className="planner-step-list">
                  {graph.nodes.map(({ data: step }, index) => (
                    <span key={`${step.recipe.id}-${index}`}>
                      {index + 1}. {step.recipe.handler}
                      <button
                        type="button"
                        title="Exclude this recipe from all suggestions until this popup closes"
                        aria-label={`Disregard ${step.recipe.handler} recipe at step ${index + 1}`}
                        onClick={() => {
                          const next = [...excludedRecipes, step.recipe.id];
                          setExcludedRecipes(next);
                          void search(next, excludedPlans);
                        }}
                      >
                        <Ban size={14} />
                      </button>
                    </span>
                  ))}
                </div>
                {!modified && plan.supplies.length > 0 && (
                  <details>
                    <summary>
                      Other required inputs per target ({plan.supplies.length})
                    </summary>
                    <div className="planner-supplies">
                      {plan.supplies.map(({ item, amount }) => (
                        <span key={item.id}>
                          <ItemSlot item={item} />
                          {format(amount)} {item.kind === "fluid" ? "L" : "×"}{" "}
                          {item.name.replace(/§./g, "")}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
            {(excludedRecipes.length > 0 || excludedPlans.length > 0) && (
              <small>
                {excludedRecipes.length} recipes and {excludedPlans.length}{" "}
                suggestions disregarded until this popup closes.
              </small>
            )}
            </form>
            <div className="planner-main">
            {error && <p role="alert">{error}</p>}
            {result?.limited && (
              <p className="planner-notice" role="status">
                Search limit reached. These are the best routes found, not a
                guaranteed global optimum. Narrow the inputs or step limit to
                search more thoroughly.
              </p>
            )}
            {result && !plan && (
              <p role="status">
                No matching routes found within these limits. Try another input,
                tier, or step limit.
              </p>
            )}
            {plan && graph && (
              <>
                <div className="planner-results-toolbar">
                  <button
                    type="button"
                    aria-label="Previous suggestion"
                    disabled={result!.plans.length < 2}
                    onClick={() =>
                      setPage(
                        (page + result!.plans.length - 1) %
                          result!.plans.length,
                      )
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    Suggestion {page + 1} / {result!.plans.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next suggestion"
                    disabled={result!.plans.length < 2}
                    onClick={() => setPage((page + 1) % result!.plans.length)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  {!modified && <strong>{format(plan.totalEu)} EU / target</strong>}
                  {inputs.length > 0 && !modified && (
                    <span>{format(1 / plan.inputAmount)} target / {inputs.length > 1 ? "combined input unit" : "input"}</span>
                  )}
                  <span>
                    {graph.nodes.length}{" "}
                    {graph.nodes.length === 1 ? "step" : "steps"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...excludedPlans, plan.key];
                      setExcludedPlans(next);
                      void search(excludedRecipes, next);
                    }}
                  >
                    <Ban size={16} />
                    Disregard suggestion
                  </button>
                </div>
              </>
            )}
            {!embedded && calculatorSummary && !!graph?.group?.calculators?.length && <PlannerCalculatorResults summary={calculatorSummary} calculators={graph.group.calculators} />}
            <div className={`planner-preview${embedded ? " planner-preview-embedded" : ""}`} style={{ zoom: 1 / parentZoom, width: "100%" }}>
              <ReactFlowProvider key={plan?.key ?? "empty-preview"}>
                <PlannerPreview machineLimits={{ allowMultiblocks, maxTier }} graph={graph ?? emptyPreviewGraph} onChange={(next) => {
                  if (baseGraph) setEdited({ base: baseGraph, graph: next });
                }} />
              </ReactFlowProvider>
            </div>
            {plan && graph && <div className="planner-preview-actions">
              {!embedded && graph.group && <button type="button" onClick={() => {
                if (baseGraph) setEdited({ base: baseGraph, graph: { ...graph, group: undefined } });
              }}><X size={16} />Remove group</button>}
              <button type="button" onClick={() => onAdd(graph)}>
                <Plus size={16} />{embedded ? "Confirm branch" : "Add to diagram"}
              </button>
            </div>}
            </div>
          </div>
      </section>
      {picker && createPortal(
        <div className="modal-backdrop planner-picker-backdrop nodrag nopan nowheel"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); setPicker(null); }}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === "Escape") setPicker(null);
          }}>
          <section className="dialog item-picker-dialog" role="dialog" aria-modal="true"
            aria-label={`Choose ${picker} item`} onClick={event => event.stopPropagation()}>
            <div className="dialog-heading">
              <h2>Choose {picker} item</h2>
              <button type="button" autoFocus aria-label="Close item picker" onClick={() => setPicker(null)}><X size={20} /></button>
            </div>
            <Inventory picker onBrowse={choose} onAddItem={choose} />
          </section>
        </div>, document.body,
      )}
    </div>
  );
}
