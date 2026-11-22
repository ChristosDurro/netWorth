import { describe, expect, it } from 'vitest';
import { calculateDraft } from '../../src/hooks/useCalculation';
import { grossForNet, queryToScenario, scenarioToQuery } from '../../src/services/scenario';
import { DEFAULT_SETTINGS, draftSchema } from '../../src/services/storage/models';
import { defaultDraft } from '../../src/state/AppState';
import { reg } from '../tax/helpers';

const base = defaultDraft(DEFAULT_SETTINGS);

describe('shareable scenarios', () => {
  it('round-trips the inputs of a calculation', () => {
    const draft = { ...base, country: 'SE', amount: 45000, location: base.location, targetCurrency: 'USD', mode: 'advanced' as const, personal: { churchMember: true } };
    const q = scenarioToQuery(draft);
    expect(q).toContain('country=SE');
    expect(q).toContain('salary=45000');
    expect(q).toContain('currency=USD');
    const parsed = queryToScenario(q, base)!;
    expect(parsed.rejected).toEqual([]);
    expect(parsed.draft).toMatchObject({ country: 'SE', amount: 45000, frequency: 'monthly', taxYear: 2026, targetCurrency: 'USD', personal: { churchMember: true } });
    expect(draftSchema.safeParse(parsed.draft).success).toBe(true);
  });

  it('matches the documented example URL', () => {
    const parsed = queryToScenario('country=DK&salary=40000&frequency=monthly&year=2026&currency=EUR', base)!;
    expect(parsed.draft).toMatchObject({ country: 'DK', amount: 40000, frequency: 'monthly', taxYear: 2026, targetCurrency: 'EUR' });
  });

  it('never trusts parameters: invalid values are rejected and replaced by safe defaults', () => {
    const parsed = queryToScenario('country=XX&salary=-5&frequency=weekly&year=1999&currency=<script>&hours=500&location=atlantis&p.churchMember=maybe&p.unknown=1&rate=0&rateDate=2099-01-01&mode=evil', base)!;
    expect(parsed.rejected.sort()).toEqual(['country', 'currency', 'frequency', 'hours', 'location', 'mode', 'p.churchMember', 'p.unknown', 'rate', 'rateDate', 'salary', 'year'].sort());
    expect(parsed.draft.country).toBe(base.country);
    expect(parsed.draft.amount).toBe(base.amount);
    expect(draftSchema.safeParse(parsed.draft).success).toBe(true);
  });

  it('rejects absurd salaries and bounds numeric circumstances by the module definition', () => {
    expect(queryToScenario('country=DK&salary=1e12', base)!.rejected).toContain('salary');
    expect(queryToScenario('country=DK&salary=40000&p.pensionPercent=99', base)!.rejected).toContain('p.pensionPercent');
    expect(queryToScenario('country=DK&salary=40000&p.pensionPercent=5', base)!.draft.personal.pensionPercent).toBe(5);
  });

  it('carries no results: the link holds inputs only', () => {
    const q = new URLSearchParams(scenarioToQuery(base));
    for (const key of q.keys()) expect(['country', 'salary', 'frequency', 'year', 'currency', 'mode', 'hours', 'location', 'details', 'rate', 'rateDate']).toContain(key.startsWith('p.') ? 'country' : key);
    expect([...q.keys()].some((k) => /net|tax|result/i.test(k))).toBe(false);
  });

  it('returns null when the URL has no scenario', () => {
    expect(queryToScenario('', base)).toBeNull();
    expect(queryToScenario('utm_source=x', base)).toBeNull();
  });
});

describe('reverse calculation (take-home → gross)', () => {
  it.each([
    ['DK', 25000 * 12],
    ['DE', 3200 * 12],
    ['NL', 3500 * 12],
    ['SE', 30000 * 12],
    ['NO', 42000 * 12],
    ['GR', 1500 * 12],
  ])('%s: the found gross produces the requested net within one unit', (country, netAnnual) => {
    const found = grossForNet({ country, taxYear: 2026, netAnnual })!;
    expect(found).not.toBeNull();
    expect(Math.abs(found.result.netAnnual - netAnnual)).toBeLessThan(1);
    const forward = reg.calculateNetSalary({ country, taxYear: 2026, grossAnnual: found.grossAnnual });
    expect(forward.netAnnual).toBeCloseTo(found.result.netAnnual, 6);
  });

  it('works through calculateDraft with monthly and annual targets', () => {
    const monthly = calculateDraft({ ...base, direction: 'net-to-gross', amount: 26114, frequency: 'monthly' });
    expect(monthly.result!.netMonthly).toBeCloseTo(26114, 0);
    expect(monthly.result!.grossMonthly).toBeCloseTo(40000, -1);
    const annual = calculateDraft({ ...base, direction: 'net-to-gross', amount: 26114 * 12, frequency: 'annual' });
    expect(annual.result!.grossAnnual).toBeCloseTo(monthly.result!.grossAnnual, 0);
  });

  it('returns nothing for impossible targets', () => {
    expect(grossForNet({ country: 'DK', taxYear: 2026, netAnnual: 0 })).toBeNull();
    expect(grossForNet({ country: 'DK', taxYear: 2026, netAnnual: Number.NaN })).toBeNull();
  });
});
