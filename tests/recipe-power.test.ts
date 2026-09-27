import { test } from "node:test";
import assert from "node:assert/strict";
import { recipePowerInfo } from "../lib/recipe-power";

for (const handler of ["Combustion Generator Fuels", "Combustion Generator Fue..."]) {
test(`${handler} values display EU per 1000 L with grouped digits`, () => {
  assert.deepEqual(recipePowerInfo({
    handler,
    euPerTick: 0,
    details: JSON.stringify(["Special value: 480", "Other detail"]),
  }).details, ["Fuel Value: 480,000 EU", "Other detail"]);
});
}

test("combustion conversion does not change other handlers' values", () => {
  for (const [handler, expected] of [
    ["Magic Energy Absorber Fuels", "Fuel Value: 480 EU"],
    ["Other Machine", "Special value: 480"],
  ]) {
    assert.deepEqual(recipePowerInfo({
      handler, euPerTick: 0, details: '["Special value: 480"]',
    }).details, [expected]);
  }
});
