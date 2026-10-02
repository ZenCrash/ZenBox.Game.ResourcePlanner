import type { Recipe } from "./model";
import { isCombustionFuelHandler } from "./recipe-handlers";

const tiers = [
  "ULV",
  "LV",
  "MV",
  "HV",
  "EV",
  "IV",
  "LuV",
  "ZPM",
  "UV",
  "UHV",
  "UEV",
  "UIV",
  "UMV",
  "UXV",
  "MAX",
];

// Base capacities from GTNH 2.8.4 HeatingCoilLevel / coil block tooltips.
const heatingCoils: [number, string][] = [
  [1801, 'Cupronickel'], [2701, 'Kanthal'], [3601, 'Nichrome'],
  [4501, 'TPV-Alloy'], [5401, 'HSS-G'], [6301, 'HSS-S'],
  [7201, 'Naquadah'], [8101, 'Naquadah Alloy'], [9001, 'Trinium'],
  [9901, 'Electrum Flux'], [10801, 'Awakened Draconium'],
  [11701, 'Infinity'], [12601, 'Hypogen'], [13501, 'Eternal'],
];

export function recipePowerInfo(
  recipe: Pick<Recipe, "euPerTick" | "details"> &
    Partial<Pick<Recipe, "handler">>,
) {
  let details: string[] = [];
  try {
    const parsed: unknown = JSON.parse(recipe.details);
    if (Array.isArray(parsed))
      details = parsed.filter(
        (line): line is string => typeof line === "string",
      );
  } catch {}
  if (recipe.handler === 'Blast Furnace' || recipe.handler === 'Electric Blast Furnace')
    details = details.map(line => line.replace(/^Special value:\s*([\d,]+)$/i, (_, value: string) => {
      const heat = Number(value.replaceAll(',', ''));
      const coil = heatingCoils.find(([capacity]) => capacity >= heat)?.[1];
      return `Heat Capacity: ${heat.toLocaleString('de-DE')} K${coil ? ` (${coil})` : ''}`;
    }));
  if (isCombustionFuelHandler(recipe.handler ?? "") || recipe.handler === "Acid Generator" || recipe.handler === "Semifluid Generator Fuels" || recipe.handler === "Gas Turbine Fuel")
    details = details.map((line) =>
      line.replace(/^Special value:\s*([\d,]+(?:\.\d+)?)$/i, (_, value: string) =>
        `Fuel Value: ${(Number(value.replaceAll(",", "")) * 1000).toLocaleString("en-US")} EU`,
      ),
    );
  if (recipe.handler?.startsWith("Magic Energy Absorber Fu"))
    details = details.map((line) =>
      line.replace(/^Special value:\s*(.+)$/i, "Fuel Value: $1 EU"),
    );
  const amperage = details.find((line) => /^Amperage:/i.test(line));
  const recordedVoltage = details.find((line) => /^Voltage:/i.test(line));
  const amps =
    Number(
      amperage?.match(/^Amperage:\s*([\d,]+)\s*A/i)?.[1].replaceAll(",", ""),
    ) || 1;
  const voltage = Math.trunc(recipe.euPerTick / amps);
  const tier = tiers.find((_, index) => voltage <= 8 * 4 ** index);
  return {
    voltage:
      recipe.euPerTick > 0
        ? (recordedVoltage ??
          `Voltage: ${voltage.toLocaleString("en-US")} EU/t${tier ? ` (${tier})` : ""}`)
        : undefined,
    amperage: recipe.euPerTick > 0 ? amperage : undefined,
    details: details.filter(
      (line) => !/^(Voltage|Usage|Amperage):/i.test(line),
    ),
  };
}
