"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Item, Recipe } from "@/lib/model";
import { ItemTooltip } from "./item-tooltip";
import { MinecraftText } from "./minecraft-text";
import { useDisplaySettings } from "./display-settings";
import {
  machineOptions,
  machineTier,
  machineVoltage,
  selectedMachine,
  tierColors,
} from "@/lib/machine-selection";

export function MachineItemTooltip({ item }: { item: Item }) {
  const { settings } = useDisplaySettings();
  let lines: string[] = [];
  try {
    const parsed: unknown = JSON.parse(item.tooltip);
    if (Array.isArray(parsed))
      lines = parsed.filter((line): line is string => typeof line === "string");
  } catch {}
  return (
    <ItemTooltip followPointer>
      <strong>
        <MinecraftText text={item.name} />
      </strong>
      {lines
        .filter(
          (line, index) =>
            index !== 0 ||
            line.replace(/§./g, "") !== item.name.replace(/§./g, ""),
        )
        .map((line, index) => (
          <span key={index}>
            <MinecraftText text={line} />
          </span>
        ))}
      {settings.showItemIds && <small>
        {item.registryId}:{item.metadata}
      </small>}
      <em>{item.mod}</em>
    </ItemTooltip>
  );
}

export function MachineSelector({
  recipe,
  machineId,
  amount,
  onAmountChange,
  onSelect,
  originalAmount,
  originalTier,
  readOnly = false,
  decimal = false,
  onClear,
  onReset,
}: {
  recipe: Recipe;
  machineId?: string;
  amount?: number;
  onAmountChange: (amount: number) => void;
  onSelect: (id: string) => void;
  originalAmount?: number;
  originalTier?: string;
  readOnly?: boolean;
  decimal?: boolean;
  onClear?: () => void;
  onReset?: () => void;
}) {
  const { options, defaultMachine } = machineOptions(recipe);
  const selected = selectedMachine(recipe, machineId);
  const emptyTier = decimal && !(amount! > 0) && selected?.id !== defaultMachine?.id && selected ? machineTier(selected) : undefined;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const amountInputId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      ) {
        amountInput.current?.blur();
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        amountInput.current?.blur();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    amountInput.current?.focus();
    const selectionFrame = requestAnimationFrame(() => amountInput.current?.select());
    return () => {
      cancelAnimationFrame(selectionFrame);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <div className="machine-selector-anchor">
      <button
        ref={trigger}
        type="button"
        className="item-slot machine-selector nodrag nopan"
        disabled={!selected}
        aria-label={
          selected
            ? `${readOnly ? "Calculated machine" : decimal ? "Set fixed machine amount and tier" : "Select machine"}: ${selected.name}`
            : "No crafting machines available"
        }
        aria-haspopup={readOnly ? undefined : "menu"}
        aria-readonly={readOnly}
        aria-expanded={open}
        onContextMenu={onReset ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          setAmountDraft(null);
          setOpen(false);
          onReset();
        } : undefined}
        onClick={() => {
          if (readOnly) return;
          setAmountDraft(null);
          setOpen((value) => !value);
        }}
      >
        {(!decimal || amount !== undefined) && <span className="item-art">
          {selected?.image ? (
            <img src={selected.image} alt="" />
          ) : (
            <span className="missing-item">?</span>
          )}
          {selected && <MachineItemTooltip item={selected} />}
        </span>}
        {emptyTier && <span className="scale-empty-tier" style={{ color: tierColors[emptyTier] }}>{emptyTier}</span>}
        {amount !== undefined && (amount !== 1 || decimal || readOnly) && (
          <span className="stack-count">{Number(amount.toFixed(4)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        )}
      </button>
      {originalAmount !== undefined && <span className="scale-original-amount" aria-label={`Original machine amount: ${originalAmount}`}>{originalAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}{originalTier && <> <span className="scale-original-tier"><span className="recipe-tier-parenthesis">(</span><span className="recipe-tier-text" data-tier={originalTier} style={{ color: tierColors[originalTier] }}>{originalTier}</span><span className="recipe-tier-parenthesis">)</span></span></>}</span>}
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Crafting machine"
          className="machine-selector-menu nodrag nopan nowheel"
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement) return;
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const buttons = Array.from(
              menu.current!.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          <div className="machine-selector-amount">
            <label htmlFor={amountInputId}>{decimal ? "Fixed machine amount" : "Machine amount"}</label>
            <span className="machine-selector-amount-field">
            <input
              id={amountInputId}
              ref={amountInput}
              type={decimal ? "text" : "number"}
              inputMode={decimal ? "decimal" : "numeric"}
              min={decimal ? 0 : 1}
              max={1e9}
              step={decimal ? "any" : 1}
              value={amountDraft ?? emptyTier ?? amount ?? (decimal ? 0 : 1)}
              style={emptyTier && amountDraft === null ? { color: tierColors[emptyTier] } : undefined}
              onFocus={() => {
                setAmountDraft(String(amount ?? (decimal ? 0 : 1)));
                requestAnimationFrame(() => amountInput.current?.select());
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                if ((decimal ? ["e", "E", "+", "-"] : [".", ",", "e", "E", "+", "-"]).includes(event.key))
                  event.preventDefault();
              }}
              onChange={(event) => setAmountDraft(event.target.value)}
              onBlur={() => {
                if (amountDraft === null) return;
                const value = amountDraft;
                setAmountDraft(null);
                if (decimal && (value === "" || Number(value) === 0)) { if (amount !== undefined) onClear?.(); return; }
                if (!(decimal ? /^\d*\.?\d+$/ : /^\d+$/).test(value)) return;
                const next = Math.max(decimal ? 0 : 1, Math.min(1e9, Number(value)));
                if (next !== amount) onAmountChange(next);
              }}
            />
            {(decimal ? amount !== undefined : (amount ?? 1) !== 1) && (
              <button type="button" className="machine-selector-amount-reset"
                aria-label={decimal ? "Clear fixed machine amount" : "Reset machine amount"} title={decimal ? "Clear fixed machine amount" : "Reset machine amount"}
                onPointerDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  setAmountDraft(null);
                  if (decimal) onClear?.(); else onAmountChange(1);
                }}>
                <X size={12} aria-hidden="true" />
              </button>
            )}
            </span>
          </div>
          {options.map((item) => {
            const tier = machineTier(item);
            const voltage = machineVoltage(item);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === selected?.id}
                onClick={() => {
                  onSelect(item.id);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span className="machine-option-icon">
                  {item.image ? <img src={item.image} alt="" /> : "?"}
                  <MachineItemTooltip item={item} />
                </span>
                <span className="machine-option-description">
                  <span>
                    {item.name.replace(/§./g, "")}{" "}
                    {item.id === defaultMachine?.id && (
                      <span className="machine-default">(default)</span>
                    )}
                  </span>
                  {voltage !== undefined && (
                    <span className="machine-option-voltage">
                      Voltage IN: {voltage.toLocaleString("en-US")}
                      {tier && (
                        <>
                          {" "}
                          (
                          <span
                            style={{
                              color: tierColors[tier],
                              textShadow:
                                tier === "EV" || tier === "LV"
                                  ? "0.5px 0.5px #333"
                                  : undefined,
                            }}
                          >
                            {tier}
                          </span>
                          )
                        </>
                      )}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
