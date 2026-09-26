# Resource Planner

A local Next.js 16 / React 19 production-diagram workspace for Minecraft modpacks. GT: New Horizons 2.8.4 is the first supported project version.

**Status:** the project/diagram application and Prisma persistence are implemented. A real GTNH 2.8.4 runtime catalog is distributed as a separate game-pack ZIP: 116,898 item/fluid records and 237,773 recipes. **The catalog is partial and exact NEI parity is not complete.** Custom handler coverage, grouping, layouts and animation remain unfinished. See [catalog extraction status](docs/catalog-export.md) and `data/catalogs/gtnh-2.8.4.coverage.json` for measured coverage.

## Offline distribution

The application and game data are distributed separately. Run `npm run package:offline` to build the Windows application with a fresh personal database and Node runtime. Copy the entire output folder and run `start.cmd`.

Open Minecraft, choose GT: New Horizons, and install its game-pack ZIP. A fresh installation shows **Not installed** until the ZIP has been imported. Vanilla Minecraft is **Coming soon**. Installed GTNH packs can be downloaded again from this page; personal projects and diagrams are excluded.

To prepare the portable data file from an installed catalog, run `npm run pack:gtnh`. This creates `dist/gtnh-2.8.4.gamepack.zip`, containing the SQLite catalog, item/fluid/block images, and coverage metadata. The current catalog remains partial. Minecraft itself and an internet connection are not needed to import or use the pack.

## Run from source

Requires Node.js 24 and npm. From this repository:

```sh
npm install
npm run db:setup
npm run dev
```

