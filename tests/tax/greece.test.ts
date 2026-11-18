import { describe, expect, it } from 'vitest';
import { calc, expectMonotonic, line, reg } from './helpers';

const EFKA = 0.1337;
const CEILING_MONTH = 7761.94;

/** Law 5246/2025 scale for employment income (2026), no children. */
function scaleTax(taxable: number, rates = [0.09, 0.2, 0.26, 0.34, 0.39, 0.44]) {
  const bounds = [10000, 20000, 30000, 40000, 60000, Infinity];
  let lo = 0;
  let t = 0;
  bounds.forEach((hi, i) => {
    t += Math.max(0, Math.min(taxable, hi) - lo) * rates[i];
    lo = hi;
  });
  return t;
}
const credit = (taxable: number, base = 777) => Math.max(0, base - (Math.max(0, taxable - 12000) / 1000) * 20);

describe('Greece 2026 — employment income', () => {
  it.each([9000, 14000, 21000, 28000, 45000, 75000])('no children, gross €%i', (g) => {
    const taxable = g - g * EFKA;
    const r = calc('GR', g);
    expect(line(r, 'efka')).toBeCloseTo(g * EFKA, 6);
    expect(r.incomeTax).toBeCloseTo(Math.max(0, scaleTax(taxable) - Math.min(scaleTax(taxable), credit(taxable))), 6);
  });
  it('28,000 → tax €3,474.79', () => expect(calc('GR', 28000).incomeTax).toBeCloseTo(3474.79, 2));
  it('e-EFKA contributions stop at the insurable ceiling × 14 payments', () => {
    expect(line(calc('GR', 200000), 'efka')).toBeCloseTo(CEILING_MONTH * 14 * EFKA, 6);
    expect(line(calc('GR', 200000, { salaryPayments: '12' }), 'efka')).toBeCloseTo(CEILING_MONTH * 12 * EFKA, 6);
  });
  it('a monthly salary is multiplied by 14 payments by default', () => {
    expect(reg.paymentsPerYear('GR', 2026, {})).toBe(14);
  });
});

describe('Greece 2026 — family and youth relief', () => {
  it('two children: lower rates and a €1,120 base reduction', () => {
    const g = 28000;
    const taxable = g * (1 - EFKA);
    const t = scaleTax(taxable, [0.09, 0.16, 0.22, 0.34, 0.39, 0.44]);
    expect(calc('GR', g, { children: 2 }).incomeTax).toBeCloseTo(t - Math.min(t, credit(taxable, 1120)), 6);
  });
  it('up to age 25: 0% on the first €20,000', () => {
    const taxable = 28000 * (1 - EFKA);
    const t = scaleTax(taxable, [0, 0, 0.26, 0.34, 0.39, 0.44]);
    expect(calc('GR', 28000, { age: 24 }).incomeTax).toBeCloseTo(t - Math.min(t, credit(taxable)), 6);
  });
  it('age 26–30: 9% on €10,000–20,000', () => {
    const taxable = 28000 * (1 - EFKA);
    const t = scaleTax(taxable, [0.09, 0.09, 0.26, 0.34, 0.39, 0.44]);
    expect(calc('GR', 28000, { age: 28 }).incomeTax).toBeCloseTo(t - Math.min(t, credit(taxable)), 6);
  });
  it('is marked as an estimate (dataset not fully verified)', () => {
    expect(calc('GR', 28000).status).toBe('estimated');
  });
  it('net pay never falls as gross rises', () => expectMonotonic('GR', 0, 200000, 1000));
});

