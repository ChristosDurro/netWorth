import { z } from 'zod';
import { amt, bool, ceilTo, floorTo, pct } from '../../engine/math';
import { money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/**
 * Sweden — follows Skatteverket's technical description of the preliminary
 * tax tables (SKV 433) for employees under 66.
 */
const pctNum = z.number().min(0).max(100);
export const seRulesSchema = z.object({
  priceBaseAmount: money,
  incomeBaseAmount: money,
  stateTax: z.object({ rate, threshold: money }),
  /** Grundavdrag, all coefficients in price base amounts (PBB). */
  basicAllowance: z.object({
    b1: z.number(), b2: z.number(), b3: z.number(), b4: z.number(),
    low: z.number(), riseRate: rate, high: z.number(), fallRate: rate, floor: z.number(),
  }),
  /** Jobbskatteavdrag, coefficients in PBB. */
  earnedIncomeCredit: z.object({
    b1: z.number(), b2: z.number(), b3: z.number(),
    rate2: rate, base3: z.number(), rate3: rate, max: z.number(),
  }),
  pensionFee: z.object({ rate, ceilingInIncomeBaseAmounts: z.number(), minIncomeInPriceBaseAmounts: z.number() }),
  incomeTaxCredit: z.object({ lower: money, upper: money, rate, max: money }),
  publicServiceFee: z.object({ rate, ceilingInIncomeBaseAmounts: z.number() }),
  average: z.object({ municipalRate: pctNum, burialRate: pctNum, churchRate: pctNum }),
  municipalities: z.array(z.object({ id: z.string(), name: z.string(), municipalRate: pctNum, burialRate: pctNum, churchRate: pctNum })).min(1),
});
export type SeRules = z.infer<typeof seRulesSchema>;

export function basicAllowance(r: SeRules, income: number): number {
  const p = r.priceBaseAmount;
  const b = r.basicAllowance;
  let ga: number;
  if (income <= b.b1 * p) ga = b.low * p;
  else if (income <= b.b2 * p) ga = b.low * p + (income - b.b1 * p) * b.riseRate;
  else if (income <= b.b3 * p) ga = b.high * p;
  else if (income <= b.b4 * p) ga = b.high * p - (income - b.b3 * p) * b.fallRate;
  else ga = b.floor * p;
  return Math.min(income, ceilTo(ga - 1e-9, 100));
}

/** Jobbskatteavdrag before it is limited to the municipal tax available. */
export function earnedIncomeCredit(r: SeRules, workIncome: number, allowance: number, municipalRate: number): number {
  const p = r.priceBaseAmount;
  const c = r.earnedIncomeCredit;
  const ai = floorTo(workIncome, 100);
  let base: number;
  if (ai <= c.b1 * p) base = ai;
  else if (ai <= c.b2 * p) base = c.b1 * p + c.rate2 * (ai - c.b1 * p);
  else if (ai <= c.b3 * p) base = c.base3 * p + c.rate3 * (ai - c.b2 * p);
  else base = c.max * p;
  return Math.max(0, Math.floor((base - allowance) * municipalRate + 1e-9));
}

function compute(r: SeRules, ctx: CalcContext): CountryComputation {
  const gross = ctx.grossAnnual;
  const muni = r.municipalities.find((m) => m.id === ctx.location) ?? null;
  const loc = muni ?? r.average;
  const municipalRate = loc.municipalRate / 100;
  const burialRate = loc.burialRate / 100;
  const churchRate = bool(ctx.personal.churchMember, false) ? loc.churchRate / 100 : 0;

  const income = floorTo(gross, 100);
  const allowance = basicAllowance(r, income);
  const taxable = Math.max(0, income - allowance);

  const municipalTax = Math.floor(taxable * municipalRate);
  const stateTax = Math.floor(Math.max(0, taxable - r.stateTax.threshold) * r.stateTax.rate);

  // General pension fee: fully offset by a tax reduction.
  const feeCeiling = r.pensionFee.ceilingInIncomeBaseAmounts * r.incomeBaseAmount;
  let pensionFee = 0;
  if (gross >= r.pensionFee.minIncomeInPriceBaseAmounts * r.priceBaseAmount) {
    // Round to whole öre first so binary floating point (3850.0000000000005) cannot tip the rounding.
    const raw = Math.round(Math.min(gross, feeCeiling) * r.pensionFee.rate * 100) / 100;
    pensionFee = Math.ceil(raw / 100 - 0.5) * 100; // nearest 100, a trailing 50 rounds down
  }
  const pensionCredit = Math.min(pensionFee, municipalTax + stateTax);

  // Remaining credits may only reduce municipal income tax.
  let municipalLeft = Math.max(0, municipalTax - Math.max(0, pensionCredit - stateTax));
  const eicFull = earnedIncomeCredit(r, gross, allowance, municipalRate);
  const eic = Math.min(eicFull, municipalLeft);
  municipalLeft -= eic;
  const c = r.incomeTaxCredit;
  const incomeCreditFull = taxable <= c.lower ? 0 : taxable >= c.upper ? c.max : Math.floor((taxable - c.lower) * c.rate);
  const incomeCredit = Math.min(incomeCreditFull, municipalLeft);

  const publicService = Math.floor(Math.min(taxable, r.publicServiceFee.ceilingInIncomeBaseAmounts * r.incomeBaseAmount) * r.publicServiceFee.rate);
  const burial = Math.floor(taxable * burialRate);
  const church = Math.floor(taxable * churchRate);

  const incomeTax = municipalTax + stateTax - pensionCredit - eic - incomeCredit;
  const where = muni ? muni.name : 'the national average';

  return {
    lines: [
      {
        id: 'income-tax',
        label: 'Income tax (municipal + state)',
        category: 'incomeTax',
        amount: incomeTax,
        details: [
          `Municipal and regional tax ${pct(municipalRate)} (${where}) on taxable income of ${amt(taxable)} SEK.`,
          `State tax ${pct(r.stateTax.rate)} on taxable income above ${amt(r.stateTax.threshold)} SEK.`,
          'Reduced by the earned-income tax credit (jobbskatteavdrag), the credit for the general pension fee and the general credit on earned income.',
        ],
        parts: [
          { label: `Municipal tax (${pct(municipalRate)})`, amount: municipalTax },
          { label: `State tax (${pct(r.stateTax.rate)})`, amount: stateTax },
          { label: 'Credit for general pension fee', amount: -pensionCredit },
          { label: 'Earned-income tax credit (jobbskatteavdrag)', amount: -eic },
          { label: 'Tax credit on earned income', amount: -incomeCredit },
        ].filter((p) => p.amount !== 0),
      },
      {
        id: 'pension-fee',
        label: 'General pension fee',
        category: 'social',
        amount: pensionFee,
        details: [`${pct(r.pensionFee.rate)} of pay up to ${amt(feeCeiling)} SEK, rounded to the nearest 100 SEK. It is refunded in full through the income-tax credit above.`],
      },
      {
        id: 'public-service',
        label: 'Public service fee',
        category: 'mandatory',
        amount: publicService,
        details: [`${pct(r.publicServiceFee.rate)} of taxable income, capped at ${amt(Math.floor(r.publicServiceFee.ceilingInIncomeBaseAmounts * r.incomeBaseAmount * r.publicServiceFee.rate))} SEK a year.`],
      },
      {
        id: 'burial-fee',
        label: 'Burial fee',
        category: 'mandatory',
        amount: burial,
        details: [`${pct(burialRate, 3)} of taxable income (${where}); everyone registered in Sweden pays it.`],
      },
      ...(churchRate > 0 ? [{ id: 'church-fee', label: 'Church fee', category: 'mandatory' as const, amount: church, details: [`${pct(churchRate, 3)} of taxable income; average across parishes in ${where}. Only members pay it.`] }] : []),
    ],
    steps: [
      { label: 'Gross salary', value: gross },
      { label: 'Basic allowance (grundavdrag)', value: allowance, note: 'Depends on income; rounded up to the next 100 SEK' },
      { label: 'Taxable income', value: taxable },
      { label: 'Earned-income tax credit', value: eic },
    ],
    assumptions: [
      'Under 66 at the start of the year, resident in Sweden all year, employment income only.',
      muni ? `Tax rates for ${muni.name}.` : 'National average municipal tax rate.',
      'No deductions for commuting, interest or private pension.',
    ],
    warnings: [],
  };
}

export const sweden: CountryModule<SeRules> = {
  code: 'SE',
  name: 'Sweden',
  flag: '🇸🇪',
  currency: 'SEK',
  paymentsPerYear: () => 12,
  rulesSchema: seRulesSchema,
  getSupportedCurrencies: () => ['SEK'],
  getAvailableLocations: (r) => ({
    label: 'Municipality',
    defaultId: 'average',
    options: [
      { id: 'average', label: 'National average', hint: `${r.average.municipalRate}%` },
      ...r.municipalities.map((m) => ({ id: m.id, label: m.name, hint: `${m.municipalRate}%` })),
    ],
  }),
  getRequiredPersonalInputs: () => [
    { key: 'churchMember', type: 'boolean', label: 'Member of the Church of Sweden', help: 'Members pay a church fee of roughly 1% of taxable income.', default: false, advanced: true },
  ],
  compute,
};
