import { coordinatedThemeColors, themeColorFields, interfacePresets, interfaceTheme } from "../lib/interface-theme";
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDisplaySettings, parseDisplaySettings } from "../lib/display-settings";

test("display settings restore every control from session JSON", () => {
  const settings = { customThemes: [], theme: "dark-green", overviewZoom: 0.35, overviewLineItems: false, detailLineItems: false, crossingBridges: false, animatedArrows: true, animatedItemImages: true, animatedItemSize: 1.5, animatedItemSpacing: 200, disableArrows: true, showItemIds: true, connectionTree: false, sidebarGroupThemes: false, guiScale: 1.2, lineThickness: 9 };
  assert.deepEqual(parseDisplaySettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("missing and invalid stored display settings use defaults and safe ranges", () => {
  assert.deepEqual(parseDisplaySettings(null), defaultDisplaySettings);
  assert.equal(parseDisplaySettings({}).animatedArrows, true);
  assert.equal(parseDisplaySettings({ animatedArrows: false }).animatedArrows, false);
  assert.equal(parseDisplaySettings({}).animatedItemImages, false);
  assert.equal(parseDisplaySettings({ animatedItemImages: "true" }).animatedItemImages, false);
  assert.equal(parseDisplaySettings({}).showItemIds, false);
  assert.equal(parseDisplaySettings({}).disableArrows, false);
  assert.equal(parseDisplaySettings({}).connectionTree, true);
  assert.equal(parseDisplaySettings({}).sidebarGroupThemes, true);
  assert.equal(parseDisplaySettings({ sidebarGroupThemes: "false" }).sidebarGroupThemes, true);
  assert.equal(parseDisplaySettings({ connectionTree: "false" }).connectionTree, true);
  assert.equal(parseDisplaySettings({}).lineThickness, 6);
  assert.equal(parseDisplaySettings({ lineThickness: 0 }).lineThickness, 2);
  assert.equal(parseDisplaySettings({ lineThickness: 20 }).lineThickness, 12);
  assert.deepEqual(parseDisplaySettings({ overviewZoom: "bad", guiScale: Infinity, crossingBridges: "false" }), defaultDisplaySettings);
  assert.equal(parseDisplaySettings({ guiScale: 5 }).guiScale, 1.5);
  assert.equal(parseDisplaySettings({ guiScale: 0.5 }).guiScale, 0.8);
  assert.equal(parseDisplaySettings({ guiScale: 0.85 }).guiScale, 0.9);
  assert.equal(parseDisplaySettings({ overviewZoom: -1 }).overviewZoom, 0);
  assert.equal(parseDisplaySettings({ overviewZoom: 0 }).overviewZoom, 0);
});

test("item animation controls default and clamp safely", () => {
  assert.equal(parseDisplaySettings({}).animatedItemSize, 1);
  assert.equal(parseDisplaySettings({}).animatedItemSpacing, 160);
  assert.equal(parseDisplaySettings({ animatedItemSize: 100 }).animatedItemSize, 3);
  assert.equal(parseDisplaySettings({ animatedItemSpacing: 0 }).animatedItemSpacing, 40);
});

test("interface themes exclude transparency and unknown values", () => {
  assert.equal(parseDisplaySettings({ theme: "red" }).theme, "dark-red");
  assert.equal(parseDisplaySettings({ theme: "transparent" }).theme, "blue");
  assert.equal(parseDisplaySettings({ theme: "unknown" }).theme, "blue");
});

test("custom themes save their five colors and restore the active selection", () => {
  const custom = { id: "custom:example", name: "Forest", background: "#101a10", panel: "#192919", header: "#254225", border: "#568956", accent: "#a3daa3" };
  const loaded = parseDisplaySettings(JSON.parse(JSON.stringify({ theme: custom.id, customThemes: [custom] })));
  assert.equal(loaded.theme, custom.id);
  assert.deepEqual(loaded.customThemes, [custom]);
  assert.equal(parseDisplaySettings({ theme: "custom:missing" }).theme, "blue");
  assert.deepEqual(parseDisplaySettings({ customThemes: [{ ...custom, accent: "invalid" }] }).customThemes, []);
  assert.equal(parseDisplaySettings({ theme: "default" }).theme, "blue");
});

test("built-in interface presets use dark surfaces with brighter accents", () => {
  const brightness = (hex: string) => [1, 3, 5].reduce((sum, index) => sum + parseInt(hex.slice(index, index + 2), 16), 0) / 3;
  for (const preset of interfacePresets) {
    const theme = interfaceTheme(parseDisplaySettings({ theme: preset.id }));
    assert.ok(brightness(theme.sidebar) < 45);
    assert.ok(brightness(theme.body) < 65);
    assert.ok(brightness(theme.header) < 75);
    assert.ok(brightness(theme.accent) > 140);
  }
});

test("any first custom color generates coordinated valid colors while preserving that choice", () => {
  const initial = { ...interfacePresets[0], id: "custom:test" as const };
  for (const field of themeColorFields) for (const value of ["#aa3344", "#0088ff", "#000000", "#ffffff", "#808080"]) {
    const generated = coordinatedThemeColors(initial, field, value);
    assert.equal(generated[field], value);
    assert.equal(generated.name, initial.name);
    assert.equal(generated.id, initial.id);
    for (const key of themeColorFields) assert.match(generated[key], /^#[0-9a-f]{6}$/i);
  }
});
