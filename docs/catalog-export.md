# GTNH 2.8.4 catalog contract and extraction status

## Current status

The catalog contains **116,898 real item/fluid records and 237,773 distinct recipes** extracted from the installed 2.8.4 runtime. It is marked **partial**. The corrected NEI capture contains **56,039 searchable entries**; the original 12,766-entry capture incorrectly omitted collapsed-group members. Every item/fluid record now has a local image, including all 1,542 registered fluid displays. A targeted render repaired 43 missing recipe images (37 specific NBT variants and six explicit wildcard representatives). Thirty-two imported recipes were hidden or disabled. Sixteen source recipes have negative overflowed durations, which are retained and remain unrated. No demo or guessed recipes are installed as GTNH data.

The original Prism instance is read-only. An extraction copy of its mods, configuration and scripts is under `data/extraction/instance/minecraft`. It uses the installed Java 8 runtime and libraries, and does not include the user's saves or accounts. The planner application never reads this directory: it is development tooling only.

`tools/gtnh-export-bootstrap/PlannerExport.java` automates a temporary creative world and runtime extraction. It requires both the extraction-copy path and an explicit marker file before acting. `scripts/build-export-bootstrap.mjs` compiles it, and `scripts/launch-extraction.mjs` launches only that copy. The original instance is never used as a game directory. The copy's Better Loading Screen mod was disabled after a concurrent font initialization crash; its recipe/configuration content was retained.

