import type { Item, Recipe } from "./model";
import { recipePowerInfo } from "./recipe-power";

export const machineTiers = [
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
export const tierColors: Record<string, string> = {
  ULV: "#555555",
  LV: "#aaaaaa",
  MV: "#ffaa00",
  HV: "#ffff55",
  EV: "#555555",
  IV: "#ffffff",
  LuV: "#ff55ff",
  ZPM: "#55ffff",
  UV: "#55ff55",
  UHV: "#aa0000",
  UEV: "#aa00aa",
  UIV: "#5555ff",
  UMV: "#ff5555",
};
export function machineTier(item: Item) {
  const text = item.tooltip.replace(/§./g, "");
  const match =
    text.match(/Voltage IN:[^"\n]*?\((\w+)\)/i)?.[1] ??
    item.name
      .replace(/§./g, "")
      .match(
        /\b(ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\b/i,
      )?.[1];
  return machineTiers.find(
    (tier) => tier.toLowerCase() === match?.toLowerCase(),
  );
}
export function machineVoltage(item: Item): number | undefined {
  const recorded = item.tooltip
    .replace(/§./g, "")
    .match(/Voltage IN:\s*([\d,]+)/i)?.[1];
  if (recorded) return Number(recorded.replaceAll(",", ""));
  const tier = machineTier(item);
  return tier ? 8 * 4 ** machineTiers.indexOf(tier) : undefined;
}
export function machineOptions(recipe: Recipe) {
  const required = recipePowerInfo(recipe).voltage?.match(/\((\w+)\)/)?.[1];
  const minimum = machineTiers.findIndex(
    (tier) => tier.toLowerCase() === required?.toLowerCase(),
  );
  const options = (recipe.craftingMachines ?? []).filter((item) => {
    const tier = machineTier(item);
    return !tier || machineTiers.indexOf(tier) >= minimum;
  });
  const tiered = options
    .filter((item) => machineTier(item))
    .sort(
      (a, b) =>
        machineTiers.indexOf(machineTier(a)!) -
        machineTiers.indexOf(machineTier(b)!),
    );
  const defaultMachine =
    recipe.euPerTick > 0 ? (tiered[0] ?? options[0]) : options[0];
  return { options, defaultMachine };
}
export function selectedMachine(recipe: Recipe, machineId?: string) {
  const { options, defaultMachine } = machineOptions(recipe);
  return options.find((item) => item.id === machineId) ?? defaultMachine;
}
