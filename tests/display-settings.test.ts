import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDisplaySettings, parseDisplaySettings } from "../lib/display-settings";

test("display settings restore every control from session JSON", () => {
  const settings = { overviewZoom: 0.35, overviewLineItems: false, detailLineItems: false, crossingBridges: false, animatedArrows: true, disableArrows: true, guiScale: 1.2, lineThickness: 9 };
  assert.deepEqual(parseDisplaySettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("missing and invalid stored display settings use defaults and safe ranges", () => {
  assert.deepEqual(parseDisplaySettings(null), defaultDisplaySettings);
  assert.equal(parseDisplaySettings({}).animatedArrows, false);
  assert.equal(parseDisplaySettings({}).disableArrows, false);
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
