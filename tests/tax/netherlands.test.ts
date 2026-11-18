import { describe, expect, it } from 'vitest';
import { generalCredit, labourCredit, type NlRules } from '../../src/countries/nl';
import { calc, expectMonotonic, line, reg } from './helpers';

const rules = reg.getDataset('NL', 2026).rules as NlRules;

/** Belastingdienst 2026 tables (voorlopige aanslag, under AOW age). */
function reference(taxable: number) {
  const b1 = Math.min(taxable, 38883) * 0.3575;
  const b2 = Math.max(0, Math.min(taxable, 78426) - 38883) * 0.3756;
  const b3 = Math.max(0, taxable - 78426) * 0.495;
  const ahk = taxable <= 29736 ? 3115 : taxable >= 78426 ? 0 : 3115 - (taxable - 29736) * 0.06398;
  // "tot € X" = up to but excluding X; "vanaf € X" = from X.
  let ak: number;
  if (taxable < 11965) ak = taxable * 0.08324;
  else if (taxable < 25845) ak = 996 + (taxable - 11965) * 0.31009;
  else if (taxable < 45592) ak = 5300 + (taxable - 25845) * 0.0195;
  else if (taxable < 132920) ak = Math.max(0, 5685 - (taxable - 45592) * 0.0651);
  else ak = 0;
  const gross = b1 + b2 + b3;
  return gross - Math.min(gross, ahk + ak);
}

describe('Netherlands 2026 — Belastingdienst tables', () => {
  it.each([10000, 25845, 38883, 45592, 60000, 78426, 132920, 200000])('total wage tax + premiums at €%i', (g) => {
    const r = calc('NL', g);
    expect(r.incomeTax + r.socialContributions).toBeCloseTo(reference(g), 6);
  });
  it('general tax credit: €3,115 up to €29,736, zero from €78,426', () => {
    expect(generalCredit(rules, 20000)).toBe(3115);
    expect(generalCredit(rules, 50000)).toBeCloseTo(3115 - (50000 - 29736) * 0.06398, 9);
    expect(generalCredit(rules, 80000)).toBe(0);
  });
  it('labour tax credit peaks at €5,685 at €45,592', () => {
    expect(labourCredit(rules, 45592)).toBeCloseTo(5685, 6);
    expect(labourCredit(rules, 140000)).toBe(0);
  });
  it('60,000 → net €44,093.53', () => expect(calc('NL', 60000).netAnnual).toBeCloseTo(44093.53, 2));
});

describe('Netherlands 2026 — options', () => {
  it('holiday allowance option adds 8% to gross before tax', () => {
    const r = calc('NL', 50000, { addHolidayAllowance: true });
    expect(r.grossAnnual).toBeCloseTo(54000, 6);
    expect(r.incomeTax + r.socialContributions).toBeCloseTo(reference(54000), 6);
  });
  it('30% ruling makes 30% of pay tax-free and warns below the salary norm', () => {
    const r = calc('NL', 80000, { expatRuling: true });
    expect(r.incomeTax + r.socialContributions).toBeCloseTo(reference(56000), 6);
    expect(calc('NL', 40000, { expatRuling: true }).warnings.join(' ')).toMatch(/30% ruling/);
  });
  it('pension contribution reduces taxable wage', () => {
    const r = calc('NL', 60000, { pensionPercent: 5 });
    expect(r.incomeTax + r.socialContributions).toBeCloseTo(reference(57000), 6);
    expect(line(r, 'pension')).toBeCloseTo(3000, 6);
  });
  it('net pay never falls as gross rises', () => expectMonotonic('NL', 0, 250000, 1000));
});