Open [Resource Planner](http://localhost:3000). On this Windows machine, if `npm.ps1` resolves to a broken global npm installation, use `& 'C:/Program Files/nodejs/npm.cmd' run dev` (and similarly for other npm commands).

Native installation scripts for Prisma, esbuild and better-sqlite3 are pinned in `package.json`'s `allowScripts`. `db:setup` generates two separate Prisma clients and synchronizes the personal-project SQLite schema. It does not reset existing databases. Schema changes that require data loss fail rather than automatically accepting data loss. For production schema evolution, introduce reviewed migrations before changing existing user data.

## Storage

| Data                                                | Location                          | Access                                  |
| --------------------------------------------------- | --------------------------------- | --------------------------------------- |
| Projects, diagram metadata, settings                | `data/app.sqlite`                 | Prisma app client                       |
| Versioned items, fluids, recipes, slots, provenance | `data/catalogs/gtnh-2.8.4.sqlite` | Prisma catalog client                   |
| Individual diagrams                                 | `data/diagrams/<uuid>.json`       | Validated JSON, atomic file replacement |
| Logos and catalog assets                            | `data/game-assets/`                  | SQLite references local asset paths     |
| Isolated game extraction copy                       | `data/extraction/instance/`       | Separate from the original instance     |

The versioned catalog and local assets are gitignored and distributed in game-pack ZIPs. Personal project databases, diagrams, extraction files and generated Prisma clients are gitignored. Back up `data/app.sqlite` and `data/diagrams` for your personal work; keep a copy of the matching game-pack ZIP. Diagram JSON records reference catalog recipe IDs. Deleting a diagram removes it from the project; its JSON file is retained as a recovery copy.

The following is a developer-only data preparation step, never an end-user requirement. The original instance must stay read-only. The asset extraction script only reads it:

```powershell
npm run assets:extract -- 'C:/Users/jacob/AppData/Roaming/PrismLauncher/instances/GT New Horizons' 'C:/Users/jacob/AppData/Roaming/PrismLauncher/libraries/com/mojang/minecraft/1.7.10/minecraft-1.7.10-client.jar'
```

Minecraft and modpack images belong to Mojang, the GTNH team and their respective authors. Local assets are included with the planner distribution.

## Workflow

- Home → Minecraft → GT: New Horizons. Vanilla Minecraft is intentionally inactive.
- Create a named 2.8.4 project or open an existing project; version badges are shown in both cases. Creation automatically opens `Main production`.
- Create diagrams in the left sidebar. Deletion requires confirmation.
- Search and filter the versioned item catalog on the right. Left click an item for recipes; right click for uses. Recipe ingredients have the same navigation actions, with a back button and handler tabs.
- NEI's 709 captured groups appear with their configured background and connected borders. Shift-click the first displayed member to expand/collapse a group. Search includes members inside collapsed groups.
- Recipe inputs cycle through captured accepted variants once per second. Hold Shift to pause; adding the recipe locks the displayed variants. Diagram cards stay static. Connecting an allowed output switches the receiving input to that concrete variant; incompatible simultaneous supplies are rejected. Choices survive saving and appear in JSON/SVG/PDF exports.
- Select a recipe to add a draggable card. Connect compatible output/input circles in either direction. Captured input alternatives share a deterministic color within the diagram, including in SVG/PDF exports. Connections check the receiving recipe's accepted items; exact-item inputs stay restricted. Ore Dictionary substitutions missing from the runtime export (including GregTech backend alternatives) still require a catalog update.
- Machine counts update per-second input/output labels. Edge labels show **producer : consumer** ratios and actual selected rates. Chance outputs are expected averages; reusable ingredients have no continuous consumption rate.
- Connection lines are gray when either recipe lacks valid timing, red for insufficient production, green for matching production/consumption, and blue for surplus. Colors use the selected machine counts and are retained in SVG/PDF exports.
- Untimed recipes omit per-second port labels; connections with an untimed endpoint omit their central rate badge. Ctrl-click a catalog item to add an untimed item source card with an output port.
- Cards snap to an invisible 20-pixel grid. Select a connection and drag its square bend handle (or use the arrow keys) to adjust its orthogonal route on the same grid. Item cards and line bends are saved in diagram JSON and included in SVG/PDF exports.
- Right-click a line to add bends. Drag a corner onto its directly connected neighbor to remove their connecting segment, or onto a corner sharing an intermediate corner to remove that detour; corners touching recipes are protected. Right-drag port circles along recipe edges to rearrange them on grid rows.
- Click a line or its rate card to select it and show its glow. Ctrl/Cmd-click adds recipes to the selection; on a line it also selects both endpoint recipes. Toggling the line off keeps its recipes selected.
- Ctrl/Cmd+C, X and V copy, cut and paste selections within the open workspace, including their internal connections. Added and pasted recipes appear near the visible top-left corner. Each recipe has a delete button in its header.
- Undo/Redo buttons sit at the diagram's top-left. Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes edits, with each drag treated as one step. The last 100 edit steps are retained until another diagram is loaded or the page closes.
- All lines feeding the same input share a color based on their combined supply: red for a shortage, green when balanced, blue for surplus, and gray when timing is unavailable.
- Hold the mouse wheel to pan. Left- or right-drag empty canvas to select an area; hold Shift while dragging to deselect. Cards require more than 25% of their area inside the rectangle; lines require their entire path, including every bend, inside it.
- Selected line cards glow and can be dragged to a manual position. Moving a bend, port, or one endpoint recipe restores automatic placement. Moving both endpoint recipes together preserves the card's relative placement and moves the route with them. Manual positions are included in history, saved diagrams, clipboard copies and exports.
- The top-center item-card button opens a searchable catalog picker; click an item to add it. The adjacent area button adds a blue summary card behind recipes and connections. Select it to resize it, or drag its header to move it.
- Summary areas count fully enclosed recipe cards, using their machine quantities and base recipe rates. They show EU/t, machine icons and minimum required voltage tiers, and net per-second item/fluid needs and production. Internal production cancels matching consumption, leaving any shortage or surplus. Reusable ingredients and untimed item-source cards do not contribute rates. Areas support undo, copy/paste, saving and SVG/PDF export.
- Save explicitly with the Save button or Ctrl/Cmd+S. Switching diagrams first saves the current diagram. Conflicting saves from another tab return an error and preserve your unsaved work. Leaving with unsaved changes prompts you.
- Download a diagram as JSON, SVG or PDF. SVG/PDF contain embedded item images and can be opened independently of the app.

## Checks

```sh
npm run lint
npm test
npm run build
# With the dev server running:
npm run test:integration
```

The integration test creates and cleans up disposable test project records; deleted diagram JSON recovery copies can remain. Tests cover persistence, automatic diagram creation, unsupported versions, revision conflicts, unknown recipes, deletion, machine ratios, chances and reusable inputs.

For developers preparing a bundled catalog, the importer accepts a **normalized** export, not arbitrary third-party dump files:

```sh
npm run catalog:import -- path/to/catalog.json
```

See [the contract and outstanding work](docs/catalog-export.md) before attempting a real import. The schema retains additional fields such as NBT identity and alternatives for subsequent fidelity work.
