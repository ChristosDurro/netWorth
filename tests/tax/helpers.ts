import { loadRegistryFromDisk } from '../../src/data/nodeLoader';
import type { PersonalInputs } from '../../src/engine/types';

export const reg = loadRegistryFromDisk();

/** Calculations in tests are pinned to the dataset version the reference values were made for. */
export const calc = (country: string, grossAnnual: number, personal: PersonalInputs = {}, location?: string, version = '2026.1') =>
  reg.calculateNetSalary({ country, taxYear: 2026, grossAnnual, personal, location, datasetVersion: version });

export const part = (r: ReturnType<typeof calc>, lineId: string, label: string): number => r.lines.find((l) => l.id === lineId)?.parts?.find((p) => p.label.startsWith(label))?.amount ?? 0;
export const line = (r: ReturnType<typeof calc>, id: string): number => r.lines.find((l) => l.id === id)?.amount ?? 0;

/** Net pay must never fall when gross pay rises. */
export function expectMonotonic(country: string, from: number, to: number, step: number, personal: PersonalInputs = {}) {
  let prev = -Infinity;
  for (let g = from; g <= to; g += step) {
    const n = calc(country, g, personal).netAnnual;
    if (n + 0.5 < prev) throw new Error(`${country}: net falls at ${g} (${prev} → ${n})`);
    prev = n;
  }
}
