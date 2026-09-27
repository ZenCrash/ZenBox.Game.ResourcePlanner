"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyVariants,
  cycleVariants,
  type VariantSelection,
} from "@/lib/model";
import type { Item, Recipe } from "@/lib/model";
import { MinecraftText } from "./minecraft-text";
import { ItemTooltip } from "./item-tooltip";
import { recipePowerInfo } from "@/lib/recipe-power";
import { machineTiers, tierColors } from "@/lib/machine-selection";
import {
  recipeSlotGroups,
  shapedCraftingSlots,
  type RecipeSlotCounts,
} from "@/lib/recipe-slots";
export type Browse = (
  item: Item,
  mode: "recipes" | "uses" | "category",
  selectedRecipeId?: string,
) => void;
function TierText({ text }: { text: string }) {
  return text
    .split(
      /(\b(?:ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\b|[()])/gi,
    )
    .map((part, index) => {
      const tier = machineTiers.find(
        (value) => value.toLowerCase() === part.toLowerCase(),
      );
      return tier ? (
        <span
          key={index}
          className="recipe-tier-text"
          data-tier={tier}
          style={{ color: tierColors[tier] }}
        >
          {part}
        </span>
      ) : part === "(" || part === ")" ? (
        <span key={index} className="recipe-tier-parenthesis">
          {part}
        </span>
      ) : (
        part
      );
    });
}
export function ItemSlot({
  item,
  amount,
  onBrowse,
  onToggleGroup,
  groupHint,
  backgroundItem,
  groupExpanded,
  groupTitle,
  onAddItem,
  nativeTooltip,
  tooltipAtPointer,
}: {
  item: Item;
  amount?: number;
  onBrowse?: Browse;
  onToggleGroup?: () => void;
  groupHint?: string;
  backgroundItem?: Item;
  groupExpanded?: boolean;
  groupTitle?: string;
  onAddItem?: (item: Item) => void;
  nativeTooltip?: boolean;
  tooltipAtPointer?: boolean;
}) {
  const amountLabel =
    amount === undefined
      ? undefined
      : `${amount}${item.kind === "fluid" ? "L" : ""}`;
  let lines: string[] = [];
  try {
    lines = JSON.parse(item.tooltip);
  } catch {}
  return (
    <button
      className="item-slot nodrag"
      onClick={(event) => {
        if (event.ctrlKey && onAddItem) {
          event.preventDefault();
          onAddItem(item);
        } else if (event.shiftKey && onToggleGroup) {
          event.preventDefault();
          onToggleGroup();
        } else onBrowse?.(item, "recipes");
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onBrowse?.(item, "uses");
      }}
      aria-label={`${item.name}${amountLabel !== undefined ? ` × ${amountLabel}` : ""}`}
      title={
        nativeTooltip
          ? [item.name, ...lines].join("\n").replace(/§[0-9a-fk-or]/gi, "")
          : undefined
      }
      aria-expanded={groupExpanded}
    >
      {backgroundItem?.image && (
        <img
          className="group-background-item"
          src={backgroundItem.image}
          alt=""
        />
      )}
      <span
        className={`item-art ${backgroundItem ? "group-foreground-item" : ""}`}
      >
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" />
        ) : (
          <span className="missing-item">?</span>
        )}
      </span>
      {amount !== undefined &&
        amount !== 0 &&
        (amount !== 1 || item.kind === "fluid") && (
          <span className="stack-count">{amountLabel}</span>
        )}
      <ItemTooltip followPointer={tooltipAtPointer}>
        <strong>
          <MinecraftText text={groupTitle || item.name} />
        </strong>
        {!groupTitle &&
          lines
            .filter(
              (line, i) =>
                i !== 0 ||
                line.replace(/§./g, "") !== item.name.replace(/§./g, ""),
            )
            .map((line, i) => (
              <span key={i}>
                <MinecraftText text={line} />
              </span>
            ))}
        {!groupTitle && (
          <small>
            {item.registryId}:{item.metadata}
          </small>
        )}
        {!groupTitle && <em>{item.mod}</em>}
        {groupHint && <span className="group-hint">{groupHint}</span>}
      </ItemTooltip>
    </button>
  );
}

