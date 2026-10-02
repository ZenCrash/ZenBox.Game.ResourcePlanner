"use client";
import { useEffect, useId, useRef, useState } from 'react';
import type { Item, Recipe } from '@/lib/model';
import { multiblockOptions, multiblockSetup, type MultiblockConfig } from '@/lib/multiblock';
import { MachineItemTooltip } from './machine-selector';
import { MinecraftText } from './minecraft-text';

function PartSelector({ label, selected, amount, options, describe, onSelect, onAmountChange }: {
  label: string; selected: Item; amount: number; options: Item[];
  describe: (item: Item) => string; onSelect: (id: string) => void;
  onAmountChange?: (amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const amountId = useId();
  const [draft, setDraft] = useState(String(amount));
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) { amountInput.current?.blur(); setOpen(false); } };
    document.addEventListener('pointerdown', dismiss, true);
    if (amountInput.current) { amountInput.current.focus(); amountInput.current.select(); }
    else anchor.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open]);
  return <div className="multiblock-part-row" ref={anchor} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); amountInput.current?.blur(); setOpen(false); trigger.current?.focus(); }
    if (event.target instanceof HTMLInputElement) return;
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const buttons = Array.from(anchor.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <div className="machine-selector-anchor">
      <button ref={trigger} type="button" className="item-slot machine-selector" aria-label={`${label}: ${selected.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setDraft(String(amount)); setOpen(!open); }}>
        <span className="item-art">{selected.image ? <img src={selected.image} alt="" /> : '?'}<MachineItemTooltip item={selected} /></span>
        <span className="stack-count">{amount}</span>
      </button>
      {open && <div className="machine-selector-menu multiblock-parts-menu nowheel" role="menu" aria-label={label}>
        {onAmountChange && <div className="machine-selector-amount">
          <label htmlFor={amountId}>Hatch amount</label>
          <span className="machine-selector-amount-field"><input id={amountId} ref={amountInput} type="number" min={1} max={2} step={1} value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
            onBlur={() => { const next = /^\d+$/.test(draft) ? Math.max(1, Math.min(2, Number(draft))) : amount; setDraft(String(next)); if (next !== amount) onAmountChange(next); }} /></span>
        </div>}
        {options.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === selected.id} onClick={() => { onSelect(item.id); setOpen(false); trigger.current?.focus(); }}>
          <span className="machine-option-icon">{item.image ? <img src={item.image} alt="" /> : '?'}<MachineItemTooltip item={item} /></span>
          <span className="machine-option-description"><span><MinecraftText text={item.name} /></span>{describe(item) && <span className="machine-option-voltage">{describe(item)}</span>}</span>
        </button>)}
      </div>}
    </div>
    {describe(selected) && <span className="multiblock-part-description">{describe(selected)}</span>}
  </div>;
}

export function MultiblockControls({ recipe, machineId, value, onChange }: {
  recipe: Recipe; machineId?: string; value?: MultiblockConfig; onChange: (config: MultiblockConfig) => void;
}) {
  const setup = multiblockSetup(recipe, machineId, value);
  if (!setup) return null;
  const { coils, hatches } = multiblockOptions(recipe);
  const config: MultiblockConfig = { coilId: setup.coil?.id, energyHatchId: setup.hatch.id, energyHatches: setup.count };
  const coilDescription = (item: Item) => {
    const next = multiblockSetup(recipe, machineId, { ...config, coilId: item.id })!;
    if (next.profile.kind === 'blast' && next.error?.startsWith('Requires') && next.error.includes(' K')) return `${next.heat.toLocaleString()} K · insufficient heat for this recipe`;
    if (next.discount >= 1 && next.perfect === 0 && next.timeMultiplier >= 1) return '';
    if (next.profile.kind === 'blast') return `${next.heat.toLocaleString()} K · ${Number(((1 - next.discount) * 100).toFixed(2))}% EU discount · ${next.perfect} perfect overclock${next.perfect === 1 ? '' : 's'}`;
    if (next.profile.kind === 'pyrolyse') return `${Number((1 / next.timeMultiplier).toFixed(2))}× recipe speed`;
    return `${Number(((1 - next.discount) * 100).toFixed(2))}% EU discount`;
  };
  const energyDescription = (item: Item) => {
    const next = multiblockSetup(recipe, machineId, { ...config, energyHatchId: item.id })!;
    return `${next.tier} · ${next.available.toLocaleString()} EU/t available · ${next.amps} A for processing`;
  };
  return <div className="multiblock-controls nodrag nopan" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    {setup.coil && <PartSelector label={`${setup.profile.coils} matching coils`} selected={setup.coil} amount={setup.profile.coils} options={coils} describe={coilDescription} onSelect={coilId => onChange({ ...config, coilId })} />}
    <PartSelector label="Energy hatches" selected={setup.hatch} amount={setup.count} options={hatches} describe={energyDescription} onSelect={energyHatchId => onChange({ ...config, energyHatchId })} onAmountChange={energyHatches => onChange({ ...config, energyHatches })} />
    {!setup.error && <span>Usage: {setup.euPerTick.toLocaleString()} EU/t · {(setup.euPerTick / setup.voltage).toLocaleString(undefined, { maximumFractionDigits: 3 })} A required</span>}
    {setup.error && <span className="multiblock-error" role="status">{setup.error}</span>}
  </div>;
}
