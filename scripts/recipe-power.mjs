// GTNH 2.8.4 / GregTech 5.09.51.482 RecipeMaps.java.
// Legacy exports omitted BasicUIProperties.amperage. Match exact NEI IDs,
// including the recycling category that shares the arc furnace recipe map.
const legacyAmperage = new Map([
  ["gt.recipe.arcfurnace", 3],
  ["gt.recipe.category.arc_furnace_recycling", 3],
  ["gt.recipe.thermalcentrifuge", 2],
  ["gt.recipe.massfab", 8],
]);
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

export function recipePowerDetails(handler, recipe) {
  if (handler.kind !== "gregtech" || !(recipe.euPerTick > 0)) return [];
  const amps = handler.amperage ?? legacyAmperage.get(handler.overlay);
  if (!Number.isSafeInteger(amps) || amps <= 1) return [];
  // Match NEI's base-recipe display: mEUt already includes all amps.
  const voltage = Math.trunc(recipe.euPerTick / amps);
  const tier = tiers.find((_, index) => voltage <= 8 * 4 ** index);
  return [
    `Voltage: ${voltage.toLocaleString("en-US")} EU/t${tier ? ` (${tier})` : ""}`,
    `Amperage: ${amps.toLocaleString("en-US")} A`,
  ];
}
