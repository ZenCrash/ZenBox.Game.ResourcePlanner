// Some exported NEI category names contain the UI's truncated title.
export function canonicalRecipeHandler(handler: string) {
  return handler === "Combustion Generator Fue..."
    ? "Combustion Generator Fuels"
    : handler;
}

export function isCombustionFuelHandler(handler: string) {
  return canonicalRecipeHandler(handler) === "Combustion Generator Fuels";
}
