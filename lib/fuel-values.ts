import { catalog } from "./db";
import { fluidLookupAmounts } from "./fluid-containers";
export type FuelValue = { euPerUnit: number; handler: string };
export async function fuelValues(ids: string[]) {
  const rows = await catalog.recipe.findMany({ where: { enabled: true, handler: { in: ["Gas Turbine Fuel", "Combustion Generator Fuels", "Combustion Generator Fue...", "Semifluid Generator Fuels"] } }, include: { ingredients: true } });
  const direct = new Map<string, FuelValue>();
  for (const recipe of rows) {
    let details: unknown;
    try { details = JSON.parse(recipe.details); } catch { continue; }
    if (!Array.isArray(details)) continue;
    const special = details.find((s: unknown) => typeof s === "string" && /^Special value:/i.test(s));
    const value = Number(special?.match(/^Special value:\s*([\d,]+(?:\.\d+)?)$/i)?.[1]?.replaceAll(",", "")) * 1000;
    const inputs = recipe.ingredients.filter(i => i.direction === "input" && i.amount > 0);
    if (!Number.isFinite(value) || value <= 0 || inputs.length !== 1) continue;
    const input = inputs[0], euPerUnit = value / input.amount;
    if (euPerUnit > (direct.get(input.itemId)?.euPerUnit ?? 0)) direct.set(input.itemId, { euPerUnit, handler: recipe.handler });
  }
  const result: Record<string, FuelValue> = {};
  for (const id of ids) {
    const forms = await fluidLookupAmounts(id);
    for (const [form, amount] of Object.entries(forms)) {
      const fuel = direct.get(form);
      if (!fuel) continue;
      const euPerUnit = fuel.euPerUnit * amount;
      if (euPerUnit > (result[id]?.euPerUnit ?? 0)) result[id] = { ...fuel, euPerUnit };
    }
  }
  return result;
}
