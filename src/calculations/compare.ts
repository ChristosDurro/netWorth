import { taxRegistry } from '../data/taxData';
import type { CalcResult, InputField, PersonalInputs } from '../engine/types';
import { crossRate, type RateTable } from '../services/currency/currencyService';
import type { CompareRow } from '../services/storage/models';
import { calculateDraft } from '../hooks/useCalculation';

export interface CompareOutcome {
  row: CompareRow;
  result: CalcResult | null;
  error: string | null;
  /** Units of target currency per unit of the row's currency, or null if unknown. */
  rate: number | null;
  grossAnnualTarget: number | null;
  netAnnualTarget: number | null;
  /** Personal inputs that differ from the country's defaults, as readable labels. */
  customAssumptions: string[];
  paymentsPerYear: number;
}

export function describeCustomAssumptions(fields: InputField[], personal: PersonalInputs): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const v = personal[f.key];
    if (v === undefined || v === f.default) continue;
    if (f.type === 'boolean') out.push(v ? f.label : `Not: ${f.label.toLowerCase()}`);
    else if (f.type === 'select') out.push(f.options.find((o) => o.value === v)?.label ?? String(v));
    else out.push(`${f.label}: ${v}${f.unit ?? ''}`);
  }
  return out;
}

/**
 * Each row is taxed in its own currency with its own rules first; only the
 * resulting gross and net amounts are converted into the shared target currency.
 */
export function compareCountries(rows: CompareRow[], taxYear: number, target: string, table: Pick<RateTable, 'rates'> | null): CompareOutcome[] {
  return rows.map((row) => {
    let fields: InputField[] = [];
    let locationLabel: string | null = null;
    try {
      fields = taxRegistry.getRequiredPersonalInputs(row.country, taxYear);
      const locs = taxRegistry.getAvailableLocations(row.country, taxYear);
      if (locs && row.location && row.location !== locs.defaultId) locationLabel = locs.options.find((o) => o.id === row.location)?.label ?? null;
    } catch {
      /* reported through calc.error below */
    }
    const calc = calculateDraft({ country: row.country, taxYear, amount: row.amount, frequency: 'monthly', hoursPerWeek: 40, location: row.location, mode: 'advanced', personal: row.personal });
    const currency = calc.result?.currency ?? taxRegistry.listCountries().find((c) => c.code === row.country)?.currency ?? '';
    const rate = currency === target ? 1 : table ? crossRate(table, currency, target) : null;
    return {
      row,
      result: calc.result,
      error: calc.error ?? (taxRegistry.getSupportedTaxYears(row.country).includes(taxYear) ? null : `No ${taxYear} tax data for this country.`),
      rate,
      grossAnnualTarget: calc.result && rate !== null ? calc.result.grossAnnual * rate : null,
      netAnnualTarget: calc.result && rate !== null ? calc.result.netAnnual * rate : null,
      customAssumptions: [...(locationLabel ? [locationLabel] : []), ...describeCustomAssumptions(fields, row.personal)],
      paymentsPerYear: calc.paymentsPerYear,
    };
  });
}

/** 'net-desc': highest take-home first; 'tax-asc': lowest effective tax rate first; 'input': order added. */
export type SortMode = 'input' | 'net-desc' | 'tax-asc';

export function sortOutcomes(list: CompareOutcome[], mode: SortMode): CompareOutcome[] {
  if (mode === 'input') return list;
  return [...list].sort((a, b) => {
    if (mode === 'tax-asc') {
      if (!a.result) return 1;
      if (!b.result) return -1;
      return a.result.effectiveTaxRate - b.result.effectiveTaxRate;
    }
    if (a.netAnnualTarget === null) return 1;
    if (b.netAnnualTarget === null) return -1;
    return b.netAnnualTarget - a.netAnnualTarget;
  });
}

/** How far each offer is behind the best one, in target currency per year (0 for the best). */
export function gapToBest(o: CompareOutcome, best: CompareOutcome | null): number | null {
  if (!best || best.netAnnualTarget === null || o.netAnnualTarget === null) return null;
  return o.netAnnualTarget - best.netAnnualTarget;
}

export function bestOutcome(list: CompareOutcome[]): CompareOutcome | null {
  return list.reduce<CompareOutcome | null>((best, o) => (o.netAnnualTarget !== null && (best === null || o.netAnnualTarget > (best.netAnnualTarget as number)) ? o : best), null);
}
