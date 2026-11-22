import { useEffect, useMemo, useState } from 'react';
import { taxRegistry } from '../data/taxData';
import type { CalcResult, InputField, LocationConfig, PersonalInputs } from '../engine/types';
import type { CalcDraft } from '../services/storage/models';
import { grossForNet } from '../services/scenario';
import { toAnnual } from '../utils/salary';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface CountryForm {
  fields: InputField[];
  locations: LocationConfig | null;
  years: number[];
  error: string | null;
}

/** Form metadata for a country/year, straight from its module and dataset. */
export function useCountryForm(country: string, taxYear: number): CountryForm {
  return useMemo(() => {
    const years = taxRegistry.getSupportedTaxYears(country);
    try {
      return { fields: taxRegistry.getRequiredPersonalInputs(country, taxYear), locations: taxRegistry.getAvailableLocations(country, taxYear), years, error: null };
    } catch (e) {
      return { fields: [], locations: null, years, error: e instanceof Error ? e.message : 'Tax data unavailable.' };
    }
  }, [country, taxYear]);
}

/** In simple mode advanced fields are ignored, so they fall back to their defaults. */
export function effectivePersonal(fields: InputField[], personal: PersonalInputs, mode: 'simple' | 'advanced'): PersonalInputs {
  const out: PersonalInputs = {};
  for (const f of fields) {
    if (f.advanced && mode === 'simple') continue;
    if (personal[f.key] !== undefined) out[f.key] = personal[f.key];
  }
  return out;
}

export interface Calculation {
  result: CalcResult | null;
  grossAnnual: number;
  paymentsPerYear: number;
  error: string | null;
}

type DraftInput = Pick<CalcDraft, 'country' | 'taxYear' | 'amount' | 'frequency' | 'hoursPerWeek' | 'location' | 'mode' | 'personal'> & { direction?: CalcDraft['direction'] };

/**
 * Gross → net (default), or net → gross: the amount is then the desired take-home pay
 * (per month = annual ÷ 12, matching how results show monthly net) and the engine
 * searches for the gross salary that produces it.
 */
export function calculateDraft(draft: DraftInput): Calculation {
  try {
    const fields = taxRegistry.getRequiredPersonalInputs(draft.country, draft.taxYear);
    const personal = effectivePersonal(fields, draft.personal, draft.mode);
    const paymentsPerYear = taxRegistry.paymentsPerYear(draft.country, draft.taxYear, personal);
    if (draft.direction === 'net-to-gross') {
      const netAnnual = draft.frequency === 'annual' ? draft.amount : draft.amount * 12;
      if (!(netAnnual > 0)) return { result: null, grossAnnual: 0, paymentsPerYear, error: null };
      const found = grossForNet({ country: draft.country, taxYear: draft.taxYear, netAnnual, location: draft.location, personal });
      if (!found) return { result: null, grossAnnual: 0, paymentsPerYear, error: 'No gross salary produces that take-home pay.' };
      return { result: found.result, grossAnnual: found.grossAnnual, paymentsPerYear, error: null };
    }
    const grossAnnual = toAnnual(draft.amount, draft.frequency, draft.hoursPerWeek, paymentsPerYear);
    if (grossAnnual <= 0) return { result: null, grossAnnual: 0, paymentsPerYear, error: null };
    const result = taxRegistry.calculateNetSalary({ country: draft.country, taxYear: draft.taxYear, grossAnnual, location: draft.location, personal });
    return { result, grossAnnual, paymentsPerYear, error: null };
  } catch (e) {
    return { result: null, grossAnnual: 0, paymentsPerYear: 12, error: e instanceof Error ? e.message : 'The calculation failed.' };
  }
}

export function useCalculation(draft: CalcDraft): Calculation {
  const amount = useDebounced(draft.amount, 120);
  return useMemo(
    () => calculateDraft({ ...draft, amount }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.country, draft.taxYear, amount, draft.frequency, draft.hoursPerWeek, draft.location, draft.mode, draft.personal, draft.direction],
  );
}
