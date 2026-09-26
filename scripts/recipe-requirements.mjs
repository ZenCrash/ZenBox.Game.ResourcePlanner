// GregTech 5.09.51.482 DefaultSpecialValueFormatter: -200 is cleanroom,
// -300 is cleanroom + low gravity. -201 is an assembly-line scan, not cleanroom.
export function recipeRequirementDetails(specialValue) {
  switch (specialValue) {
    case -200:
      return ["(Cleanroom required)"];
    case -300:
      return ["(Cleanroom required)", "(Low gravity required)"];
    case -100:
      return ["(Low gravity required)"];
    default:
      return specialValue ? [`Special value: ${specialValue}`] : [];
  }
}
