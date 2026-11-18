import { describe, expect, it } from 'vitest';
import { countryModules } from '../../src/countries';
import { readTaxData } from '../../src/data/nodeLoader';
import { progressiveTax } from '../../src/engine/math';
import { nextVersion, normalisePersonal, TaxDataError, TaxRegistry } from '../../src/engine/registry';
import { toAnnual } from '../../src/utils/salary';
import { calc, reg } from './helpers';

describe('tax engine contract', () => {
  it('every registered country implements the full module interface', () => {
    for (const m of countryModules) {
      const { rules } = reg.getRules(m.code, 2026);
      expect(m.getSupportedCurrencies()).toContain(m.currency);
      expect(Array.isArray(m.getRequiredPersonalInputs(rules))).toBe(true);
      const loc = m.getAvailableLocations(rules);
      if (loc) expect(loc.options.some((o) => o.id === loc.defaultId)).toBe(true);
    }
  });

  it('returns structured results whose parts add up', () => {
    for (const c of reg.listCountries()) {
      const r = reg.calculateNetSalary({ country: c.code, taxYear: 2026, grossAnnual: c.currency === 'EUR' ? 55000 : 550000 });
      expect(r.netAnnual).toBeCloseTo(r.grossAnnual - r.totalDeductions, 6);
      expect(r.totalDeductions).toBeCloseTo(r.incomeTax + r.socialContributions + r.otherMandatory + r.optionalDeductions, 6);
      expect(r.netMonthly).toBeCloseTo(r.netAnnual / 12, 9);
      expect(r.grossMonthly).toBeCloseTo(r.grossAnnual / 12, 9);
      expect(r.effectiveTaxRate).toBeGreaterThan(0);
      expect(r.marginalTaxRate).toBeGreaterThanOrEqual(r.effectiveTaxRate - 0.05);
      expect(r.currency).toBe(c.currency);
      expect(r.lines.every((l) => l.details.length > 0)).toBe(true);
      for (const l of r.lines) if (l.parts?.length) expect(l.parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(l.amount, 4);
    }
  });

  it('lists the six supported countries', () => {
    expect(reg.listCountries().map((c) => c.code).sort()).toEqual(['DE', 'DK', 'GR', 'NL', 'NO', 'SE']);
  });

  it('monthly and annual input are equivalent', () => {
    for (const c of reg.listCountries()) {
      const ppy = reg.paymentsPerYear(c.code, 2026);
      const monthly = c.currency === 'EUR' ? 4000 : 40000;
      const a = calc(c.code, toAnnual(monthly, 'monthly', 40, ppy));
      const b = calc(c.code, toAnnual(monthly * ppy, 'annual', 40, ppy));
      expect(a.netAnnual).toBe(b.netAnnual);
    }
  });

  it('hourly input uses weekly hours × 52 paid weeks', () => {
    expect(toAnnual(30, 'hourly', 37, 12)).toBe(30 * 37 * 52);
  });

  it('zero salary gives zero tax everywhere', () => {
    for (const c of reg.listCountries()) expect(calc(c.code, 0).netAnnual).toBe(0);
  });

  it('rejects negative or non-numeric salaries', () => {
    expect(() => reg.calculateNetSalary({ country: 'DK', taxYear: 2026, grossAnnual: -1 })).toThrow(TaxDataError);
    expect(() => reg.calculateNetSalary({ country: 'DK', taxYear: 2026, grossAnnual: Number.NaN })).toThrow(TaxDataError);
  });

  it('progressive brackets tax each band only on the income inside it', () => {
    const r = progressiveTax(25000, [{ upTo: 10000, rate: 0.1 }, { upTo: 20000, rate: 0.2 }, { upTo: null, rate: 0.3 }]);
    expect(r.total).toBeCloseTo(1000 + 2000 + 1500, 9);
  });

  it('ignores unknown personal fields and clamps numbers', () => {
    const fields = reg.getRequiredPersonalInputs('DE', 2026);
    const p = normalisePersonal(fields, { children: 99, bogus: 'x', taxClass: '9' });
    expect(p.children).toBe(8);
    expect(p.taxClass).toBe('1');
    expect('bogus' in p).toBe(false);
  });
});

describe('tax years and dataset versions', () => {
  it('never falls back to another year when a tax year has no data', () => {
    expect(() => reg.calculateNetSalary({ country: 'DK', taxYear: 2027, grossAnnual: 500000 })).toThrow(/No verified 2027/);
    expect(() => reg.calculateNetSalary({ country: 'DK', taxYear: 2025, grossAnnual: 500000 })).toThrow(TaxDataError);
  });

  it('a pinned version keeps its rules after a newer version is activated', () => {
    const { registry, datasets } = readTaxData('tax-data');
    const dk = datasets.find((d) => (d as { meta: { country: string } }).meta.country === 'DK') as { meta: Record<string, unknown>; rules: Record<string, unknown> };
    const newer = { meta: { ...dk.meta, version: '2026.2', previousVersion: '2026.1' }, rules: { ...dk.rules, personalAllowance: 60000 } };
    const r = structuredClone(registry) as { countries: Record<string, { active: Record<string, string> }> };
    r.countries.DK.active['2026'] = '2026.2';
    const updated = new TaxRegistry(countryModules, r, [...datasets, newer]);
    const pinned = updated.calculateNetSalary({ country: 'DK', taxYear: 2026, grossAnnual: 480000, datasetVersion: '2026.1' });
    const latest = updated.calculateNetSalary({ country: 'DK', taxYear: 2026, grossAnnual: 480000 });
    expect(pinned.netAnnual).toBeCloseTo(calc('DK', 480000).netAnnual, 9);
    expect(latest.datasetVersion).toBe('2026.2');
    expect(latest.netAnnual).toBeGreaterThan(pinned.netAnnual);
  });

  it('rejects a version that belongs to another tax year', () => {
    expect(() => reg.getDataset('DK', 2027, '2026.1')).toThrow(/belongs to tax year 2026/);
  });

  it('every dataset carries source metadata and a verification status', () => {
    for (const c of reg.listCountries()) {
      const { meta } = reg.getDataset(c.code, 2026);
      expect(meta.sources.length).toBeGreaterThan(0);
      expect(meta.sources.every((s) => s.url.startsWith('https://'))).toBe(true);
      expect(['verified', 'estimated', 'incomplete']).toContain(meta.verificationStatus);
      expect(meta.effectiveDate).toBe('2026-01-01');
    }
  });

  it('computes the next version per tax year', () => {
    expect(nextVersion(['2026.1', '2026.2', '2027.1'], 2026)).toBe('2026.3');
    expect(nextVersion(['2026.1'], 2027)).toBe('2027.1');
  });
});
