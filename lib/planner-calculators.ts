import type { Item } from './model';
import { TOTAL_EU_INPUT_ID, FUEL_EU_OUTPUT_ID, NET_FUEL_EU_OUTPUT_ID, type SummaryCalculation } from './summary-rate';

export function plannerDefaultCalculators(target: Item, fuel: boolean): SummaryCalculation[] {
  return [
    { id: 'wizard-total-eu', inputId: TOTAL_EU_INPUT_ID, outputId: target.id, side: 'output', value: target.kind === 'fluid' ? '1000' : '1' },
    ...(fuel ? [
      { id: 'wizard-fuel-value', inputId: target.id, outputId: FUEL_EU_OUTPUT_ID, side: 'input' as const, value: '1000' },
      { id: 'wizard-net-fuel-value', inputId: target.id, outputId: NET_FUEL_EU_OUTPUT_ID, side: 'input' as const, value: '0' },
    ] : []),
  ];
}