The bootstrap uses selected utilities and icon rendering from [GTNH-Dumper 1.16.6](https://github.com/iouter/GTNH-Dumper), with direct reflection against the installed GregTech APIs for recipe maps. It captures raw JSON under `data/extraction/instance/minecraft/dumps/planner`. `scripts/normalize-runtime-export.mjs` converts this into an explicitly **partial** catalog and records omitted data in `data/extraction/normalization-report.json`. Generic NEI handlers do not all expose the same enumeration interface, so a successful export process alone does not establish complete coverage.

## Visibility and image repairs

Searchable visibility comes from NEI `ItemList.items`, which already applies `ItemInfo.isHidden`. The panel's `getItems()` applies collapsed groups and current search filters too, so it must not be used to hide catalog records. The corrected capture is retained in `data/catalogs/gtnh-2.8.4.visible-items.json` with a visibility report. Image availability never controls visibility.

For a focused visibility export, create `planner-export.visibility-only` in the extraction copy, run the bootstrap, then apply `scripts/repair-catalog-assets.ts --visibility` through `tsx`. Remove the marker afterward. `--prepare-images` writes explicit registry/metadata/NBT requests for missing images; the bootstrap renders those requests to `repair-icons.json`. Install with `scripts/install-rendered-icons.ts --repairs`, then remove `planner-export.image-repairs.json` from the extraction copy. `scripts/repair-catalog-assets.ts --verify` checks acacia search/navigation and every catalog image path without starting the app.

The versioned image-repair manifest records provenance. Wildcard metadata (`32767`) has no single renderable appearance, so those slots use a declared concrete representative; their original identities and recipe semantics remain unchanged. Other repairs reconstruct the exact metadata/NBT stack and use the game's renderer, including upgrade-specific revolver textures. The normalizer preserves the repaired icon mappings on subsequent imports.

## Offline contract

NEI group membership and colors are stored in SQLite (`ItemGroup` and `Item.collapsibleGroupId`), with source provenance in `gtnh-2.8.4.item-groups.json`. `scripts/import-item-groups.ts` imports the runtime capture. Current coverage is 709 groups / 43,982 members. The UI uses the configured translucent backgrounds, stronger outer borders, stacked collapsed icons, and Shift-click expansion. Large expanded groups continue across item pages.

`IngredientVariant` indexes 510,385 captured alternative memberships for usage navigation. The recipe API hydrates those items for one-second cycling; Shift pauses the browser, and selected input identities are persisted per node as `variants` in diagram JSON. A connection selects its actual output identity in a compatible receiving input. Exact inputs and conflicting simultaneous variant supplies are rejected. Missing GregTech backend alternatives still require an export update; arbitrary shared ore tags are not treated as permission to substitute.

All data preparation happens during development. The distributable contains `data/catalogs/gtnh-2.8.4.sqlite` and every referenced file beneath `public/assets/`, plus the application and runtime. No game installation, file picker, import step, or internet access is required on the receiving PC. Each future supported game/version gets its own catalog and asset directory.

`npm run catalog:check` verifies catalog readiness and local asset presence. `npm run package:offline` additionally builds a Windows x64 standalone folder with a fresh personal database and bundled Node runtime. Complete-release packaging refuses this unfinished catalog. The explicit `--preview` option allows a clearly labeled offline development preview and includes its coverage report. A catalog must not be relabeled `verified-nei-parity` just to bypass the release check.

The candidate [NotEnoughRecipeDumps v1.0-beta](https://github.com/Hermanoid/NotEnoughRecipeDumps) uses `gregtech.api.util.GT_Recipe`, `gregtech.nei.GT_NEI_DefaultHandler`, and `gregtech.common.fluid.GT_Fluid`. The installed `gregtech-5.09.51.482.jar` uses renamed classes including `GTRecipe` and `GTNEIDefaultHandler`. The exporter also loses positioned slots, cycles only the first alternative, and does not preserve the full rendered presentation. Its output must not be presented as 1:1 GTNH 2.8.4 data.

[NESQL Exporter](https://github.com/D-Cysteine/nesql-exporter) is another reference, but its documented recipe support covers crafting, furnace, and GT5 maps, not every NEI handler. [RecEx](https://github.com/GTNewHorizons/RecEx) likewise explicitly lists unsupported recipe sources.

## Required next extraction work

1. Extend the compatible exporter for the 82 handlers that lacked a general enumeration interface or raised an error. Continue using only the **copy**, after world initialization and MineTweaker changes.
2. Complete hidden filters, subsets, collapsible groups, unstable NBT examples, the 43 missing variant icons, and animated frames. The current export retains visible panel order and renders static item/fluid icons, but this alone does not establish parity.
3. Preserve input alternatives, reusable catalysts/circuits, fluid amounts, output chances, durations, power, handler-specific conditions, background images and positioned slots. Generic NEI `otherStacks` cannot blindly be classified as outputs (they can represent fuel).
4. Compare counts and representative crafting, machine, fluid, probabilistic, NBT and disabled/hidden entries with the in-game interface. Only then label a catalog `verified-nei-parity`.
5. Import further verified coverage using the contract below. Install rendered images with `node --import tsx scripts/install-rendered-icons.ts` (add `--fluids` for the separate fluid pass), then regenerate the coverage report with `node --import tsx scripts/inspect-catalog.ts`.

## Normalized JSON format

The executable validation schema is in `scripts/import-catalog.ts`. This is the planner's format, **not a direct NERD, NESQL or RecEx dump format**. A converter must be written against the chosen, verified exporter.

- Root: `game: "gtnh"`, `version: "2.8.4"`, `source`, `completeness`, `items`, `recipes`.
- Item: stable full-stack `id`, `registryId`, `metadata`, canonical `nbt`, `name`, `mod`, `group`, string-array `tooltip`, local `/assets/...` image path, `hidden`, `sortOrder`, `kind` (`item` or `fluid`). Count must not be part of identity.
- Recipe: stable `id`, `name`, `handler`, `durationTicks`, `euPerTick`, `enabled`, `details` string array, `layout`, `ingredients`.
- `layout.slotCounts` stores separate item/fluid input/output capacities. The recipe view pads each group with inert empty slots while retaining recipes exceeding the usual capacity. Runtime exports read `BasicUIProperties`; the versioned `recipe-slots.json` supplies matching 5.09.51.482 capacities for older dumps. `scripts/install-recipe-slots.mjs` rebuilds that manifest from the matching recipe-map sources in `data/extraction/power-source` and patches catalog layouts. This preserves slot counts, not custom NEI artwork or exact slot coordinates.
- GregTech cleanroom (`-200`) and combined cleanroom/low-gravity (`-300`) special values become readable requirement lines in `details`; low gravity alone (`-100`) is also labeled. Other special values retain their original meaning. Run `node scripts/install-recipe-requirements.mjs` to update existing catalog entries without changing recipe IDs or other details.
- GregTech handlers export `BasicUIProperties.amperage`. Normalization adds voltage and amperage to `details` for powered recipes whose map uses more than one amp, matching NEI's base-recipe display. EU/t already includes amperage and must not be multiplied again. Legacy 2.8.4 exports use exact handler IDs for arc furnace (including recycling), thermal centrifuge, and mass fabrication; `node scripts/install-recipe-power.mjs` backfills these details into the bundled catalog without changing recipe IDs.
- Layout: optional local `background`, pixel `width` and `height`. Ingredient coordinates are in the original unscaled layout. The browser renders these at 2×.
- Ingredient: `itemId`, `direction` (`input` or `output`), `amount`, `chance` (0–1), `consumed`, direction-unique integer `slot`, optional `x`/`y`, and `alternatives` containing full item IDs.

The importer validates version, duplicate identities, slot uniqueness and ingredient references before changing SQLite. It performs an atomic upsert transaction. Partial imports are additive; they do not silently delete historical recipes referenced by saved diagrams. All images remain external files referenced by database paths, keeping database reads and backups manageable.

## Known planner limitations

- Current recipe panels reproduce the basic Minecraft slot visual language and use provided slot coordinates/backgrounds. Group expansion and captured input variant cycling are implemented. Full handler-specific in-game interactions, complete alternative coverage, rich tooltip formatting and animated textures remain incomplete.
- Ratios use base recipe duration and expected chance output. Voltage overclocking, multiblock parallelism, machine efficiency and total flow allocation across branches are not simulated. Edge ratios are pairwise, not a global factory solver.
- SVG/PDF use a portable vector representation of recipe cards, not pixel-exact screenshots of every mod's custom GUI.
- Databases are local, single-user storage. Multi-user authentication, server deployment and simultaneous cross-process writers are outside this implementation.

## High-resolution block icons

Block and machine icons can be re-rendered at 256×256 from the isolated GTNH 2.8.4 extraction client. Ordinary item and fluid images are left unchanged. The exporter checks the runtime ItemBlock type; it does not infer block identity from names.

1. Run `node scripts/upgrade-block-icons.mjs --prepare`.
2. Run `node scripts/build-export-bootstrap.mjs "<PrismLauncher root>"`.
3. Run `node scripts/launch-extraction.mjs "<PrismLauncher root>"` and wait for `dumps/planner/status.txt` to report completion.
4. Inspect `dumps/planner/block-errors.json` and representative images in `dumps/block-icons`.
5. Run `node scripts/upgrade-block-icons.mjs --install`. This validates image dimensions/transparency, backs up the originals under `data/block-icon-backup`, and replaces only matching block icon files. The completed request is renamed so later normal exports are unaffected.

No images are downloaded from another planner. Original mod texture resolutions remain unchanged; the higher resolution improves the rendered block geometry and machine details.
