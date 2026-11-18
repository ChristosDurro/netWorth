import { describe, expect, it } from 'vitest';
import { basicAllowance, earnedIncomeCredit, sweden, type SeRules } from '../../src/countries/se';
import { calc, expectMonotonic, line, reg } from './helpers';

const rules = reg.getDataset('SE', 2026).rules as SeRules;

/** Worked examples published in Skatteverket's technical description SKV 433 (2026, edition 36). */
describe('Sweden 2026 — Skatteverket SKV 433 examples', () => {
  it('basic allowance example 1: 120,000 SEK → 37,400', () => expect(basicAllowance(rules, 120000)).toBe(37400));
  it('basic allowance example 2: 324,000 SEK → 31,600', () => expect(basicAllowance(rules, 324000)).toBe(31600));
  it('basic allowance limits: 25,100 low, 45,600 max, 17,400 floor', () => {
    expect(basicAllowance(rules, 40000)).toBe(25100);
    expect(basicAllowance(rules, 170000)).toBe(45600);
    expect(basicAllowance(rules, 1000000)).toBe(17400);
  });
  it('general pension fee: 181,200 → 12,700 and maximum 47,100', () => {
    expect(line(calc('SE', 181200), 'pension-fee')).toBe(12700);
    expect(line(calc('SE', 2000000), 'pension-fee')).toBe(47100);
  });

  // Examples 1 and 2 (section 7.5): total tax 2,062 and 4,445 SEK at a 34% combined rate
  // of which 1.16 points are burial and church fees.
  const exampleRules: SeRules = { ...rules, average: { municipalRate: 32.84, burialRate: 0.16, churchRate: 1.0 } };
  const total = (gross: number) => {
    const out = sweden.compute(exampleRules, { grossAnnual: gross, location: 'average', personal: { churchMember: true } });
    return out.lines.reduce((s, l) => s + l.amount, 0);
  };
  it('example 1: income 28,000 → total tax 2,062', () => expect(total(28000)).toBe(2062));
  it('example 2: income 55,000 → total tax 4,445', () => expect(total(55000)).toBe(4445));

  it('tax reduction on earned income: 200,000 taxable → 1,200; above 240,000 → 1,500', () => {
    const credit = (gross: number) => calc('SE', gross).lines.find((l) => l.id === 'income-tax')?.parts?.find((p) => p.label.startsWith('Tax credit on earned'))?.amount;
    // Gross 240,000 → basic allowance 40,000 → taxable 200,000 (Skatteverket example 1).
    expect(basicAllowance(rules, 240000)).toBe(40000);
    expect(credit(240000)).toBe(-1200);
    expect(credit(400000)).toBe(-1500);
  });
  it('public service fee: 1% of taxable income, max 1,184', () => {
    expect(line(calc('SE', 1000000), 'public-service')).toBe(1184);
    const r = calc('SE', 100000);
    expect(line(r, 'public-service')).toBe(Math.floor((100000 - basicAllowance(rules, 100000)) * 0.01));
  });
});

describe('Sweden 2026 — job tax credit (jobbskatteavdrag)', () => {
  it('is zero at no income and capped at 3.027 PBB minus allowance at high income', () => {
    expect(earnedIncomeCredit(rules, 0, 0, 0.32)).toBe(0);
    const high = earnedIncomeCredit(rules, 900000, 17400, 0.3238);
    expect(high).toBe(Math.floor((3.027 * 59200 - 17400) * 0.3238));
  });
});

describe('Sweden 2026 — state tax and municipalities', () => {
  it('state tax only above 643,000 SEK taxable income (brytpunkt 660,400 gross)', () => {
    const at = calc('SE', 660400).lines[0].parts?.find((p) => p.label.startsWith('State tax'));
    expect(at).toBeUndefined();
    const above = calc('SE', 760400).lines[0].parts?.find((p) => p.label.startsWith('State tax'))?.amount;
    expect(above).toBe(Math.floor((760400 - 17400 - 643000) * 0.2));
  });
  it('lower municipal rate gives higher net pay (Stockholm vs. average)', () => {
    expect(calc('SE', 540000, {}, 'stockholm').netAnnual).toBeGreaterThan(calc('SE', 540000).netAnnual);
  });
  it('has rates for all 290 municipalities', () => expect(rules.municipalities).toHaveLength(290));
  it('church fee only for members', () => {
    expect(line(calc('SE', 400000, { churchMember: true }, 'stockholm'), 'church-fee')).toBeGreaterThan(0);
    expect(line(calc('SE', 400000, {}, 'stockholm'), 'church-fee')).toBe(0);
  });
  it('net pay never falls as gross rises', () => expectMonotonic('SE', 0, 1500000, 5000));
});
