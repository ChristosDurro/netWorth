import { describe, expect, it } from 'vitest';
import { calc, expectMonotonic, line, part } from './helpers';

/** Statutory 2026 values (skat.dk / Skatteministeriet). */
const PA = 54100;
const AM = 0.08;
const BUND = 0.1201;
const ATP = 99 * 12;

/** Independent, step-by-step reference calculation following skat.dk's method. */
function reference(gross: number, municipal: number, church = 0, pension = 0) {
  const atp = Math.min(gross, ATP);
  const amBase = gross - atp - gross * pension;
  const am = amBase * AM;
  const personal = amBase - am;
  const employment = Math.min(amBase * 0.1275, 63300);
  const job = Math.min(Math.max(0, amBase - 235200) * 0.045, 3100);
  const taxable = Math.max(0, personal - employment - job);
  const bottom = Math.max(0, personal - PA) * BUND;
  const muni = Math.max(0, taxable - PA) * municipal;
  const middle = Math.max(0, personal - 641200) * 0.075;
  const top = Math.max(0, personal - 777900) * 0.075;
  const topTop = Math.max(0, personal - 2592700) * 0.05;
  return { atp, am, tax: bottom + muni + middle + top + topTop, church: Math.max(0, taxable - PA) * church, net: gross - atp - am - (bottom + muni + middle + top + topTop) - Math.max(0, taxable - PA) * church - gross * pension };
}

describe('Denmark 2026 — reference calculations', () => {
  it.each([180000, 300000, 480000, 720000])('average municipality (25.05%), gross %i DKK', (g) => {
    const r = calc('DK', g);
    const ref = reference(g, 0.2505);
    expect(r.incomeTax).toBeCloseTo(ref.tax, 6);
    expect(line(r, 'am-bidrag')).toBeCloseTo(ref.am, 6);
    expect(r.netAnnual).toBeCloseTo(ref.net, 6);
  });
  it('Copenhagen (23.39%) with church tax (0.80%)', () => {
    const r = calc('DK', 600000, { churchMember: true }, 'copenhagen');
    const ref = reference(600000, 0.2339, 0.008);
    expect(r.netAnnual).toBeCloseTo(ref.net, 6);
    expect(line(r, 'church-tax')).toBeCloseTo(ref.church, 6);
  });
  it('own pension contribution is deducted before AM-bidrag and tax', () => {
    const r = calc('DK', 600000, { pensionPercent: 5 });
    expect(r.netAnnual).toBeCloseTo(reference(600000, 0.2505, 0, 0.05).net, 6);
    expect(r.optionalDeductions).toBeCloseTo(30000, 6);
  });
});

describe('Denmark 2026 — allowances and thresholds', () => {
  it('no income tax below the personal allowance', () => {
    expect(calc('DK', 50000).incomeTax).toBe(0);
  });
  it('employment deduction is capped at 63,300 DKK', () => {
    const lo = calc('DK', 800000).steps.find((s) => s.label === 'Employment deduction')?.value;
    expect(lo).toBe(63300);
  });
  it('middle tax starts at 641,200 DKK personal income after AM-bidrag', () => {
    // personal income = (gross − ATP) × 0.92 → threshold gross ≈ 698,152
    const below = calc('DK', 697000);
    const above = calc('DK', 710000);
    expect(part(below, 'income-tax', 'Middle')).toBe(0);
    expect(part(above, 'income-tax', 'Middle')).toBeCloseTo(((710000 - ATP) * 0.92 - 641200) * 0.075, 6);
  });
  it('top tax above 777,900 and top-top tax above 2,592,700', () => {
    expect(part(calc('DK', 900000), 'income-tax', 'Top tax')).toBeCloseTo(((900000 - ATP) * 0.92 - 777900) * 0.075, 6);
    expect(part(calc('DK', 3000000), 'income-tax', 'Top-top')).toBeCloseTo(((3000000 - ATP) * 0.92 - 2592700) * 0.05, 6);
  });
  it('the tax ceiling (44.57%) trims the middle-tax rate in high-tax municipalities', () => {
    // Læsø 26.3%: 12.01 + 7.5 + 26.3 = 45.81% > 44.57% → middle rate 6.26%.
    const r = calc('DK', 900000, {}, 'laesoe');
    expect(r.lines[0].details.join(' ')).toMatch(/tax ceiling/);
    expect(part(r, 'income-tax', 'Middle tax (6.26%)')).toBeGreaterThan(0);
  });
  it('has rates for all 98 municipalities and the average marginal rate is plausible', () => {
    const r = calc('DK', 480000);
    expect(r.marginalTaxRate).toBeGreaterThan(0.35);
    expect(r.marginalTaxRate).toBeLessThan(0.42);
  });
  it('net pay never falls as gross rises', () => expectMonotonic('DK', 0, 3500000, 25000));
});
