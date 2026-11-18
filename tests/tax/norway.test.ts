import { describe, expect, it } from 'vitest';
import { calc, expectMonotonic, line, part } from './helpers';

/** Skatteetaten 2026 rates. */
function reference(gross: number, north = false) {
  const ni = Math.min(gross * 0.076, Math.max(0, gross - 99650) * 0.25);
  const minDed = Math.min(gross * 0.46, 95700);
  const general = Math.max(0, gross - minDed - (north ? 45000 : 0));
  const generalTax = Math.max(0, general - 114540) * (north ? 0.185 : 0.22);
  const steps = [
    [226100, 318300, 0.017],
    [318300, 725050, 0.04],
    [725050, 980100, north ? 0.117 : 0.137],
    [980100, 1467200, 0.168],
    [1467200, Infinity, 0.178],
  ] as const;
  const bracket = steps.reduce((s, [lo, hi, r]) => s + Math.max(0, Math.min(gross, hi) - lo) * r, 0);
  return { ni, tax: generalTax + bracket, net: gross - ni - generalTax - bracket };
}

describe('Norway 2026 — Skatteetaten rates', () => {
  it.each([150000, 226100, 318300, 500000, 725050, 980100, 1467200, 2000000])('gross %i NOK', (g) => {
    const r = calc('NO', g);
    const ref = reference(g);
    expect(r.incomeTax).toBeCloseTo(ref.tax, 6);
    expect(line(r, 'national-insurance')).toBeCloseTo(ref.ni, 6);
  });
  it('700,000 NOK → net 522,217.40', () => expect(calc('NO', 700000).netAnnual).toBeCloseTo(522217.4, 2));
  it('no national insurance below 99,650 and the 25% phase-in above it', () => {
    expect(line(calc('NO', 99000), 'national-insurance')).toBe(0);
    expect(line(calc('NO', 100000), 'national-insurance')).toBeCloseTo(87.5, 6);
  });
  it('minimum deduction is capped at 95,700', () => {
    expect(calc('NO', 600000).steps.find((s) => s.label.startsWith('Minimum'))?.value).toBe(95700);
  });
  it('Finnmark & Nord-Troms zone: 18.5% general rate, 45,000 deduction, lower step 3', () => {
    const r = calc('NO', 900000, {}, 'north');
    expect(r.netAnnual).toBeCloseTo(reference(900000, true).net, 6);
    expect(r.netAnnual).toBeGreaterThan(calc('NO', 900000).netAnnual);
  });
  it('bracket tax step 5 applies above 1,467,200', () => {
    expect(part(calc('NO', 1600000), 'income-tax', 'Step 5')).toBeCloseTo((1600000 - 1467200) * 0.178, 6);
  });
  it('net pay never falls as gross rises', () => expectMonotonic('NO', 0, 2500000, 10000));
});
