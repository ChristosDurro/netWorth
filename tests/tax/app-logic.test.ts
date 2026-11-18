import { describe, expect, it } from 'vitest';
import { bestOutcome, compareCountries, sortOutcomes } from '../../src/calculations/compare';
import { calculateDraft, effectivePersonal } from '../../src/hooks/useCalculation';
import { DEFAULT_SETTINGS, type CalcDraft } from '../../src/services/storage/models';
import { savedOps } from '../../src/services/storage/storage';
import { formatMoney } from '../../src/utils/format';
import { fromAnnual, parseAmount, toAnnual } from '../../src/utils/salary';
import { reg } from './helpers';

const table = { rates: { DKK: 7.4752, SEK: 11.095, NOK: 10.574 } };
const draft: CalcDraft = { country: 'DK', taxYear: 2026, amount: 40000, frequency: 'monthly', hoursPerWeek: 37, location: '', mode: 'simple', personal: {}, targetCurrency: 'EUR', autoConvert: true, manualRate: null, rateDate: null };

describe('salary input helpers', () => {
  it.each([
    ['40,000', 40000],
    ['40 000', 40000],
    ['40.000', 40000],
    ['40.000,50', 40000.5],
    ['4,000.25', 4000.25],
    ['3.5', 3.5],
    ['', 0],
    ['abc', 0],
    ['-5', 0],
  ])('parses "%s" as %d', (text, n) => expect(parseAmount(text)).toBe(n));
  it('converts between monthly, annual and hourly without drift', () => {
    const annual = toAnnual(40000, 'monthly', 37, 12);
    expect(annual).toBe(480000);
    expect(fromAnnual(annual, 'monthly', 37, 12)).toBe(40000);
    expect(fromAnnual(annual, 'hourly', 37, 12)).toBeCloseTo(480000 / (37 * 52), 9);
  });
  it('formats money per locale and keeps currency codes unambiguous', () => {
    expect(formatMoney(26114.48, 'DKK', { numberLocale: 'en-US', showDecimals: false })).toBe('26,114 DKK');
    expect(formatMoney(3494.4, 'EUR', { numberLocale: 'de-DE', showDecimals: true })).toBe('€3.494,40');
  });
});

describe('calculator draft', () => {
  it('taxes first, in the employment currency', () => {
    const c = calculateDraft(draft);
    expect(c.result?.currency).toBe('DKK');
    expect(c.grossAnnual).toBe(480000);
  });
  it('simple mode ignores advanced personal inputs', () => {
    const fields = reg.getRequiredPersonalInputs('DK', 2026);
    expect(effectivePersonal(fields, { churchMember: true }, 'simple')).toEqual({});
    expect(effectivePersonal(fields, { churchMember: true }, 'advanced')).toEqual({ churchMember: true });
    const simple = calculateDraft({ ...draft, personal: { churchMember: true } });
    const adv = calculateDraft({ ...draft, mode: 'advanced', personal: { churchMember: true } });
    expect(adv.result!.netAnnual).toBeLessThan(simple.result!.netAnnual);
  });
  it('Greek monthly salaries use 14 payments', () => {
    expect(calculateDraft({ ...draft, country: 'GR', amount: 2000 }).grossAnnual).toBe(28000);
  });
  it('reports a missing tax year instead of silently using another', () => {
    expect(calculateDraft({ ...draft, taxYear: 2027 }).error).toMatch(/2027/);
  });
});

describe('country comparison', () => {
  const rows = [
    { id: 'a', country: 'DK', amount: 40000, location: '', personal: {} },
    { id: 'b', country: 'DE', amount: 5000, location: '', personal: {} },
    { id: 'c', country: 'NL', amount: 5000, location: '', personal: {} },
    { id: 'd', country: 'SE', amount: 45000, location: '', personal: {} },
  ];
  it('converts net (not gross) after each country taxed in its own currency', () => {
    const out = compareCountries(rows, 2026, 'EUR', table);
    const dk = out.find((o) => o.row.country === 'DK')!;
    expect(dk.netAnnualTarget).toBeCloseTo(dk.result!.netAnnual / 7.4752, 6);
    expect(dk.grossAnnualTarget).toBeCloseTo(480000 / 7.4752, 6);
    expect(out.every((o) => (o.netAnnualTarget ?? 0) < (o.grossAnnualTarget ?? 0))).toBe(true);
  });
  it('sorts by net income and finds the best', () => {
    const out = compareCountries(rows, 2026, 'EUR', table);
    const sorted = sortOutcomes(out, 'net-desc');
    expect(sorted[0].netAnnualTarget).toBeGreaterThanOrEqual(sorted[1].netAnnualTarget!);
    expect(bestOutcome(out)?.row.id).toBe(sorted[0].row.id);
    expect(sortOutcomes(out, 'net-asc')[0].row.id).toBe(sorted[sorted.length - 1].row.id);
  });
  it('flags rows with non-default assumptions', () => {
    const out = compareCountries([{ ...rows[0], personal: { churchMember: true }, location: 'copenhagen' }, rows[1]], 2026, 'EUR', table);
    expect(out[0].customAssumptions).toEqual(['Copenhagen', 'Member of the Church of Denmark']);
    expect(out[1].customAssumptions).toEqual([]);
  });
  it('leaves conversion empty when no rates are available', () => {
    const out = compareCountries(rows, 2026, 'EUR', null);
    expect(out.find((o) => o.row.country === 'DK')!.netAnnualTarget).toBeNull();
    expect(out.find((o) => o.row.country === 'DE')!.netAnnualTarget).not.toBeNull(); // EUR → EUR needs no rate
  });
});

describe('saved calculations', () => {
  const snap = { currency: 'DKK', grossAnnual: 480000, netAnnual: 313373, effectiveTaxRate: 0.34, datasetVersion: '2026.1', targetCurrency: 'EUR', convertedNetMonthly: 3494, rateDate: '2026-11-16' };
  it('save, rename, duplicate, delete', () => {
    let list = savedOps.add([], 'Denmark - Software Developer - 40k DKK', draft, snap);
    expect(list).toHaveLength(1);
    const id = list[0].id;
    list = savedOps.rename(list, id, 'Copenhagen offer');
    expect(list[0].name).toBe('Copenhagen offer');
    expect(savedOps.rename(list, id, '   ')[0].name).toBe('Copenhagen offer');
    list = savedOps.duplicate(list, id);
    expect(list).toHaveLength(2);
    expect(list[1].name).toBe('Copenhagen offer (copy)');
    expect(list[1].id).not.toBe(id);
    list = savedOps.remove(list, id);
    expect(list.map((c) => c.name)).toEqual(['Copenhagen offer (copy)']);
  });
  it('export and import round-trip, with new ids on collision', () => {
    const list = savedOps.add([], 'A', draft, snap);
    const file = JSON.stringify(savedOps.export(list));
    const { list: merged, imported } = savedOps.import(list, file);
    expect(imported).toBe(1);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((c) => c.id)).size).toBe(2);
  });
  it('rejects invalid import files', () => {
    expect(() => savedOps.import([], 'not json')).toThrow(/not valid JSON/);
    expect(() => savedOps.import([], JSON.stringify({ app: 'other' }))).toThrow(/not a NetWorth export/);
  });
  it('default settings are valid', () => expect(DEFAULT_SETTINGS.outputCurrency).toBe('EUR'));
});
