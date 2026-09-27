import type { Item, Recipe } from "./model";

/** Smelting has no universal energy cost: it belongs to the selected machine.
 * Verified against GT 5.09.51.482 FurnaceBackend/MicrowaveBackend and steam
 * furnace classes, and IC2 2.2.828 TileEntityIronFurnace. Vanilla uses 200 ticks.
 */
export function smeltingRuntime(recipe: Recipe, machine?: Item): Recipe {
  if (recipe.handler !== "Smelting") return steamRuntime(recipe, machine);
  const id = machine?.id ?? "minecraft:furnace";
  let durationTicks = 0;
  let euPerTick = 0;
  let steamPerTick: number | undefined;
  let steamPerBatch: number | undefined;
  let parallel: number | undefined;
  let cycleDurationTicks: number | undefined;
  if (id === "minecraft:furnace" || id === "Natura:NetherFurnace")
    durationTicks = 200;
  else if (id === "IC2:blockMachine:1") durationTicks = 160;
  else if (id === "gregtech:gt.blockmachines:103") {
    durationTicks = 256;
    steamPerTick = 8;
  } else if (id === "gregtech:gt.blockmachines:104") {
    durationTicks = 128;
    steamPerTick = 16;
  } else if (id === "Railcraft:machine.alpha:3") {
    durationTicks = 256;
    cycleDurationTicks = 272;
    parallel = 9;
    steamPerBatch = 8000;
    steamPerTick = steamPerBatch / cycleDurationTicks;
  }
  else if (id.startsWith("gregtech:gt.blockmachines:")) {
    const meta = Number(id.split(":").at(-1));
    if ((meta >= 261 && meta <= 265) || (meta >= 10840 && meta <= 10846)) {
      durationTicks = 128;
      euPerTick = 4;
    } else if (
      (meta >= 311 && meta <= 315) ||
      (meta >= 10960 && meta <= 10966)
    ) {
      durationTicks = 32;
      euPerTick = 4;
    }
  }
  let details: string[] = [];
  try {
    details = JSON.parse(recipe.details);
  } catch {}
  details = details.filter(
    (line) => !/^(Voltage|Usage|Amperage|Machine-specific timing):/i.test(line),
  );
  return {
    ...recipe,
    durationTicks,
    euPerTick,
    steamPerTick,
    steamPerBatch,
    parallel,
    cycleDurationTicks,
    details: JSON.stringify(details),
  };
}

// The bronze/steel SteamOverclockDescribers use (EU multiplier, duration
// multiplier) = (1, 2)/(2, 1), then convert each EU into 2 L of steam.
function steamRuntime(recipe: Recipe, machine?: Item): Recipe {
  const bronze = [106, 109, 112, 115, 118];
  const steel = [107, 110, 113, 116, 119];
  if (!machine?.id.startsWith("gregtech:gt.blockmachines:") || recipe.euPerTick <= 0 || recipe.durationTicks <= 0) return recipe;
  const meta = Number(machine.id.split(":").at(-1));
  if (!bronze.includes(meta) && !steel.includes(meta)) return recipe;
  const highPressure = steel.includes(meta);
  return {
    ...recipe,
    euPerTick: 0,
    steamPerTick: recipe.euPerTick * (highPressure ? 4 : 2),
    durationTicks: recipe.durationTicks * (highPressure ? 1 : 2),
  };
}
