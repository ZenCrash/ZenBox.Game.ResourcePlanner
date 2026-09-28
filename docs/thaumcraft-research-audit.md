# Thaumcraft research and asset audit

Checked the installed GTNH 2.8.4 pack on 2026-09-28 using a copy of
`Pieman/playerdata/Zen2Crash.thaum` (1,155 research entries, 69 discovered aspects).
The original save was not changed. The exporter ran in `data/extraction/instance`.

## Repairs

- Replaced all 69 visible aspect icons with native game renders. Recipe aspect
  tokens use metadata 1, whose renderer intentionally draws nothing. The exporter
  now renders a metadata-0 copy while preserving each recipe token's identity.
- Restored discovered aspect names and descriptions from the game.
- Added 63 compound-aspect recipes under **Aspect Combination**, using the live
  aspect registry's two components and the existing canonical aspect item IDs.
  Primal aspects are not given fictitious recipes.

## Recipe comparison

The following NEI handlers returned identical counts before and after loading
the research: Spinning Wheel (5), Infernal Blast Furnace (59), Shaped A.Worktable
(2,183), Shapeless A.Worktable (38), Crucible (1,758), Arcane Infusion (2,004).
These shared handlers include recipes registered by Thaumcraft addons.
Unlocking research therefore did not reveal an additional gated set in those
handlers. Aspect Combination needs separate enumeration, which the original
exporter did not support.

The existing catalog expands wildcard ingredient alternatives and contains
repaired item variants. Infusion also generates changing damage/NBT variants.
Those differences were retained in the audit for review rather than imported as
duplicate recipes. This audit does not claim that every possible dynamic addon
recipe or player-specific infusion has been captured.

## Reproduction and validation

`scripts/import-thaumcraft-research.mjs` defaults to a dry run; `--apply` imports
the verified aspects and combinations and first backs up the catalog. It rejects
unfinished/erroring exports, unknown aspect names, and fully transparent icons.
The raw export, detailed comparison, and backup are under `data/extraction` and
`data/research`. No existing recipes are removed or replaced.