export function CyclingRecipe({
  recipe,
  onBrowse,
  onSelect,
  disabled,
  pager,
  navigation,
}: {
  recipe: Recipe;
  onBrowse: Browse;
  onSelect: (variants: VariantSelection, keepOpen: boolean) => void;
  disabled: boolean;
  pager?: ReactNode;
  navigation?: { previous: ReactNode; next: ReactNode };
}) {
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const held = useRef(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      held.current = event.shiftKey;
      setPaused(event.shiftKey);
    };
    const blur = () => {
      held.current = false;
      setPaused(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    const timer = setInterval(() => {
      if (!held.current) setFrame((value) => value + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const variants = cycleVariants(recipe, frame);
  return (
    <div
      onPointerMove={(event) => {
        held.current = event.shiftKey;
        if (paused !== event.shiftKey) setPaused(event.shiftKey);
      }}
    >
      <RecipeView
        recipe={applyVariants(recipe, variants)}
        belowTitle={pager}
        navigation={navigation}
        onBrowse={onBrowse}
      />
      <p className="variant-hint">
        {paused ? "Variants paused" : "Hold Shift to pause variants"}
        <br />
        Adding a recipe locks the displayed items
      </p>
      <button
        className="primary select-recipe"
        disabled={disabled}
        onClick={() => onSelect(variants, false)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!disabled) onSelect(variants, true);
        }}
        title="Right-click to add and keep the recipe selector open"
      >
        Add recipe to diagram
      </button>
    </div>
  );
}
export function RecipeView({
  recipe,
  referenceRecipe,
  onBrowse,
  children,
  footerControl,
  minHeight,
  belowTitle,
  navigation,
}: {
  recipe: Recipe;
  referenceRecipe?: Recipe;
  onBrowse?: Browse;
  children?: ReactNode;
  footerControl?: ReactNode;
  minHeight?: number;
  belowTitle?: ReactNode;
  navigation?: { previous: ReactNode; next: ReactNode };
}) {
  const power = recipePowerInfo(recipe);
  const reference =
    referenceRecipe &&
    (referenceRecipe.euPerTick !== recipe.euPerTick ||
      referenceRecipe.durationTicks !== recipe.durationTicks)
      ? referenceRecipe
      : undefined;
  const isCrafting =
    recipe.handler === "Shaped Crafting" ||
    recipe.handler === "Shapeless Crafting";
  const crafting = isCrafting ? shapedCraftingSlots(recipe.ingredients) : null;
  let layout: {
    background?: string;
    width?: number;
    height?: number;
    slotCounts?: RecipeSlotCounts;
  } = {};
  try {
    layout = JSON.parse(recipe.layout);
  } catch {}
  const positioned =
    recipe.ingredients.every((i) => i.x !== null && i.y !== null) &&
    layout.width &&
    layout.height;
  return (
    <div
      className={`recipe-view${isCrafting ? " shaped-crafting" : ""}`}
      style={{ minHeight }}
    >
      <div className="recipe-title">
        {navigation?.previous}
        <span>{recipe.handler}</span>
        {navigation?.next}
      </div>
      {belowTitle}
      {crafting ? (
        <div className="crafting-layout">
          <div
            className="crafting-inputs"
            role="group"
            aria-label="Crafting inputs, 3 by 3 grid"
          >
            {crafting.inputs.map((ingredient, index) =>
              ingredient ? (
                <ItemSlot
                  key={index}
                  item={ingredient.item}
                  amount={ingredient.amount}
                  onBrowse={onBrowse}
                />
              ) : (
                <span
                  key={index}
                  className="item-slot empty-recipe-slot"
                  role="img"
                  aria-label={`Empty crafting slot ${index + 1}`}
                />
              ),
            )}
          </div>
          <CategorySymbol
            className="crafting-arrow"
            recipe={recipe}
            onBrowse={onBrowse}
          >
            <svg
              viewBox="0 0 24 18"
              aria-hidden="true"
              shapeRendering="crispEdges"
            >
              <path d="M0 7H14V0L23 9L14 18V11H0Z" fill="#8b8b8b" />
            </svg>
          </CategorySymbol>
          <div
            className="crafting-output"
            role="group"
            aria-label="Crafting output"
          >
            {crafting.output ? (
              <ItemSlot
                item={crafting.output.item}
                amount={crafting.output.amount}
                onBrowse={onBrowse}
              />
            ) : (
              <span
                className="item-slot empty-recipe-slot"
                role="img"
                aria-label="Empty crafting output slot"
              />
            )}
          </div>
        </div>
      ) : recipe.handler === "Smelting" ? (
        <SmeltingLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Casting Table" ? (
        <CastingTableLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Infernal Blast Furnace" ? (
        <InfernalBlastFurnaceLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "TiC Part Extruding" ||
        recipe.handler === "Extruder" ||
        recipe.handler === "Alloy Smelter Molding" ||
        recipe.handler === "Alloy Smelter Recycling" ? (
        <TwoInputMachineLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Fluid Solidifier" ||
        recipe.handler.startsWith("Magic Energy Absorber Fu") ? (
        <SingleInputMachineLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Blast Furnace" ||
        recipe.handler === "Bricked Blast Furnace" ||
        recipe.handler === "Arc Furnace Recycling" ||
        recipe.handler === "Macerator Recycling" ? (
        <FurnaceGridLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Carpenter" ? (
        <CarpenterLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Bottler" ? (
        <BottlerLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Distillation Tower" ? (
        <DistillationTowerLayout recipe={recipe} onBrowse={onBrowse} />
      ) : recipe.handler === "Assembler" ||
        recipe.handler === "Circuit Assembler" ||
        recipe.handler === "Forming Press" ||
        recipe.handler === "Distillery" ||
        recipe.handler === "Chemical Reactor" ||
        recipe.handler === "Large Chemical Reactor" ||
        recipe.handler === "Chemical Plant" ||
        recipe.handler === "Mixer" ||
        recipe.handler === "Bacterial Vat" ||
        recipe.handler === "Multiblock Mixer" ||
        recipe.handler === "Fermenter" ||
        recipe.handler === "Fluid Extractor" ||
        recipe.handler === "Fluid Extractor Recycling" ||
        recipe.handler === "Electrolyzer" ||
        recipe.handler === "Fluid Canner" ||
        recipe.handler === "Compressor" ||
        recipe.handler === "Rock Breaker" ? (
        <MachineRecipeLayout recipe={recipe} onBrowse={onBrowse} />
      ) : positioned ? (
        <div
          className="recipe-layout"
          style={{
            width: layout.width! * 2,
            height: layout.height! * 2,
            backgroundImage: layout.background
              ? `url("${layout.background}")`
              : undefined,
          }}
        >
          <CategorySymbol
            className="positioned-category-symbol"
            recipe={recipe}
            onBrowse={onBrowse}
          >
            <span aria-hidden="true" />
          </CategorySymbol>
          {recipe.ingredients.map((i, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: i.x! * 2 - 2,
                top: i.y! * 2 - 2,
              }}
            >
              <ItemSlot item={i.item} amount={i.amount} onBrowse={onBrowse} />
            </div>
          ))}
        </div>
      ) : (
        <div className="recipe-process">
          {(["input", "output"] as const).map((direction) => (
            <div className="recipe-slot-side" key={direction}>
              {direction === "output" && (
                <CategorySymbol
                  className="recipe-arrow"
                  recipe={recipe}
                  onBrowse={onBrowse}
                >
                  ⟶
                </CategorySymbol>
              )}
              <div className="recipe-slot-groups">
                {recipeSlotGroups(
                  recipe.ingredients,
                  direction,
                  layout.slotCounts,
                ).map(
                  ({ kind, slots }) =>
                    slots.length > 0 && (
                      <div
                        className="recipe-slots"
                        key={kind}
                        role="group"
                        aria-label={`${kind === "fluid" ? "Fluid" : "Item"} ${direction} slots`}
                        style={
                          layout.slotCounts
                            ? {
                                gridTemplateColumns: `repeat(${Math.min(slots.length, 3)}, 36px)`,
                              }
                            : undefined
                        }
                      >
                        {slots.map((ingredient, index) =>
                          ingredient ? (
                            <ItemSlot
                              key={index}
                              item={ingredient.item}
                              amount={ingredient.amount}
                              onBrowse={onBrowse}
                            />
                          ) : (
                            <span
                              key={index}
                              className={`item-slot empty-recipe-slot ${kind === "fluid" ? "empty-fluid-slot" : ""}`}
                              role="img"
                              aria-label={`Empty ${kind} ${direction} slot`}
                              title={`Empty ${kind} ${direction} slot`}
                            />
                          ),
                        )}
                      </div>
                    ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="recipe-footer">
        <div className="recipe-stats">
          {recipe.euPerTick > 0 && (
            <>
              {recipe.durationTicks > 0 && (
                <div className="recipe-stat-row">
                  <strong>Total:</strong>{" "}
                  <span
                    className={reference ? "recipe-updated-stat" : undefined}
                    style={reference ? { color: tierColors.MV } : undefined}
                  >
                    {(recipe.euPerTick * recipe.durationTicks).toLocaleString()}{" "}
                    EU
                  </span>
                  {reference && (
                    <span className="recipe-default-stat">
                      {" "}
                      (
                      {(
                        reference.euPerTick * reference.durationTicks
                      ).toLocaleString()}{" "}
                      EU)
                    </span>
                  )}
                </div>
              )}
              <div className="recipe-stat-row">
                {power.voltage && (
                  <>
                    <strong>Voltage:</strong>{" "}
                    <span
                      className={reference ? "recipe-updated-stat" : undefined}
                      style={reference ? { color: tierColors.MV } : undefined}
                    >
                      <TierText
                        text={power.voltage.replace(/^Voltage: /, "")}
                      />
                    </span>
                  </>
                )}
                {reference && (
                  <span className="recipe-default-stat">
                    {" "}
                    (
                    <TierText
                      text={
                        recipePowerInfo(reference).voltage?.replace(
                          /^Voltage: /,
                          "",
                        ) ?? ""
                      }
                    />
                    )
                  </span>
                )}
              </div>
              {power.amperage && <div>{power.amperage}</div>}
            </>
          )}
          {recipe.durationTicks !== 0 && (
            <div className="recipe-stat-row">
              <strong>Time:</strong>{" "}
              <span
                className={reference ? "recipe-updated-stat" : undefined}
                style={reference ? { color: tierColors.MV } : undefined}
              >
                {recipe.durationTicks > 0
                  ? `${recipe.durationTicks / 20} secs`
                  : "Invalid runtime duration"}
              </span>
              {reference && (
                <span className="recipe-default-stat">
                  {" "}
                  ({reference.durationTicks / 20} secs)
                </span>
              )}
            </div>
          )}
          {power.details.map((d, i) => (
            <div key={i}>
              <TierText text={d} />
            </div>
          ))}
        </div>
        {footerControl}
      </div>
      {children}
    </div>
  );
}

function InfernalBlastFurnaceLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const input = recipe.ingredients.find((i) => i.direction === "input");
  const outputs = recipe.ingredients.filter((i) => i.direction === "output");
  const slot = (ingredient: typeof input) =>
    ingredient ? (
      <ItemSlot
        item={ingredient.item}
        amount={ingredient.amount}
        onBrowse={onBrowse}
      />
    ) : (
      <span
        className="item-slot empty-recipe-slot"
        role="img"
        aria-label="Empty furnace slot"
      />
    );
  return (
    <div className="infernal-furnace-layout">
      <div className="infernal-furnace-input">{slot(input)}</div>
      <CategorySymbol
        className="infernal-furnace-art"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <span aria-hidden="true" />
      </CategorySymbol>
      <div className="infernal-furnace-output">{slot(outputs[0])}</div>
      <div
        className="infernal-furnace-bonus"
        role="group"
        aria-label="Bonus output"
      >
        {slot(outputs[1])}
      </div>
    </div>
  );
}

function SingleInputMachineLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const mold = recipe.ingredients.find(
    (i) => i.direction === "input" && i.item.kind !== "fluid",
  );
  const output = recipe.ingredients.find((i) => i.direction === "output");
  const fluids = recipe.ingredients.filter(
    (i) => i.direction === "input" && i.item.kind === "fluid",
  );
  return (
    <div className="fluid-solidifier-layout">
      {([mold, output] as const).map((ingredient, index) => (
        <div
          className={`fluid-solidifier-${index === 0 ? "mold" : "output"}`}
          key={index}
        >
          {ingredient ? (
            <>
              <ItemSlot
                item={ingredient.item}
                amount={ingredient.amount}
                onBrowse={onBrowse}
              />
              {!ingredient.consumed && (
                <span className="tic-extruding-nc" aria-label="Not consumed">
                  NC
                </span>
              )}
            </>
          ) : (
            <span
              className="item-slot empty-recipe-slot"
              role="img"
              aria-label={`Empty ${index === 0 ? "input" : "output"} slot`}
            />
          )}
        </div>
      ))}
      <CategorySymbol
        className="fluid-solidifier-progress blast-furnace-progress"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <span aria-hidden="true" />
      </CategorySymbol>
      {fluids.length > 0 && (
        <div
          className="fluid-solidifier-fluids"
          role="group"
          aria-label="Required fluid inputs"
        >
          {fluids.map((fluid) => (
            <ItemSlot
              key={`${fluid.slot}:${fluid.itemId}`}
              item={fluid.item}
              amount={fluid.amount}
              onBrowse={onBrowse}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FurnaceGridLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const bricked = recipe.handler === "Bricked Blast Furnace";
  const arcRecycling = recipe.handler === "Arc Furnace Recycling";
  const macerator = recipe.handler === "Macerator Recycling";
  const counts = {
    itemInputs: arcRecycling || macerator ? 1 : bricked ? 3 : 6,
    itemOutputs: macerator ? 4 : arcRecycling ? 9 : bricked ? 3 : 6,
    fluidInputs: bricked || macerator ? 0 : 1,
    fluidOutputs: bricked || arcRecycling || macerator ? 0 : 1,
  };
  const groups = (direction: "input" | "output") =>
    recipeSlotGroups(recipe.ingredients, direction, counts)
      .filter((group) => group.slots.length)
      .map((group) => {
        if (!bricked || group.kind !== "item") return group;
        // The primitive furnace reserves the last slot for fuel / its byproduct.
        const occupied = group.slots.filter((i) => i !== null);
        return occupied.length === 2
          ? { ...group, slots: [occupied[0], null, occupied[1]] }
          : group;
      });
  return (
    <div
      className={`blast-furnace-layout${bricked ? " bricked-blast-furnace-layout" : ""}${arcRecycling ? " arc-recycling-layout" : ""}${macerator ? " macerator-recycling-layout" : ""}`}
    >
      {(["input", "output"] as const).map((direction) => (
        <div className={`blast-furnace-${direction}`} key={direction}>
          {groups(direction).map(({ kind, slots }) => (
            <div
              className={`blast-furnace-${kind}-slots`}
              role="group"
              aria-label={`${recipe.handler} ${kind} ${direction} slots`}
              key={kind}
            >
              {slots.map((ingredient, index) => (
                <div className="blast-furnace-slot" key={index}>
                  {ingredient ? (
                    <ItemSlot
                      item={ingredient.item}
                      amount={ingredient.amount}
                      onBrowse={onBrowse}
                    />
                  ) : (
                    <span
                      className="item-slot empty-recipe-slot"
                      role="img"
                      aria-label={`Empty ${kind} ${direction} slot`}
                    />
                  )}
                  {ingredient &&
                    direction === "output" &&
                    ingredient.chance < 1 && (
                      <span
                        className="blast-furnace-chance"
                        aria-label={`${ingredient.chance * 100}% chance`}
                      >
                        {Number((ingredient.chance * 100).toFixed(2))}%
                      </span>
                    )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <CategorySymbol
        className="blast-furnace-progress"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <span aria-hidden="true" />
      </CategorySymbol>
    </div>
  );
}

function TwoInputMachineLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const counts = {
    itemInputs: 2,
    itemOutputs: 1,
    fluidInputs: 0,
    fluidOutputs: 0,
  };
  return (
    <div
      className={`tic-extruding-layout${recipe.handler === "Extruder" ? " extruder-layout" : ""}${recipe.handler === "Alloy Smelter Molding" || recipe.handler === "Alloy Smelter Recycling" ? " alloy-molding-layout" : ""}`}
    >
      {(["input", "output"] as const).map((direction) => (
        <div
          className={`tic-extruding-${direction}`}
          role="group"
          aria-label={`${recipe.handler} ${direction} slots`}
          key={direction}
        >
          {recipeSlotGroups(recipe.ingredients, direction, counts)
            .flatMap(({ slots }) => slots)
            .map((ingredient, index) => (
              <div className="tic-extruding-slot" key={index}>
                {ingredient ? (
                  <>
                    <ItemSlot
                      item={ingredient.item}
                      amount={ingredient.amount}
                      onBrowse={onBrowse}
                    />
                    {!ingredient.consumed && (
                      <span
                        className="tic-extruding-nc"
                        aria-label="Not consumed"
                      >
                        NC
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className="item-slot empty-recipe-slot"
                    role="img"
                    aria-label={`Empty ${direction} slot`}
                  />
                )}
              </div>
            ))}
        </div>
      ))}
      <CategorySymbol
        className="tic-extruding-progress"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <span aria-hidden="true" />
      </CategorySymbol>
    </div>
  );
}

function CastingTableLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const cast = recipe.ingredients.find(
    (i) => i.direction === "input" && i.item.kind !== "fluid",
  );
  const fluid = recipe.ingredients.find(
    (i) => i.direction === "input" && i.item.kind === "fluid",
  );
  const output = recipe.ingredients.find((i) => i.direction === "output");
  return (
    <div className="casting-table-layout">
      <span className="casting-table-art" aria-hidden="true" />
      {fluid && (
        <button
          className={`casting-table-flow nodrag${cast ? "" : " without-cast"}`}
          aria-label={`${fluid.item.name}: ${fluid.amount} L`}
          style={{
            backgroundImage: fluid.item.image
              ? `url(${JSON.stringify(fluid.item.image)})`
              : undefined,
          }}
          onClick={() => onBrowse?.(fluid.item, "recipes")}
          onContextMenu={(event) => {
            event.preventDefault();
            onBrowse?.(fluid.item, "uses");
          }}
        >
          <ItemTooltip>
            <strong>{fluid.item.name}</strong>
            <span>{fluid.amount} L</span>
          </ItemTooltip>
        </button>
      )}
      {cast && (
        <div className="casting-table-cast">
          <ItemSlot item={cast.item} amount={cast.amount} onBrowse={onBrowse} />
        </div>
      )}
      <CategorySymbol
        className="casting-table-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <span aria-hidden="true" />
      </CategorySymbol>
      <div className="casting-table-output">
        {output ? (
          <ItemSlot
            item={output.item}
            amount={output.amount}
            onBrowse={onBrowse}
          />
        ) : (
          <span
            className="item-slot empty-recipe-slot"
            aria-label="Empty casting output"
          />
        )}
      </div>
    </div>
  );
}

function SmeltingLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const input = recipe.ingredients.find((i) => i.direction === "input");
  const output = recipe.ingredients.find((i) => i.direction === "output");
  return (
    <div className="smelting-layout">
      <div className="smelting-input" role="group" aria-label="Smelting input">
        {input ? (
          <ItemSlot
            item={input.item}
            amount={input.amount}
            onBrowse={onBrowse}
          />
        ) : (
          <span className="item-slot empty-recipe-slot" />
        )}
      </div>
      <img
        className="smelting-flames"
        src="/ui/smelting-flames.svg"
        alt=""
        aria-hidden="true"
      />
      <div
        className="smelting-fuel"
        role="group"
        aria-label="Example furnace fuel"
      >
        {recipe.smeltingFuel ? (
          <ItemSlot item={recipe.smeltingFuel} onBrowse={onBrowse} />
        ) : (
          <span className="item-slot empty-recipe-slot" />
        )}
      </div>
      <CategorySymbol
        className="smelting-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <svg viewBox="0 0 24 18" aria-hidden="true" shapeRendering="crispEdges">
          <path d="M0 7H14V0L23 9L14 18V11H0Z" fill="#8b8b8b" />
        </svg>
      </CategorySymbol>
      <div
        className="smelting-output"
        role="group"
        aria-label="Smelting output"
      >
        {output ? (
          <ItemSlot
            item={output.item}
            amount={output.amount}
            onBrowse={onBrowse}
          />
        ) : (
          <span className="item-slot empty-recipe-slot" />
        )}
      </div>
    </div>
  );
}

function CarpenterLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const inputs = recipe.ingredients.filter(
    (i) => i.direction === "input" && i.item.kind !== "fluid",
  );
  const grid = Array.from({ length: 9 }, (_, index) =>
    inputs.find((i) =>
      i.x !== null && i.y !== null
        ? Math.round((i.x - 5) / 18) === index % 3 &&
          Math.round((i.y - 6) / 18) === Math.floor(index / 3)
        : i.slot === Math.floor(index / 3) + (index % 3) * 3,
    ),
  );
  const extra = inputs.find((i) => (i.x !== null ? i.x >= 59 : i.slot >= 9));
  const output = recipe.ingredients.find(
    (i) => i.direction === "output" && i.item.kind !== "fluid",
  );
  const fluid = recipe.ingredients.find(
    (i) => i.direction === "input" && i.item.kind === "fluid",
  );
  const slot = (ingredient: typeof output) =>
    ingredient ? (
      <ItemSlot
        item={ingredient.item}
        amount={ingredient.amount}
        onBrowse={onBrowse}
      />
    ) : (
      <span
        className="item-slot empty-recipe-slot"
        role="img"
        aria-label="Empty Carpenter slot"
      />
    );
  const arrow = (
    <svg viewBox="0 0 24 18" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M0 7H14V0L23 9L14 18V11H0Z" fill="#8b8b8b" />
    </svg>
  );
  return (
    <div className="carpenter-layout">
      <div
        className="carpenter-inputs"
        role="group"
        aria-label="Carpenter crafting inputs"
      >
        {grid.map((ingredient, index) => (
          <div key={index}>{slot(ingredient)}</div>
        ))}
      </div>
      <div className="carpenter-extra">{slot(extra)}</div>
      <div className="carpenter-result">
        {slot(output)}
        <span className="carpenter-meter" aria-hidden="true" />
      </div>
      <div className="carpenter-container-input">{slot(undefined)}</div>
      <div className="carpenter-container-output">{slot(undefined)}</div>
      <CategorySymbol
        className="carpenter-arrow input-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        {arrow}
      </CategorySymbol>
      <CategorySymbol
        className="carpenter-arrow extra-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        {arrow}
      </CategorySymbol>
      <CategorySymbol
        className="carpenter-arrow output-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        {arrow}
      </CategorySymbol>
      <CategorySymbol
        className="carpenter-arrow tank-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        {arrow}
      </CategorySymbol>
      <FluidTank fluid={fluid} onBrowse={onBrowse} />
    </div>
  );
}

function BottlerLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const fluid =
    recipe.bottlerFluid ??
    recipe.ingredients.find(
      (ingredient) =>
        ingredient.direction === "input" && ingredient.item.kind === "fluid",
    );

  return (
    <div className="bottler-layout">
      <FluidTank fluid={fluid} onBrowse={onBrowse} />
      <CategorySymbol
        className="bottler-arrow"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <svg viewBox="0 0 24 18" aria-hidden="true" shapeRendering="crispEdges">
          <path d="M0 7H14V0L23 9L14 18V11H0Z" fill="#8b8b8b" />
        </svg>
      </CategorySymbol>
      <div className="bottler-containers">
        {(["input", "output"] as const).map((direction) => {
          const items = recipe.ingredients.filter(
            (ingredient) =>
              ingredient.direction === direction &&
              ingredient.item.kind !== "fluid",
          );
          return (
            <div
              className={`bottler-${direction}`}
              role="group"
              aria-label={`Bottler item ${direction}`}
              key={direction}
            >
              {items.length ? (
                items.map((ingredient) => (
                  <ItemSlot
                    key={ingredient.slot}
                    item={ingredient.item}
                    amount={ingredient.amount}
                    onBrowse={onBrowse}
                  />
                ))
              ) : (
                <span
                  className="item-slot empty-recipe-slot"
                  role="img"
                  aria-label={`Empty ${direction} slot`}
                />
              )}
            </div>
          );
        })}
        <svg
          className="bottler-funnel"
          viewBox="0 0 36 26"
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          <path d="M2 2H34L23 24H13Z" fill="#8b8b8b" />
          <path d="M1 1H35M2 3L13 25" fill="none" stroke="#373737" />
          <path d="M35 3L24 25H13" fill="none" stroke="#fff" />
        </svg>
      </div>
    </div>
  );
}

function DistillationTowerLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const counts = {
    itemInputs: 2,
    itemOutputs: 1,
    fluidInputs: 1,
    fluidOutputs: 11,
  };
  const outputs = recipeSlotGroups(recipe.ingredients, "output", counts);
  const slots = [...outputs[0].slots, ...outputs[1].slots];
  return (
    <div className="distillation-tower-layout">
      <div className="tower-inputs">
        {recipeSlotGroups(recipe.ingredients, "input", counts).map(
          ({ kind, slots }) => (
            <div
              className={`tower-${kind}-inputs`}
              role="group"
              aria-label={`Distillation Tower ${kind} inputs`}
              key={kind}
            >
              {slots.map((ingredient, index) =>
                ingredient ? (
                  <ItemSlot
                    key={index}
                    item={ingredient.item}
                    amount={ingredient.amount}
                    onBrowse={onBrowse}
                  />
                ) : (
                  <span
                    key={index}
                    className="item-slot empty-recipe-slot"
                    role="img"
                    aria-label={`Empty ${kind} input slot`}
                  />
                ),
              )}
            </div>
          ),
        )}
      </div>
      <CategorySymbol
        className="tower-progress"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <img src="/ui/distillery-progress.svg" alt="" aria-hidden="true" />
      </CategorySymbol>
      <div
        className="tower-outputs"
        role="group"
        aria-label="Distillation Tower outputs"
      >
        {slots.map((ingredient, index) => (
          <div
            className={`tower-output-slot${index === 0 ? " item-output" : " fluid-output"}${ingredient ? " occupied" : ""}`}
            style={{
              gridColumn: (index % 3) + 1,
              gridRow: Math.ceil(slots.length / 3) - Math.floor(index / 3),
            }}
            key={index}
          >
            {ingredient ? (
              <ItemSlot
                item={ingredient.item}
                amount={ingredient.amount}
                onBrowse={onBrowse}
              />
            ) : (
              <span
                className="item-slot empty-recipe-slot"
                role="img"
                aria-label={`Empty output slot ${index}`}
              />
            )}
            <span className="tower-slot-number" aria-hidden="true">
              {index}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MachineRecipeLayout({
  recipe,
  onBrowse,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
}) {
  const circuit = recipe.handler === "Circuit Assembler";
  const press = recipe.handler === "Forming Press";
  const distillery = recipe.handler === "Distillery";
  const chemical = recipe.handler === "Chemical Reactor";
  const largeChemical = recipe.handler === "Large Chemical Reactor";
  const plant = recipe.handler === "Chemical Plant";
  const mixer = recipe.handler === "Mixer";
  const vat = recipe.handler === "Bacterial Vat";
  const multiblockMixer = recipe.handler === "Multiblock Mixer";
  const fermenter = recipe.handler === "Fermenter";
  const canner = recipe.handler === "Fluid Canner";
  const compressor = recipe.handler === "Compressor";
  const rockBreaker = recipe.handler === "Rock Breaker";
  const electrolyzer = recipe.handler === "Electrolyzer";
  const fluidExtractor =
    recipe.handler === "Fluid Extractor" ||
    recipe.handler === "Fluid Extractor Recycling";
  const distilleryItemRows = Math.max(
    1,
    ...(["input", "output"] as const).map(
      (direction) =>
        recipe.ingredients.filter(
          (ingredient) =>
            ingredient.direction === direction &&
            ingredient.item.kind !== "fluid",
        ).length,
    ),
  );
  const counts = {
    itemInputs: fermenter
      ? 0
      : plant
        ? 4
        : largeChemical
          ? 6
          : chemical || rockBreaker || electrolyzer
            ? 2
            : distillery || fluidExtractor || canner || compressor
              ? 1
              : circuit || press || vat
                ? 6
                : 9,
    itemOutputs: fermenter
      ? 0
      : multiblockMixer
        ? 9
        : mixer
          ? 4
          : largeChemical || plant || electrolyzer
            ? 6
            : chemical || vat
              ? 2
              : 1,
    fluidInputs:
      fluidExtractor || rockBreaker
        ? 0
        : plant
          ? 4
          : largeChemical || multiblockMixer
            ? 6
            : 1,
    fluidOutputs: plant
      ? 3
      : largeChemical || multiblockMixer
        ? 6
        : distillery ||
            chemical ||
            mixer ||
            vat ||
            fermenter ||
            fluidExtractor ||
            electrolyzer ||
            canner
          ? 1
          : 0,
  };
  return (
    <div
      className={`assembler-layout${circuit || press ? " circuit-assembler-layout" : ""}${press ? " forming-press-layout" : ""}${distillery ? " distillery-layout" : ""}${chemical ? " chemical-reactor-layout" : ""}${largeChemical || multiblockMixer ? " large-chemical-reactor-layout" : ""}${multiblockMixer ? " multiblock-mixer-layout" : ""}${plant ? " chemical-plant-layout" : ""}${mixer ? " mixer-layout" : ""}${vat ? " bacterial-vat-layout" : ""}${fermenter ? " fermenter-layout" : ""}${fluidExtractor ? " fluid-extractor-layout" : ""}${canner ? " fluid-canner-layout" : ""}${compressor ? " compressor-layout" : ""}${rockBreaker ? " rock-breaker-layout" : ""}${electrolyzer ? " electrolyzer-layout" : ""}`}
    >
      {(["input", "output"] as const).map((direction) => (
        <div className={`assembler-${direction}`} key={direction}>
          {recipeSlotGroups(recipe.ingredients, direction, counts).map(
            ({ kind, slots }) =>
              slots.length > 0 && (
                <div
                  className={`assembler-${kind}-slots`}
                  style={
                    distillery && kind === "item"
                      ? { minHeight: distilleryItemRows * 36 }
                      : undefined
                  }
                  role="group"
                  aria-label={`${recipe.handler} ${kind} ${direction} slots`}
                  key={kind}
                >
                  {slots.map((ingredient, index) => (
                    <div className={`assembler-slot ${kind}`} key={index}>
                      {ingredient ? (
                        <ItemSlot
                          item={ingredient.item}
                          amount={ingredient.amount}
                          onBrowse={onBrowse}
                        />
                      ) : (
                        <span
                          className="item-slot empty-recipe-slot"
                          role="img"
                          aria-label={`Empty ${recipe.handler} ${kind} ${direction} slot`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ),
          )}
          {vat && direction === "output" && (
            <span
              className="item-slot empty-recipe-slot vat-culture-slot"
              role="img"
              aria-label="Culture slot (culture data unavailable)"
            />
          )}
        </div>
      ))}
      <CategorySymbol
        className="assembler-progress"
        recipe={recipe}
        onBrowse={onBrowse}
      >
        <img
          src={
            canner
              ? "/ui/fluid-canner-progress.svg"
              : fluidExtractor || electrolyzer
                ? "/ui/fluid-extractor-progress.svg"
                : plant || mixer || multiblockMixer
                  ? "/ui/chemical-plant-progress.svg"
                  : distillery || chemical || largeChemical || vat || fermenter
                    ? "/ui/distillery-progress.svg"
                    : press
                      ? "/ui/forming-press-progress.svg"
                      : circuit
                        ? "/ui/circuit-assembler-progress.svg"
                        : "/ui/assembler-progress.svg"
          }
          alt=""
          aria-hidden="true"
        />
      </CategorySymbol>
    </div>
  );
}

function CategorySymbol({
  recipe,
  onBrowse,
  className,
  children,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className + " recipe-category-symbol nodrag"}
      aria-label={"Show all " + recipe.handler + " recipes"}
      onClick={(event) => {
        event.stopPropagation();
        onBrowse?.(
          {
            id: recipe.handler,
            name: recipe.handler,
            registryId: "",
            metadata: 0,
            mod: "",
            group: "",
            tooltip: "[]",
            image: null,
            kind: "category",
          },
          "category",
          recipe.id,
        );
      }}
    >
      {children}
      <ItemTooltip compact followPointer placement="top-right">
        <strong style={{ color: "#fff" }}>Recipes</strong>
      </ItemTooltip>
    </button>
  );
}

function FluidTank({
  fluid,
  onBrowse,
}: {
  fluid?: { item: Item; amount: number };
  onBrowse?: Browse;
}) {
  const fill = fluid
    ? Math.min(100, Math.max(0, (fluid.amount / 10000) * 100))
    : 0;
  return (
    <button
      className="bottler-tank nodrag"
      disabled={!fluid}
      aria-label={
        fluid
          ? `${fluid.item.name}: ${fluid.amount} L`
          : "Tank (fluid data unavailable)"
      }
      onClick={() => fluid && onBrowse?.(fluid.item, "recipes")}
      onContextMenu={(event) => {
        event.preventDefault();
        if (fluid) onBrowse?.(fluid.item, "uses");
      }}
    >
      <span className="bottler-tank-fill" style={{ height: `${fill}%` }}>
        <span
          className="bottler-tank-texture"
          style={{
            backgroundImage: fluid?.item.image
              ? `url(${JSON.stringify(fluid.item.image)})`
              : undefined,
          }}
        />
      </span>
      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className={`bottler-tank-mark${index === 4 ? " major" : ""}`}
          style={{ bottom: `${(index + 1) * 10}%` }}
          aria-hidden="true"
        />
      ))}
      {fluid && (
        <ItemTooltip>
          <strong>{fluid.item.name}</strong>
          <span>{fluid.amount} L</span>
        </ItemTooltip>
      )}
    </button>
  );
}
