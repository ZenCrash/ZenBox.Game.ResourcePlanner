"use client";
import { createContext, useContext } from "react";
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
import { MachineSelector } from "./machine-selector";
import { RecipeChevron } from "./recipe-chevron";
import { ItemTooltip } from "./item-tooltip";
export type RecipeNode = Node<
  {
    recipe: Recipe;
    machines: number;
    machineId?: string;
    variants: VariantSelection;
    portRows?: PortRows;
    disabledPorts?: string[];
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
  color: (itemId: string) => string;
  connected: Set<string>;
  selectedConnections: Map<string, string[]>;
  disconnect: (id: string) => void;
  movePorts: (id: string, rows: PortRows) => void;
  togglePort: (id: string, handle: string) => void;
  remove: (id: string) => void;
}>({
  browse: () => {},
  count: () => {},
  selectMachine: () => {},
  color: itemColor,
  connected: new Set(),
  selectedConnections: new Map(),
  disconnect: () => {},
  movePorts: () => {},
  togglePort: () => {},
  remove: () => {},
});
export function MachineCard(props: NodeProps<RecipeNode>) {
  return <PortItemHighlight><MachineCardContent {...props} /></PortItemHighlight>;
}
function MachineCardContent({ id, data, selected }: NodeProps<RecipeNode>) {
  const { settings } = useDisplaySettings();
  const overview = useStore((state) => state.transform[2] < settings.overviewZoom);
  const {
      browse,
      count,
      selectMachine,
      color,
      connected,
      movePorts,
      togglePort,
      remove,
      selectedConnections,
      disconnect,
    } = useContext(EditorContext),
    baseRecipe = applyVariants(data.recipe, data.variants),
    recipe = overclockRecipe(baseRecipe, data.machineId);
  const ports = (
    <RecipePorts
      id={id}
      recipe={recipe}
      machines={data.machines}
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
  if (recipe.sourceItemId) {
    const item = recipe.ingredients[0].item;
    return (
      <div className={`machine-card ${selected ? "selected" : ""}`}>
        <div className="recipe-view item-source-card">
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
  return (
    <div
      className={`machine-card ${selected ? "selected" : ""}${overview ? " machine-card-overview" : ""}`}
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
            <div className="machine-count-controls">
              <MachineSelector
                recipe={baseRecipe}
                machineId={data.machineId}
                amount={data.machines}
                onAmountChange={(amount) => count(id, amount)}
                onSelect={(machineId) => selectMachine(id, machineId)}
              />
              <div className="machine-count-stepper nopan">
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
              </div>
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
            {data.machines > 1 && <span className="machine-overview-count">{data.machines}</span>}
            {isMachineUpgrade(baseRecipe, data.machineId) && (
              <span className="machine-overview-upgrade" aria-label="Upgraded machine">
                <RecipeChevron direction="up" />
                {overviewTier && <span className="machine-overview-upgrade-tier">(<span className="recipe-tier-text" data-tier={overviewTier} style={{ color: tierColors[overviewTier] }}>{overviewTier}</span>)</span>}
              </span>
            )}
          </div>
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
}
