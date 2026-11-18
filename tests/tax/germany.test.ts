import { describe, expect, it } from 'vitest';
import { tariff, type DeRules } from '../../src/countries/de';
import { calc, expectMonotonic, line, part, reg } from './helpers';

/**
 * Reference values from the official BMF wage-tax calculator interface
 * (bmf-steuerrechner.de, PAP 2026, retrieved 16 Nov 2026) with
 * KVZ=2.90 (average additional health rate), statutory insurance, LZZ=1 (annual).
 */
const BMF: { gross: number; taxClass: string; children: number; age?: number; wageTax: number; soli: number }[] = [
  { gross: 15000, taxClass: '1', children: 0, wageTax: 0, soli: 0 },
  { gross: 24000, taxClass: '1', children: 0, wageTax: 1058, soli: 0 },
  { gross: 30000, taxClass: '1', children: 0, wageTax: 2248, soli: 0 },
  { gross: 60000, taxClass: '1', children: 0, wageTax: 9389, soli: 0 },
  { gross: 120000, taxClass: '1', children: 0, wageTax: 31593, soli: 1337.91 },
  { gross: 300000, taxClass: '1', children: 0, wageTax: 107310, soli: 5902.05 },
  { gross: 500000, taxClass: '1', children: 0, wageTax: 197310, soli: 10852.05 },
  { gross: 50000, taxClass: '2', children: 1, wageTax: 5580, soli: 0 },
  { gross: 60000, taxClass: '3', children: 2, wageTax: 4954, soli: 0 },
  { gross: 90000, taxClass: '4', children: 1, wageTax: 19614, soli: 0 },
  { gross: 40000, taxClass: '5', children: 0, wageTax: 8720, soli: 0 },
  { gross: 30000, taxClass: '6', children: 0, wageTax: 6120, soli: 0 },
];

describe('Germany 2026 — wage tax matches the official BMF calculator', () => {
  it.each(BMF)('€$gross, class $taxClass, $children children → LSt €$wageTax, Soli €$soli', (c) => {
    const r = calc('DE', c.gross, { taxClass: c.taxClass, children: c.children, age: 30 });
    expect(part(r, 'income-tax', 'Wage tax')).toBeCloseTo(c.wageTax, 2);
    expect(part(r, 'income-tax', 'Solidarity')).toBeCloseTo(c.soli, 2);
  });
});

describe('Germany 2026 — income-tax tariff (§32a EStG)', () => {
  const rules = reg.getDataset('DE', 2026).rules as DeRules;
  it('is zero up to the basic allowance of €12,348', () => {
    expect(tariff(rules, 12348)).toBe(0);
    expect(tariff(rules, 12349)).toBe(0);
    expect(tariff(rules, 12400)).toBeGreaterThan(0);
  });
  it('is continuous at every zone boundary', () => {
    for (const b of [17799, 69878, 277825]) expect(Math.abs(tariff(rules, b + 1) - tariff(rules, b))).toBeLessThanOrEqual(1);
  });
  it('applies 42% and 45% top rates', () => {
    expect(tariff(rules, 100001) - tariff(rules, 100000)).toBeCloseTo(0.42, 0);
    expect(tariff(rules, 400100) - tariff(rules, 400000)).toBe(45);
  });
});

describe('Germany 2026 — social insurance', () => {
  it('charges employee shares below the ceilings', () => {
    const r = calc('DE', 48000, { age: 30 });
    expect(line(r, 'pension')).toBeCloseTo(48000 * 0.093, 6);
    expect(line(r, 'unemployment')).toBeCloseTo(48000 * 0.013, 6);
    expect(line(r, 'health')).toBeCloseTo(48000 * (0.073 + 0.0145), 6);
    expect(line(r, 'care')).toBeCloseTo(48000 * (0.018 + 0.006), 6); // childless 23+ surcharge
  });
  it('caps contributions at the 2026 ceilings (€101,400 pension, €69,750 health)', () => {
    const r = calc('DE', 200000, { age: 30 });
    expect(line(r, 'pension')).toBeCloseTo(101400 * 0.093, 6);
    expect(line(r, 'health')).toBeCloseTo(69750 * 0.0875, 6);
  });
  it('removes the childless surcharge and gives the child discount', () => {
    const none = line(calc('DE', 50000, { age: 30, children: 0 }), 'care');
    const one = line(calc('DE', 50000, { age: 30, children: 1 }), 'care');
    const three = line(calc('DE', 50000, { age: 30, children: 3 }), 'care');
    expect(none - one).toBeCloseTo(50000 * 0.006, 6);
    expect(one - three).toBeCloseTo(50000 * 0.005, 6);
  });
  it('uses the higher care rate in Saxony', () => {
    expect(line(calc('DE', 50000, { children: 1 }, 'sn'), 'care') - line(calc('DE', 50000, { children: 1 }, 'be'), 'care')).toBeCloseTo(50000 * 0.005, 6);
  });
});

describe('Germany 2026 — church tax and options', () => {
  it('charges 9% of wage tax (8% in Bavaria) only for church members', () => {
    const be = calc('DE', 60000, { churchMember: true }, 'be');
    expect(line(be, 'church-tax')).toBeCloseTo(9389 * 0.09, 2);
    expect(line(calc('DE', 60000, { churchMember: true }, 'by'), 'church-tax')).toBeCloseTo(9389 * 0.08, 2);
    expect(line(calc('DE', 60000, {}, 'be'), 'church-tax')).toBe(0);
  });
  it('warns in the mini-job and transition zones', () => {
    expect(calc('DE', 6000).warnings.join(' ')).toMatch(/Minijob/);
    expect(calc('DE', 20000).warnings.join(' ')).toMatch(/Übergangsbereich/);
  });
  it('net pay never falls as gross rises', () => expectMonotonic('DE', 0, 300000, 1500));
});
