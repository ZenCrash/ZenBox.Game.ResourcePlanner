"use client";
import { useContext, useEffect, useState } from 'react';
import type { Item } from '@/lib/model';
import { itemTooltipLines, type TooltipVariants } from '@/lib/item-tooltip-variants';
import { TooltipModifierContext } from './item-tooltip';
import { MinecraftText } from './minecraft-text';
const cache = new Map<string, Promise<TooltipVariants>>();
function load(itemId: string) {
  let request = cache.get(itemId);
  if (!request) {
    request = fetch('/api/items/tooltip?itemId=' + encodeURIComponent(itemId)).then(async response => {
      if (!response.ok) throw new Error('Tooltip lookup failed');
      return await response.json() as TooltipVariants;
    }).catch(() => { cache.delete(itemId); return {}; });
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(itemId, request);
  }
  return request;
}
// Mounted inside the tooltip portal, so catalog rows do not fetch until hovered.
export function ItemTooltipLines({ item }: { item: Item }) {
  const mask = useContext(TooltipModifierContext);
  const [loaded, setLoaded] = useState<{ id: string; variants: TooltipVariants }>();
  useEffect(() => {
    if (!/shift|ctrl|control|hold.*alt|press.*alt/i.test(item.tooltip.replace(/§./g, ''))) return;
    let active = true;
    load(item.id).then(variants => { if (active) setLoaded({ id: item.id, variants }); });
    return () => { active = false; };
  }, [item.id, item.tooltip]);
  return <>{itemTooltipLines(item.tooltip, item.name, loaded?.id === item.id ? loaded.variants : undefined, mask).map((line, index) => <span className="item-tooltip-line" data-tooltip-expanded={mask !== 0 && !!loaded?.variants[String(mask)] || undefined} key={index}><MinecraftText text={line} /></span>)}</>;
}
