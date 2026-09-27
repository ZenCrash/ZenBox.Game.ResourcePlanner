"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Item, Recipe } from "@/lib/model";
import { ItemTooltip } from "./item-tooltip";
import { MinecraftText } from "./minecraft-text";
import {
  machineOptions,
  machineTier,
  machineVoltage,
  selectedMachine,
  tierColors,
} from "@/lib/machine-selection";

export function MachineItemTooltip({ item }: { item: Item }) {
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
      <small>
        {item.registryId}:{item.metadata}
      </small>
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
}: {
  recipe: Recipe;
  machineId?: string;
  amount?: number;
  onAmountChange: (amount: number) => void;
  onSelect: (id: string) => void;
}) {
  const { options, defaultMachine } = machineOptions(recipe);
  const selected = selectedMachine(recipe, machineId);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [amountEmpty, setAmountEmpty] = useState(false);
  const amountInputId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    return () => {
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
            ? `Select machine: ${selected.name}`
            : "No crafting machines available"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setAmountEmpty(false);
          setOpen((value) => !value);
        }}
      >
        <span className="item-art">
          {selected?.image ? (
            <img src={selected.image} alt="" />
          ) : (
            <span className="missing-item">?</span>
          )}
          {selected && <MachineItemTooltip item={selected} />}
        </span>
        {amount !== undefined && amount !== 1 && (
          <span className="stack-count">{amount}</span>
        )}
      </button>
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
            <label htmlFor={amountInputId}>Machine amount</label>
            <span className="machine-selector-amount-field">
            <input
              id={amountInputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={1e9}
              step={1}
              value={amountEmpty ? "" : (amount ?? 1)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if ([".", ",", "e", "E", "+", "-"].includes(event.key))
                  event.preventDefault();
              }}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "") {
                  setAmountEmpty(true);
                  return;
                }
                if (!/^\d+$/.test(value)) return;
                setAmountEmpty(false);
                onAmountChange(Math.max(1, Math.min(1e9, Number(value))));
              }}
              onBlur={() => setAmountEmpty(false)}
            />
            {(amount ?? 1) !== 1 && (
              <button type="button" className="machine-selector-amount-reset"
                aria-label="Reset machine amount" title="Reset machine amount"
                onClick={(event) => {
                  event.stopPropagation();
                  setAmountEmpty(false);
                  onAmountChange(1);
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
