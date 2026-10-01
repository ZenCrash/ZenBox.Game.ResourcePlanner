"use client";
import { useEffect, useState } from "react";
import type { FuelValue } from "@/lib/fuel-values";
const cache = new Map<string, Promise<Record<string, FuelValue>>>();
export function useFuelValues(ids: string[]) {
  const key = JSON.stringify([...new Set(ids)].sort());
  const [result, setResult] = useState<{ key: string; values: Record<string, FuelValue> }>();
  useEffect(() => {
    let active = true;
    if (!cache.has(key)) cache.set(key, ids.length ? fetch("/api/fuel-values", { method: "POST", headers: { "Content-Type": "application/json" }, body: key }).then(async response => {
      if (!response.ok) throw new Error("Fuel values unavailable");
      return response.json();
    }) : Promise.resolve({}));
    cache.get(key)!.then(values => { if (active) setResult({ key, values }); }).catch(() => { cache.delete(key); });
    return () => { active = false; };
  }, [key]);
  return result?.key === key ? result.values : {};
}
