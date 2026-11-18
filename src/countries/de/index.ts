import { z } from 'zod';
import { amt, bool, num, pct, str } from '../../engine/math';
import { money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/**
 * Germany — wage tax (Lohnsteuer) following the Federal Ministry of Finance's
 * "Programmablaufplan" (PAP) for the year, plus statutory social insurance.
 */
export const deRulesSchema = z.object({
  tariff: z.object({
    /** §32a EStG zone boundaries and coefficients. */
    basicAllowance: money,
    zone2End: money,
    zone3End: money,
    zone4End: money,
    zone2: z.object({ a: z.number(), b: z.number() }),
    zone3: z.object({ a: z.number(), b: z.number(), c: z.number() }),
    zone4: z.object({ rate, subtract: z.number() }),
    zone5: z.object({ rate, subtract: z.number() }),
  }),
  /** Thresholds of the special class V/VI procedure (PAP: W1STKL5…W3STKL5). */
  classVvi: z.object({ w1: money, w2: money, w3: money, minRate: rate, midRate: rate, topRate: rate }),
  allowances: z.object({
    employeeLumpSum: money,
    specialExpensesLumpSum: money,
    singleParentRelief: money,
    childAllowance: money,
  }),
  solidarity: z.object({ rate, exemptionLimit: money, phaseInRate: rate }),
  social: z.object({
    pension: z.object({ employeeRate: rate, ceiling: money }),
    unemployment: z.object({ employeeRate: rate, ceiling: money }),
    health: z.object({ employeeRate: rate, reducedEmployeeRate: rate, averageAdditionalRate: rate, ceiling: money }),
    care: z.object({ employeeRate: rate, employeeRateSaxony: rate, childlessSurcharge: rate, childDiscountPerChild: rate, maxDiscountedChildren: z.number().int(), ceiling: money }),
  }),
  provisionCap: money,
  miniJobMonthlyLimit: money,
  midiJobMonthlyLimit: money,
  states: z.array(z.object({ id: z.string(), name: z.string(), churchTaxRate: rate, saxonyCare: z.boolean() })).min(1),
});
export type DeRules = z.infer<typeof deRulesSchema>;

/** Basic income-tax tariff, §32a EStG (PAP: UPTAB). Result in whole euros. */
export function tariff(r: DeRules, x: number): number {
  const t = r.tariff;
  if (x <= t.basicAllowance) return 0;
  if (x <= t.zone2End) {
    const y = (x - t.basicAllowance) / 10000;
    return Math.floor((t.zone2.a * y + t.zone2.b) * y);
  }
  if (x <= t.zone3End) {
    const z2 = (x - t.zone2End) / 10000;
    return Math.floor((t.zone3.a * z2 + t.zone3.b) * z2 + t.zone3.c);
  }
  if (x <= t.zone4End) return Math.floor(x * t.zone4.rate - t.zone4.subtract);
  return Math.floor(x * t.zone5.rate - t.zone5.subtract);
}

/** Wage tax for classes V and VI (PAP: MST5-6 / UP5-6). */
function classVviTax(r: DeRules, x: number): number {
  const c = r.classVvi;
  const up = (zx: number): number => {
    const diff = (tariff(r, zx * 1.25) - tariff(r, zx * 0.75)) * 2;
    return Math.max(Math.floor(zx * c.minRate), diff);
  };
  if (x > c.w2) {
    let st = up(c.w2);
    if (x > c.w3) st += (c.w3 - c.w2) * c.midRate + (x - c.w3) * c.topRate;
    else st += (x - c.w2) * c.midRate;
    return Math.floor(st);
  }
  let st = up(x);
  if (x > c.w1) {
    const high = up(c.w1) + (x - c.w1) * c.midRate;
    st = Math.min(st, Math.floor(high));
  }
  return st;
}

function wageTax(r: DeRules, taxClass: number, zve: number): number {
  if (taxClass === 5 || taxClass === 6) return classVviTax(r, Math.floor(zve));
  const split = taxClass === 3 ? 2 : 1;
  return tariff(r, Math.floor(zve / split)) * split;
}

function compute(r: DeRules, ctx: CalcContext): CountryComputation {
  const gross = ctx.grossAnnual;
  const state = r.states.find((s) => s.id === ctx.location) ?? r.states[0];
  const taxClass = Number(str(ctx.personal.taxClass, '1'));
  const children = num(ctx.personal.children, 0);
  const age = num(ctx.personal.age, 30);
  const churchMember = bool(ctx.personal.churchMember, false);
  const additionalRate = num(ctx.personal.healthAdditionalRate, r.social.health.averageAdditionalRate * 100) / 100;
  const s = r.social;

  // --- Social insurance (employee shares) ---
  const pensionBase = Math.min(gross, s.pension.ceiling);
  const healthBase = Math.min(gross, s.health.ceiling);
  const pension = pensionBase * s.pension.employeeRate;
  const unemployment = Math.min(gross, s.unemployment.ceiling) * s.unemployment.employeeRate;
  const healthRate = s.health.employeeRate + additionalRate / 2;
  const health = healthBase * healthRate;
  let careRate = state.saxonyCare ? s.care.employeeRateSaxony : s.care.employeeRate;
  if (children === 0 && age >= 23) careRate += s.care.childlessSurcharge;
  if (children >= 2) careRate -= Math.min(children - 1, s.care.maxDiscountedChildren) * s.care.childDiscountPerChild;
  const care = Math.min(gross, s.care.ceiling) * careRate;

  // --- Vorsorgepauschale (PAP: UPEVP, MVSPKVPV, MVSPHB) ---
  const vspPension = pensionBase * s.pension.employeeRate;
  const vspHealthCare = healthBase * (s.health.reducedEmployeeRate + additionalRate / 2 + careRate);
  let provision = vspPension + vspHealthCare;
  if (taxClass !== 6) {
    const capped = Math.min(r.provisionCap, pensionBase * s.unemployment.employeeRate + vspHealthCare);
    provision = Math.max(provision, vspPension + capped);
  }
  provision = Math.ceil(provision - 1e-9);

  // --- Taxable income for wage tax ---
  const a = r.allowances;
  const lumpSums = taxClass === 6 ? 0 : a.employeeLumpSum + a.specialExpensesLumpSum + (taxClass === 2 ? a.singleParentRelief : 0);
  const zve = Math.max(0, Math.floor(gross - lumpSums - provision));
  const lohnsteuer = wageTax(r, taxClass, zve);

  // Child allowances do not change monthly wage tax, only the base for the
  // solidarity surcharge and church tax (PAP: ZKF / JBMG).
  const childFactor = taxClass === 4 ? 0.5 : taxClass <= 3 ? 1 : 0;
  const baseTax = children > 0 && childFactor > 0 ? wageTax(r, taxClass, Math.max(0, zve - children * a.childAllowance * childFactor)) : lohnsteuer;
  const soliFree = r.solidarity.exemptionLimit * (taxClass === 3 ? 2 : 1);
  const soli = baseTax > soliFree ? Math.floor(Math.min(baseTax * r.solidarity.rate, (baseTax - soliFree) * r.solidarity.phaseInRate) * 100) / 100 : 0;
  const church = churchMember ? Math.floor(baseTax * state.churchTaxRate * 100) / 100 : 0;

  const monthly = gross / 12;
  const warnings: string[] = [];
  if (monthly > 0 && monthly <= r.miniJobMonthlyLimit) warnings.push(`Pay up to €${amt(r.miniJobMonthlyLimit)} a month is normally a Minijob with flat-rate taxation; this calculation assumes regular employment.`);
  else if (monthly > r.miniJobMonthlyLimit && monthly <= r.midiJobMonthlyLimit) warnings.push(`Between €${amt(r.miniJobMonthlyLimit)} and €${amt(r.midiJobMonthlyLimit)} a month (Übergangsbereich) employees pay reduced social contributions. That relief is not modelled, so actual net pay is slightly higher.`);
  if (gross > s.health.ceiling * 1.1) warnings.push('Statutory health insurance is assumed. High earners may opt for private insurance, which changes both contributions and wage tax.');

  return {
    lines: [
      {
        id: 'income-tax',
        label: 'Wage tax (Lohnsteuer)',
        category: 'incomeTax',
        amount: lohnsteuer + soli,
        details: [
          `Tax class ${['I', 'II', 'III', 'IV', 'V', 'VI'][taxClass - 1]}: income-tax tariff (§32a EStG) applied to ${amt(zve)} € taxable income.`,
          `Taxable income = gross pay − ${amt(lumpSums)} € lump-sum allowances − ${amt(provision)} € social-insurance allowance (Vorsorgepauschale).`,
          `Solidarity surcharge ${pct(r.solidarity.rate)} applies only when wage tax exceeds ${amt(soliFree)} €.`,
        ],
        parts: [
          { label: 'Wage tax', amount: lohnsteuer },
          { label: 'Solidarity surcharge', amount: soli },
        ].filter((p) => p.amount > 0),
      },
      {
        id: 'pension',
        label: 'Pension insurance',
        category: 'social',
        amount: pension,
        details: [`${pct(s.pension.employeeRate)} employee share up to ${amt(s.pension.ceiling)} € of annual pay.`],
      },
      {
        id: 'health',
        label: 'Health insurance',
        category: 'social',
        amount: health,
        details: [`${pct(s.health.employeeRate)} plus half of the ${pct(additionalRate)} additional contribution, up to ${amt(s.health.ceiling)} € of annual pay.`],
      },
      {
        id: 'care',
        label: 'Long-term care insurance',
        category: 'social',
        amount: care,
        details: [`${pct(careRate)} employee share (depends on children, age and state) up to ${amt(s.care.ceiling)} € of annual pay.`],
      },
      {
        id: 'unemployment',
        label: 'Unemployment insurance',
        category: 'social',
        amount: unemployment,
        details: [`${pct(s.unemployment.employeeRate)} employee share up to ${amt(s.unemployment.ceiling)} € of annual pay.`],
      },
      ...(churchMember
        ? [{ id: 'church-tax', label: 'Church tax', category: 'mandatory' as const, amount: church, details: [`${pct(state.churchTaxRate)} of wage tax in ${state.name}; only church members pay it.`] }]
        : []),
    ],
    steps: [
      { label: 'Gross salary', value: gross },
      { label: 'Lump-sum allowances', value: lumpSums, note: 'Employee and special-expenses lump sums' },
      { label: 'Vorsorgepauschale', value: provision, note: 'Flat allowance for social-insurance contributions' },
      { label: 'Taxable income (zvE)', value: zve },
    ],
    assumptions: [
      'Statutory health, care, pension and unemployment insurance; no private health insurance.',
      'No personal tax-free amount (Freibetrag) registered with the tax office; no company car or other benefits.',
      `Church tax and care-insurance rules for ${state.name}.`,
      'Wage tax is what the employer withholds; the annual tax return can lead to a refund or an extra payment.',
    ],
    warnings,
  };
}

export const germany: CountryModule<DeRules> = {
  code: 'DE',
  name: 'Germany',
  flag: '🇩🇪',
  currency: 'EUR',
  paymentsPerYear: () => 12,
  rulesSchema: deRulesSchema,
  getSupportedCurrencies: () => ['EUR'],
  getAvailableLocations: (r) => ({
    label: 'Federal state',
    defaultId: r.states[0].id,
    options: r.states.map((s) => ({ id: s.id, label: s.name })),
  }),
  getRequiredPersonalInputs: (r) => [
    {
      key: 'taxClass',
      type: 'select',
      label: 'Tax class (Steuerklasse)',
      help: 'I single · II single parent · III married, higher earner · IV married, similar incomes · V married, lower earner · VI second job.',
      options: [
        { value: '1', label: 'I — single' },
        { value: '2', label: 'II — single parent' },
        { value: '3', label: 'III — married (higher earner)' },
        { value: '4', label: 'IV — married (similar incomes)' },
        { value: '5', label: 'V — married (lower earner)' },
        { value: '6', label: 'VI — second job' },
      ],
      default: '1',
      advanced: true,
    },
    { key: 'children', type: 'number', label: 'Children', help: 'Affects care insurance, solidarity surcharge and church tax.', min: 0, max: 8, step: 1, default: 0, advanced: true },
    { key: 'age', type: 'number', label: 'Age', help: 'Childless employees aged 23+ pay a care-insurance surcharge.', min: 16, max: 80, step: 1, default: 30, advanced: true },
    { key: 'churchMember', type: 'boolean', label: 'Church member (pays church tax)', default: false, advanced: true },
    {
      key: 'healthAdditionalRate',
      type: 'number',
      label: 'Health insurer additional rate',
      help: 'Zusatzbeitrag of your insurer; the default is the official average.',
      min: 0,
      max: 6,
      step: 0.05,
      default: Math.round(r.social.health.averageAdditionalRate * 10000) / 100,
      unit: '%',
      advanced: true,
    },
  ],
  compute,
};
