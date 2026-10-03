"use client";
import { useEffect, useId, useRef, useState } from 'react';
import type { Item, Recipe } from '@/lib/model';
import { multiblockOptions, multiblockSetup, multiblockHatchLimits, type MultiblockConfig } from '@/lib/multiblock';
import { MachineItemTooltip } from './machine-selector';
import { MinecraftText } from './minecraft-text';
import { RecipeChevron } from './recipe-chevron';

function PartSelector({ label, selected, defaultId, amount, options, describe, showDescription = true, minAmount = 1, maxAmount = 2, onSelect, onAmountChange }: {
  label: string; selected: Item; amount: number; options: Item[];
  defaultId?: string;
  showDescription?: boolean;
  minAmount?: number; maxAmount?: number;
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
    <div className="machine-count-controls">
    <div className="machine-selector-anchor">
      <button ref={trigger} type="button" className="item-slot machine-selector" aria-label={`${label}: ${selected.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setDraft(String(amount)); setOpen(!open); }}>
        <span className="item-art">{selected.image ? <img src={selected.image} alt="" /> : '?'}<MachineItemTooltip item={selected} /></span>
        {amount > 1 && <span className="stack-count">{amount}</span>}
      </button>
      {open && <div className="machine-selector-menu multiblock-parts-menu nowheel" role="menu" aria-label={label}>
        {onAmountChange && <div className="machine-selector-amount">
          <label htmlFor={amountId}>Hatch amount</label>
          <span className="machine-selector-amount-field"><input id={amountId} ref={amountInput} type="number" min={minAmount} max={maxAmount} step={1} value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
            onBlur={() => { const next = /^\d+$/.test(draft) ? Math.max(minAmount, Math.min(maxAmount, Number(draft))) : amount; setDraft(String(next)); if (next !== amount) onAmountChange(next); }} /></span>
        </div>}
        {options.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === selected.id} onClick={() => { onSelect(item.id); setOpen(false); trigger.current?.focus(); }}>
          <span className="machine-option-icon">{item.image ? <img src={item.image} alt="" /> : '?'}<MachineItemTooltip item={item} /></span>
          <span className="machine-option-description"><span><MinecraftText text={item.name} />{item.id === defaultId && <> <span className="machine-default">(default)</span></>}</span>{describe(item) && <span className="machine-option-voltage">{describe(item)}</span>}</span>
        </button>)}
      </div>}
    </div>
    {onAmountChange && <div className="machine-count-stepper nopan">
      <button type="button" className="recipe-nav-button" aria-label="Increase hatch amount" title="Increase hatch amount" disabled={amount >= maxAmount}
        onClick={() => { const next = Math.min(maxAmount, amount + 1); setDraft(String(next)); setOpen(false); onAmountChange(next); }}>
        <RecipeChevron direction="up" />
      </button>
      <button type="button" className="recipe-nav-button" aria-label="Decrease hatch amount" title="Decrease hatch amount" disabled={amount <= minAmount}
        onClick={() => { if (amount > minAmount) { const next = amount - 1; setDraft(String(next)); setOpen(false); onAmountChange(next); } }}>
        <RecipeChevron direction="down" />
      </button>
    </div>}
    </div>
    {showDescription && describe(selected) && <span className="multiblock-part-description">{describe(selected)}</span>}
  </div>;
}

export function MultiblockControls({ recipe, machineId, value, onChange }: {
  recipe: Recipe; machineId?: string; value?: MultiblockConfig; onChange: (config: MultiblockConfig) => void;
}) {
  const setup = multiblockSetup(recipe, machineId, value);
  if (!setup) return null;
  const defaults = multiblockSetup(recipe, machineId);
  const { coils, hatches } = multiblockOptions(recipe, machineId);
  const limits = multiblockHatchLimits(recipe, machineId);
  const config: MultiblockConfig = { coilId: setup.coil?.id, energyHatchId: setup.hatch.id, energyHatches: setup.count };
  const coilDescription = (item: Item) => {
    const next = multiblockSetup(recipe, machineId, { ...config, coilId: item.id })!;
    const displayedHeat = Math.max(0, next.heat - 1).toLocaleString();
    if ((next.profile.kind === 'blast' || next.profile.kind === 'volcanus') && next.error?.startsWith('Requires') && next.error.includes(' K')) return `${displayedHeat} K · insufficient heat for this recipe`;
    if (next.discount >= 1 && next.perfect === 0 && next.timeMultiplier >= 1) return '';
    if (next.profile.kind === 'blast' || next.profile.kind === 'volcanus') return `${displayedHeat} K · ${Number(((1 - next.discount) * 100).toFixed(2))}% EU discount`;
    if (next.profile.kind === 'pyrolyse') return `${Number((1 / next.timeMultiplier).toFixed(2))}× recipe speed`;
    return `${Number(((1 - next.discount) * 100).toFixed(2))}% EU discount`;
  };
  const energyDescription = (item: Item) => {
    const next = multiblockSetup(recipe, machineId, { ...config, energyHatchId: item.id })!;
    return `${next.tier} · ${next.available.toLocaleString()} EU/t`;
  };
  return <div className="multiblock-controls nodrag nopan" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    {setup.coil && <PartSelector label={`${setup.profile.coils} matching coils`} selected={setup.coil} defaultId={defaults?.coil?.id} amount={setup.profile.coils} options={coils} describe={coilDescription} onSelect={coilId => onChange({ ...config, coilId })} />}
    <PartSelector label="Energy hatches" selected={setup.hatch} defaultId={defaults?.hatch.id} amount={setup.count} minAmount={limits.min} maxAmount={limits.max} options={hatches} describe={energyDescription} showDescription={false} onSelect={energyHatchId => onChange({ ...config, energyHatchId })} onAmountChange={limits.min === limits.max ? undefined : energyHatches => onChange({ ...config, energyHatches })} />
    {(setup.profile.kind === 'bulk' || setup.profile.kind === 'volcanus') && <div className="multiblock-bonuses">
      <span>{setup.profile.speed}× recipe speed</span>
      {!setup.coil && setup.discount < 1 && <span>{Number(((1 - setup.discount) * 100).toFixed(2))}% EU discount</span>}
      <span>{setup.parallel.toLocaleString()} parallel {setup.parallel === 1 ? 'recipe' : 'recipes'} ({setup.parallelLimit.toLocaleString()} base capacity)</span>
      {setup.profile.kind === 'volcanus' && <span>Blazing Pyrotheum: 10 L/s while running</span>}
    </div>}
    {setup.profile.kind === 'hatch-only' && <span className="multiblock-model-note" role="status">Hatch choices are saved, but do not yet change this machine’s recipe estimates. Its processing rules and structure-dependent limits still need verification.</span>}
    {setup.profile.kind === 'hatch-only' && !limits.verifiedAmountLimit && <span className="multiblock-model-note">Hatch amount currently supports 1–2; this is not a verified structural maximum.</span>}
    {setup.profile.kind !== 'hatch-only' && setup.error && <span className="multiblock-error" role="status">{setup.error}</span>}
  </div>;
}
