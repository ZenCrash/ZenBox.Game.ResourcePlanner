"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyVariants,
  cycleVariants,
  type VariantSelection,
} from "@/lib/model";
import type { Item, Recipe } from "@/lib/model";
import { MinecraftText } from "./minecraft-text";
import { recipePowerInfo } from "@/lib/recipe-power";
import { recipeSlotGroups, type RecipeSlotCounts } from "@/lib/recipe-slots";
export type Browse = (item: Item, mode: "recipes" | "uses") => void;
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
      {amount !== undefined && (amount !== 1 || item.kind === "fluid") && (
        <span className="stack-count">{amountLabel}</span>
      )}
      <span role="tooltip" className="item-tooltip">
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
      </span>
    </button>
  );
}

export function CyclingRecipe({
  recipe,
  onBrowse,
  onSelect,
  disabled,
  pager,
}: {
  recipe: Recipe;
  onBrowse: Browse;
  onSelect: (variants: VariantSelection) => void;
  disabled: boolean;
  pager?: ReactNode;
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
        onBrowse={onBrowse}
      />
      <p className="variant-hint">
        {paused ? "Variants paused" : "Hold Shift to pause variants"} · Adding a
        recipe locks the displayed items
      </p>
      <button
        className="primary select-recipe"
        disabled={disabled}
        onClick={() => onSelect(variants)}
      >
        Add recipe to diagram
      </button>
    </div>
  );
}
export function RecipeView({
  recipe,
  onBrowse,
  children,
  minHeight,
  belowTitle,
}: {
  recipe: Recipe;
  onBrowse?: Browse;
  children?: ReactNode;
  minHeight?: number;
  belowTitle?: ReactNode;
}) {
  const power = recipePowerInfo(recipe);
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
    <div className="recipe-view" style={{ minHeight }}>
      <div className="recipe-title">{recipe.handler}</div>
      {belowTitle}
      {positioned ? (
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
          {recipe.ingredients.map((i, index) => (
            <div
              key={index}
              style={{ position: "absolute", left: i.x! * 2, top: i.y! * 2 }}
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
                <span className="recipe-arrow">⟶</span>
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
      <div className="recipe-stats">
        {recipe.euPerTick > 0 && (
          <>
            {recipe.durationTicks > 0 && (
              <div>
                Total:{" "}
                {(recipe.euPerTick * recipe.durationTicks).toLocaleString()} EU
              </div>
            )}
            <div>{power.voltage}</div>
            {power.amperage && <div>{power.amperage}</div>}
          </>
        )}
        <div>
          Time:{" "}
          {recipe.durationTicks > 0
            ? `${recipe.durationTicks / 20} secs`
            : recipe.durationTicks < 0
              ? "Invalid runtime duration"
              : "Manual / unspecified"}
        </div>
        {power.details.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      {children}
    </div>
  );
}
