export function convertSummaryRate(
  value: number,
  fromRate: number,
  toRate: number,
) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(fromRate) ||
    fromRate <= 0 ||
    !Number.isFinite(toRate) ||
    toRate < 0
  )
    return null;
  const result = (value / fromRate) * toRate;
  return Number.isFinite(result) ? result : null;
}
import type { DiagramDocument } from "./model";
export type SummaryCalculation = NonNullable<
  NonNullable<DiagramDocument["areas"]>[number]["calculators"]
>[number];
