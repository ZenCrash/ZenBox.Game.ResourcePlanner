# Recipe layout audit

Checked against enabled recipes in the installed GTNH catalog and explicit renderer branches in components/recipe-view.tsx.

42 types have dedicated layouts; 169 of 211 types use the generic fallback. This audits visual layouts only, not machine lists, icons, sorting, timing, or other improvements.

## Types without a dedicated layout

| Recipe type | Recipes |
|---|---:|
| Acclimatiser | 12 |
| Acid Generator | 12 |
| Alchemic Calcinator | 15 |
| Alloy Blast Smelter | 72 |
| Alloy Smelter | 702 |
| Analyzer | 13 |
| Animal Trap Drops | 3 |
| Arc Furnace | 20 |
| Arcane Infusion | 1,982 |
| Assemblyline Process | 483 |
| Baryonic Perfection | 1 |
| Bending Machine | 3,269 |
| BetterQuesting | 3 |
| Binding Ritual | 19 |
| Bio Lab | 111 |
| Blasting | 5,740 |
| Brewing | 194 |
| COMET - Compact Cyclotron | 20 |
| Canner | 877 |
| Centrifuge | 1,617 |
| Chemical Bath | 783 |
| Circuit Assembly Line | 71 |
| Circuit Assembly Line Imprinting | 35 |
| Clarifier | 1 |
| Coke Oven | 1,275 |
| Cold Trap | 2 |
| Component Assembly Line | 142 |
| Crucible | 1,758 |
| Cryogenic Freezer | 281 |
| Cutting Machine | 8,029 |
| DTPF | 83 |
| Decayables | 4 |
| Degassing | 1 |
| Dehydrator | 87 |
| Digester | 34 |
| Dissolution Tank | 33 |
| Draconic Evolution Fusion ... | 11 |
| Electric Implosion Compres... | 308 |
| Electromagnetic Polarizer | 191 |
| Electromagnetic Separator | 41 |
| Enchanter | 28 |
| Extractor | 353 |
| Extreme Diesel Engine Fuel | 3 |
| Extreme Heat Exchanger | 115 |
| Eye of Harmony | 40 |
| Fireworks | 19 |
| Fish Trap Drops | 1 |
| Flocculation | 1 |
| Flotation Cell | 12 |
| Fluid Heater | 19 |
| Forge Hammer | 4,289 |
| Forge Hammer Recycling | 190 |
| Fusion Reactor | 65 |
| Garden Drops | 13 |
| Gas Turbine Fuel | 28 |
| Gene Database | 2 |
| Genepool | 12 |
| Godforge Upgrades | 7 |
| Helioflux Melting Core | 1,308 |
| Heliofusion Exoticizer | 2 |
| Heliothermal Plasma Fabric... | 217 |
| High Energy Laser Treatm... | 1 |
| High Temperature Gas-coo... | 3 |
| Imbuing Station | 7 |
| Implosion Compressor | 1,096 |
| Incubator | 157 |
| Inoculator | 8 |
| Inscriber | 12 |
| Isolator | 12 |
| Isotope Decay | 4 |
| Kettle | 38 |
| LFTR Gas Sparging | 3 |
| Large Naquadah Reactor | 9 |
| Laser Engraver | 1,703 |
| Lathe | 1,402 |
| Liquid Fluoride Thorium Re... | 3 |
| LootBag | 51 |
| Lumbermill | 92 |
| Macerator | 5,228 |
| Manipulator Upgrades | 9 |
| Mass Fabrication | 2 |
| Matter Amplifier | 2 |
| Matter Fabricator | 6 |
| Meteor Ritual | 54 |
| Milling | 200 |
| Mob Info | 400 |
| Moistener | 49 |
| Molecular Transformer | 18 |
| Multiblock Centrifuge | 1,463 |
| Multiblock Dehydrator | 88 |
| Multiblock Electrolyzer | 351 |
| Nano Forge | 12 |
| Naquadah Fuel Refinery | 9 |
| Naquadah Reactor MkI | 2 |
| Naquadah Reactor MkII | 2 |
| Naquadah Reactor MkIII | 2 |
| Naquadah Reactor MkIV | 2 |
| Naquadah Reactor MkV | 2 |
| Neutron Activator | 12 |
| Neutronium Compressor | 71 |
| Nuclear Fission | 33 |
| Nuclear Fuel Processing | 5 |
| Nuclear Salt Processing P... | 8 |
| Oil Cracker | 85 |
| Ore Washer | 662 |
| Ozonation | 4 |
| PCB Factory | 105 |
| Packager | 2,217 |
| Plasma Arc Furnace | 112 |
| Plasma Generator Fuels | 127 |
| Polymeriser | 3 |
| Precise Assembler | 16 |
| Printer | 5 |
| Pyrolyse Oven | 1,259 |
| QC Components | 27 |
| QED Recipes | 7 |
| Quantum Force Transform... | 29 |
| RTG | 5 |
| Radio Hatch Material List | 104 |
| Reactor | 1 |
| Reactor Processing Unit | 6 |
| Replicator | 92 |
| Research Station | 304 |
| Rocket Engine Fuel | 4 |
| SAG Mill | 1,665 |
| Scanner | 292 |
| Sequencer | 1 |
| Shaped A.Worktable | 2,183 |
| Shaped IC2 Crafting | 1 |
| Shaped Orb Crafting | 61 |
| Shapeless A.Worktable | 38 |
| Shapeless Orb Crafting | 5 |
| Sifter | 121 |
| Simple Dust Washer | 836 |
| Slice'N'Splice | 7 |
| Slicer | 58 |
| Smoking | 63 |
| Solar Factory | 25 |
| Solar Tower | 1 |
| Soul Binder | 8 |
| Source Chamber | 4 |
| Space Assembler | 23 |
| Space Mining | 225 |
| Space Projects | 2 |
| Spinning Wheel | 9 |
| Splicer | 8 |
| Squeezer | 277 |
| Target Chamber | 107 |
| Temperature Fluctuation | 1 |
| Thermal Boiler | 4 |
| Thermal Centrifuge | 676 |
| Thermal Generator Fuels | 5 |
| Thermionic Fabricator | 93 |
| TiC Bolt Molding | 27,367 |
| Tool Casting Machine | 38 |
| Transcendent Plasma Mixer | 8 |
| Tree Growth Simulator | 250 |
| Unpackager | 357 |
| Vacuum Freezer | 322 |
| Vacuum Furnace | 16 |
| Vat | 8 |
| Wiremill | 1,342 |
| Witch's Cauldron | 26 |
| Witches Oven | 9 |
| Xtreme Crafting | 130 |
| Xtreme Shapeless | 3 |
| Zhuhai - Fishing Port | 3 |
| pH Neutralization | 1 |

## Types with dedicated layouts

- ABS Non-Alloy Recipes
- Alloy Smelter Molding
- Alloy Smelter Recycling
- Arc Furnace Recycling
- Assembler
- Autoclave
- Bacterial Vat
- Blast Furnace
- Bottler
- Brewery
- Bricked Blast Furnace
- Carpenter
- Casting Table
- Chemical Plant
- Chemical Reactor
- Circuit Assembler
- Combustion Generator Fue...
- Compressor
- Distillation Tower
- Distillery
- Electrolyzer
- Extruder
- Fermenter
- Fluid Canner
- Fluid Extractor
- Fluid Extractor Recycling
- Fluid Solidifier
- Forming Press
- Infernal Blast Furnace
- Large Boiler
- Large Chemical Reactor
- Macerator Recycling
- Magic Energy Absorber Fu...
- Mixer
- Multiblock Mixer
- Rock Breaker
- Semifluid Generator Fuels
- Shaped Crafting
- Shapeless Crafting
- Smelting
- TiC Part Extruding
