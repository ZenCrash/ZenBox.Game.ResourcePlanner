"use client";
import { createContext, useContext, memo, useRef, useLayoutEffect, useMemo } from "react";
import { useStore, type Node, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { itemColor, applyVariants, recipeTabIcon, type Recipe, type VariantSelection } from "@/lib/model";
import type { PortRows } from "@/lib/port-layout";
import type { SummaryCalculation } from "@/lib/summary-rate";
import { overclockRecipe, recipeComparison } from "@/lib/recipe-overclock";
import { selectedMachine, machineTier, machineTiers, machineOptions, tierColors, isMachineUpgrade } from "@/lib/machine-selection";
import { useDisplaySettings } from "./display-settings";
import { PortItemHighlight } from "./port-item-highlight";
import { RecipePorts } from "./recipe-ports";
import { ItemSlot, RecipeView, type Browse } from "./recipe-view";
import { useRecipeCardWidth } from "./use-recipe-card-width";
import { MultiblockControls } from "./multiblock-controls";
import type { MultiblockConfig } from "@/lib/multiblock";
import { MachineSelector } from "./machine-selector";
import { RecipeChevron } from "./recipe-chevron";
import { ItemTooltip } from "./item-tooltip";
import { outsideViewport } from "@/lib/viewport-visibility";
export type RecipeNode = Node<
  {
    recipe: Recipe;
    machines: number;
    machineId?: string;
    multiblock?: MultiblockConfig;
    originalMachines?: number;
    originalMachineId?: string;
    scaleAmount?: number;
    scaleMachineId?: string;
    variants: VariantSelection;
    portRows?: PortRows;
    disabledPorts?: string[];
    theme?: import("@/lib/group-theme").GroupTheme;
    ignoredItems?: string[];
    calculators?: SummaryCalculation[];
    title?: string;
    text?: string;
    fontSize?: number;
    textColor?: string;
    backgroundColor?: string;
  },
  "recipe" | "summary" | "label"
>;
export const EditorContext = createContext<{
  browse: Browse;
  count: (id: string, value: number) => void;
  selectMachine: (id: string, machineId: string) => void;
  configureMultiblock: (id: string, config: MultiblockConfig) => void;
  color: (itemId: string) => string;
  connected: Set<string>;
  utilization: Map<string, number>;
  scaleView?: boolean;
  scaled?: Set<string>;
  setScale?: (id: string, patch: { scaleAmount?: number; scaleMachineId?: string }) => void;
  selectedConnections: Map<string, string[]>;
  disconnect: (id: string) => void;
  movePorts: (id: string, rows: PortRows) => void;
  togglePort: (id: string, handle: string) => void;
  remove: (id: string) => void;
}>({
  browse: () => {},
  count: () => {},
  selectMachine: () => {},
  configureMultiblock: () => {},
  color: itemColor,
  connected: new Set(),
  utilization: new Map(),
  selectedConnections: new Map(),
  disconnect: () => {},
  movePorts: () => {},
  togglePort: () => {},
  remove: () => {},
});
export const MachineCard = memo(function MachineCard(props: NodeProps<RecipeNode>) {
  return <PortItemHighlight><MachineCardContent {...props} /></PortItemHighlight>;
}, (a, b) => a.id === b.id && a.data === b.data && a.selected === b.selected);
const MachineCardContent = memo(function MachineCardContent({ id, data, selected }: NodeProps<RecipeNode>) {
  const { settings } = useDisplaySettings();
  const overview = useStore((state) => state.transform[2] < settings.overviewZoom);
  const offscreen = useStore(state => {
    const node = state.nodeLookup.get(id);
    return !!node && outsideViewport({ ...node.internals.positionAbsolute, width: node.measured.width ?? 0, height: node.measured.height ?? 0 }, state.transform, state.width, state.height);
  });
  const cardRef = useRef<HTMLDivElement>(null);
  const measured = useRef(new WeakMap<RecipeNode["data"], { scale: number; overview: boolean; width: number; height: number }>());
  const cached = measured.current.get(data);
  const deferBody = offscreen && !!cached && cached.scale === settings.guiScale && cached.overview === overview;
  useLayoutEffect(() => {
    if (!deferBody && cardRef.current) measured.current.set(data, { scale: settings.guiScale, overview, width: cardRef.current.offsetWidth, height: cardRef.current.offsetHeight });
  });
  const {
      browse,
      count,
      selectMachine,
      color,
      connected,
      utilization,
      scaleView,
      scaled,
      setScale,
      movePorts,
      togglePort,
      remove,
      configureMultiblock,
      selectedConnections,
      disconnect,
    } = useContext(EditorContext),
    baseRecipe = useMemo(() => applyVariants(data.recipe, data.variants), [data.recipe, data.variants]),
    recipe = useMemo(() => overclockRecipe(baseRecipe, data.machineId, data.multiblock), [baseRecipe, data.machineId, data.multiblock]);
  useRecipeCardWidth(cardRef, data, deferBody, `${!!scaleView}/${!!scaled?.has(id)}`, settings.guiScale);
  const ports = (
    <RecipePorts
      id={id}
      recipe={recipe}
      machines={data.machines}
      utilization={utilization.get(id) ?? 1}
      saved={data.portRows}
      disabledPorts={data.disabledPorts}
      togglePort={togglePort}
      color={color}
      connected={connected}
      selectedConnections={selectedConnections}
      disconnect={disconnect}
      commit={movePorts}
    />
  );
  const deleteButton = (
    <button
      className="recipe-delete nodrag nopan"
      aria-label="Delete recipe"
      title="Delete recipe"
      onClick={(event) => {
        event.stopPropagation();
        remove(id);
      }}
    >
      <X size={15} />
    </button>
  );
  // Keep dimensions and ports mounted: offscreen endpoints must still connect
  // correctly, and cards must not jump when they enter the viewport.
  if (deferBody && cached) return <div ref={cardRef} className="machine-card machine-card-deferred" style={{ height: cached.height }}>{ports}</div>;
  if (recipe.sourceItemId) {
    const item = recipe.ingredients[0].item;
    return (
      <div ref={cardRef} className={`machine-card ${selected ? "selected" : ""}`}>
        <div className={`recipe-view item-source-card${scaleView ? " scale-view-card" : ""}`}>
          <div className="recipe-title">Item source</div>
          {deleteButton}
          <div className="item-source-content">
            <ItemSlot item={item} onBrowse={browse} />
            <span>{item.name}</span>
          </div>
        </div>
        {ports}
      </div>
    );
  }
  const machine = selectedMachine(baseRecipe, data.machineId);
  const overviewImage = machine?.image ?? recipeTabIcon(baseRecipe);
  const overviewTier = machine ? machineTier(machine) : undefined;
  const defaultMachine = selectedMachine(baseRecipe);
  const defaultOverviewTier = (defaultMachine && machineTier(defaultMachine)) ??
    (overviewTier ? machineOptions(baseRecipe).options
      .map(machineTier)
      .filter((tier): tier is string => !!tier)
      .sort((a, b) => machineTiers.indexOf(a) - machineTiers.indexOf(b))[0] : undefined);
  const comparison = recipeComparison(baseRecipe, data.machineId);
  const originalMachine = selectedMachine(baseRecipe, data.originalMachineId);
  const originalTier = scaleView && data.machineId !== data.originalMachineId && originalMachine ? machineTier(originalMachine) : undefined;
  return (
    <div
      ref={cardRef}
      className={`machine-card ${selected ? "selected" : ""}${overview ? " machine-card-overview" : ""}${scaleView ? " scale-view-card" : ""}`}
    >
      <RecipeView
        recipe={recipe}
        referenceRecipe={comparison.referenceRecipe}
        referenceTimeTicks={comparison.referenceTimeTicks}
        machineCount={data.machines}
        isDefaultMachine={comparison.isDefaultMachine}
        onBrowse={browse}
        footerControl={
          <div
            className="machine-amount-control nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className={`machine-count-controls${scaleView ? " scale-count-controls" : ""}${scaleView && scaled?.has(id) ? " scale-calculated" : ""}`}>
              <MachineSelector
                recipe={baseRecipe}
                machineId={data.machineId}
                amount={data.machines}
                readOnly={scaleView}
                originalAmount={scaleView && scaled?.has(id) ? data.originalMachines : undefined}
                originalTier={originalTier}
                onAmountChange={(amount) => count(id, amount)}
                onSelect={(machineId) => selectMachine(id, machineId)}
              />
              {scaleView ? <div className={`scale-fixed-control${(data.scaleAmount ?? 0) > 0 || selectedMachine(baseRecipe, data.scaleMachineId ?? data.machineId)?.id !== defaultMachine?.id ? " is-modified" : ""}`}>
                <MachineSelector recipe={baseRecipe} machineId={data.scaleMachineId ?? data.machineId} amount={data.scaleAmount} decimal
                  onClear={() => setScale?.(id, { scaleAmount: undefined })}
                  onReset={() => setScale?.(id, { scaleAmount: undefined, scaleMachineId: defaultMachine?.id })}
                  onAmountChange={amount => setScale?.(id, { scaleAmount: amount })}
                  onSelect={machineId => setScale?.(id, { scaleMachineId: machineId })} />
                <div className="machine-count-stepper nopan">
                  <button type="button" className="recipe-nav-button" aria-label="Increase fixed machine amount" title="Increase fixed machine amount"
                    disabled={(data.scaleAmount ?? 0) >= 1e9}
                    onClick={() => setScale?.(id, { scaleAmount: Math.min(1e9, (data.scaleAmount ?? 0) + 1) })}>
                    <RecipeChevron direction="up" />
                  </button>
                  <button type="button" className="recipe-nav-button" aria-label="Decrease fixed machine amount" title="Decrease fixed machine amount"
                    onClick={() => {
                      if (data.scaleAmount === undefined || data.scaleAmount <= 0) return;
                      setScale?.(id, { scaleAmount: data.scaleAmount > 1 ? data.scaleAmount - 1 : undefined });
                    }}>
                    <RecipeChevron direction="down" />
                  </button>
                </div>
              </div> : <div className="machine-count-stepper nopan">
                <button
                  type="button"
                  className="recipe-nav-button"
                  aria-label="Increase machine amount"
                  title="Increase machine amount"
                  disabled={data.machines >= 1e9}
                  onClick={() => count(id, Math.min(1e9, data.machines + 1))}
                >
                  <RecipeChevron direction="up" />
                </button>
                <button
                  type="button"
                  className="recipe-nav-button"
                  aria-label="Decrease machine amount"
                  title="Decrease machine amount"
                  onClick={() => {
                    if (data.machines > 1)
                      count(id, Math.max(1, data.machines - 1));
                  }}
                >
                  <RecipeChevron direction="down" />
                </button>
              </div>}
            </div>
          </div>
        }
        minHeight={
          Math.max(
            ...["input", "output"].map(
              (direction) =>
                recipe.ingredients.filter((i) => i.direction === direction)
                  .length,
            ),
          ) *
            42 +
          64
        }
      >
        {deleteButton}
        <MultiblockControls recipe={baseRecipe} machineId={data.machineId} value={data.multiblock} onChange={config => configureMultiblock(id, config)} />
      </RecipeView>
      <div className="machine-overview-image" aria-hidden={!overview}>
        <div className="machine-overview-header">
          <span>{recipe.handler}</span>
          {defaultOverviewTier && <span>(<span className="recipe-tier-text" data-tier={defaultOverviewTier} style={{ color: tierColors[defaultOverviewTier] }}>{defaultOverviewTier}</span>)</span>}
        </div>
        <div className="machine-overview-body">
          <div className="machine-overview-art">
            {overviewImage ? (
              <img src={overviewImage} alt={machine?.name ?? recipe.handler} />
            ) : (
              <span>{recipe.handler}</span>
            )}
            {data.machines !== 1 && <span className="machine-overview-count">{data.machines.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>}
            {isMachineUpgrade(baseRecipe, data.machineId) && (
              <span className="machine-overview-upgrade" aria-label="Upgraded machine">
                <RecipeChevron direction="up" />
                {overviewTier && <span className="machine-overview-upgrade-tier">(<span className="recipe-tier-text" data-tier={overviewTier} style={{ color: tierColors[overviewTier] }}>{overviewTier}</span>)</span>}
              </span>
            )}
          </div>
          {scaleView && scaled?.has(id) && data.originalMachines !== undefined && (
            <div className="machine-overview-original">
              {data.originalMachines.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              {originalTier && <> <span className="recipe-tier-parenthesis">(</span><span className="recipe-tier-text" data-tier={originalTier} style={{ color: tierColors[originalTier] }}>{originalTier}</span><span className="recipe-tier-parenthesis">)</span></>}
            </div>
          )}
        </div>
      </div>
      {overview && (
        <ItemTooltip compact followPointer placement="top-right">
          <strong>
            {(machine?.name ?? recipe.handler).replace(/§./g, "")}
          </strong>
        </ItemTooltip>
      )}
      {ports}
    </div>
  );
});
