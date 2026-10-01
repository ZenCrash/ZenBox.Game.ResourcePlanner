"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { PlannerPreview } from "./planner-preview";
import { plannerPositions } from "@/lib/planner-columns";
import { readPlannerFilters, plannerFiltersKey } from "@/lib/planner-filters";

export type PlannedNode = Node<
  {
    recipe: Recipe;
    machineId?: string;
    machines: number;
    variants: VariantSelection;
  },
  "recipe"
>;
export type PlannedGraph = { nodes: PlannedNode[]; edges: Edge[] };

export function plannerGraph(plan: PlannerPlan): PlannedGraph {
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
      machines: 1,
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
}: {
  embedded?: boolean;
  initialTarget?: Item;
  onClose: () => void;
  onAdd: (graph: PlannedGraph) => void;
}) {
  // An inline planner lives inside another flow's transformed viewport. Cancel
  // that transform's scale for its own canvas: React Flow measures handles in
  // screen pixels and only divides by its own viewport zoom.
  const parentZoom = useStore((state) => embedded ? state.transform[2] : 1);
  const [saved] = useState(readPlannerFilters);
  const [target, setTarget] = useState<Item | undefined>(initialTarget ?? saved.target);
  const [input, setInput] = useState<Item | undefined>(saved.input);
  const [picker, setPicker] = useState<"target" | "input" | null>(null);
  const [priority, setPriority] = useState<"eu" | "yield">(saved.priority);
  const [allowMultiblocks, setAllowMultiblocks] = useState(
    saved.allowMultiblocks,
  );
  const [maxTier, setMaxTier] = useState(saved.maxTier);
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
  const baseGraph = useMemo(() => (plan ? plannerGraph(plan) : undefined), [plan]);
  const [edited, setEdited] = useState<{ base: PlannedGraph; graph: PlannedGraph }>();
  const graph = edited && edited.base === baseGraph ? edited.graph : baseGraph;
  const modified = !!graph && !!baseGraph && (graph.nodes.length !== baseGraph.nodes.length || graph.edges.length !== baseGraph.edges.length || graph.nodes.some((node, i) => node.data !== baseGraph.nodes[i]?.data));
  const valid =
    !!target &&
    (priority !== "yield" || !!input) &&
    target.id !== input?.id &&
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
          input,
          priority,
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
    input,
    priority,
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
      inputId: input?.id,
      priority,
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
    else setInput(item);
    setPicker(null);
  };
  return (
    <div className={embedded ? "planner-inline nodrag nopan nowheel" : "modal-backdrop"} onClick={embedded ? undefined : onClose}>
      <section
        className="dialog auto-planner-dialog"
        role="dialog"
        aria-modal={!embedded}
        aria-label="Auto Recipe Planner"
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
                {picker
                  ? `Choose ${picker === "target" ? "target" : "input"} item`
                  : "Auto Recipe Planner"}
              </span>
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close auto recipe planner"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {picker ? (
          <div className="planner-item-picker">
            <Inventory
              picker
              onBrowse={(item) => choose(item)}
              onAddItem={choose}
            />
          </div>
        ) : (
          <>
            <form
              className="planner-options"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
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
              <label>
                Target item
                <button
                  type="button"
                  className="planner-item-choice"
                  onClick={() => setPicker("target")}
                >
                  {target?.image && <img src={target.image} alt="" />}
                  {target?.name.replace(/§./g, "") ?? "Choose target item"}
                  <Search size={16} />
                </button>
              </label>
              <label>
                Input item (optional)
                <span className="planner-input-choice">
                  <button
                    type="button"
                    className="planner-item-choice"
                    onClick={() => setPicker("input")}
                  >
                    {input?.image && <img src={input.image} alt="" />}
                    {input?.name.replace(/§./g, "") ?? "Choose input item"}
                    <Search size={16} />
                  </button>
                  {input && (
                    <button
                      type="button"
                      aria-label="Clear input item"
                      onClick={() => {
                        invalidate();
                        setInput(undefined);
                        setPriority("eu");
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </span>
              </label>
              <label>
                Prioritize
                <select
                  value={priority}
                  onChange={(event) => {
                    invalidate();
                    setPriority(event.target.value as "eu" | "yield");
                  }}
                >
                  <option value="eu">Cheapest EU cost</option>
                  <option value="yield" disabled={!input}>
                    Most output from input
                  </option>
                </select>
              </label>
              <label>
                Maximum machine tier
                <select
                  value={maxTier}
                  onChange={(event) => {
                    invalidate();
                    setMaxTier(Number(event.target.value));
                  }}
                >
                  {machineTiers.map((tier, index) => (
                    <option key={tier} value={index}>
                      {tier}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Maximum recipe steps
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
                Maximum suggestions
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
              <label className="planner-checkbox">
                <input
                  type="checkbox"
                  role="switch"
                  checked={allowMultiblocks}
                  onChange={(event) => {
                    invalidate();
                    setAllowMultiblocks(event.target.checked);
                  }}
                />
                Allow multiblock structures
              </label>
              <button type="submit" disabled={!valid || busy}>
                <Search size={16} />
                {busy ? "Searching…" : "Find suggestions"}
              </button>
              {busy && (
                <button type="button" onClick={invalidate}>
                  Cancel search
                </button>
              )}
            </form>
            <p className="planner-explanation">
              {input
                ? "Tries to produce additional ingredients from your input too. Fewer distinct external inputs rank first, followed by your selected priority."
                : "Choose an input to find a multi-step route. Without one, compares recipes that directly produce the target."}{" "}
              Costs are expected EU per target unit; byproducts receive no
              energy credit. Fuel and steam costs are separate from EU. Fluid
              and filled-container matches {embedded ? "must produce the exact requested target form; the" : "are compared by fluid amount; the"}
              preview shows the actual recipe form. Suggestions are the best
              found within a bounded search.
            </p>
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
                  {input && !modified && (
                    <span>{format(1 / plan.inputAmount)} target / input</span>
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
                  <button type="button" onClick={() => onAdd(graph)}>
                    <Plus size={16} />
                    {embedded ? "Confirm branch" : "Add to diagram"}
                  </button>
                </div>
                <div className={`planner-preview${embedded ? " planner-preview-embedded" : ""}`} style={{ zoom: 1 / parentZoom, width: "100%" }}>
                  <ReactFlowProvider key={plan.key}>
                    <PlannerPreview graph={graph} onChange={(next) => setEdited({ base: baseGraph!, graph: next })} />
                  </ReactFlowProvider>
                </div>
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
          </>
        )}
      </section>
    </div>
  );
}
