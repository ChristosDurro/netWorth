import { z } from 'zod';
import { amt, num, pct } from '../../engine/math';
import { money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/** Norway — tax on general income, bracket tax (trinnskatt) and national insurance. */
export const noRulesSchema = z.object({
  generalIncomeRate: rate,
  personalAllowance: money,
  minimumDeduction: z.object({ rate, max: money }),
  nationalInsurance: z.object({ rate, lowerLimit: money, phaseInRate: rate }),
  /** Bracket tax on gross personal income: each step applies above its threshold. */
  bracketTax: z.array(z.object({ threshold: money, rate })).min(1),
  northernZone: z.object({ generalIncomeRate: rate, specialDeduction: money, step3Rate: rate }),
  regions: z.array(z.object({ id: z.string(), name: z.string(), northernZone: z.boolean() })).min(1),
});
export type NoRules = z.infer<typeof noRulesSchema>;

function compute(r: NoRules, ctx: CalcContext): CountryComputation {
  const gross = ctx.grossAnnual;
  const region = r.regions.find((x) => x.id === ctx.location) ?? r.regions[0];
  const north = region.northernZone;
  const pensionRate = num(ctx.personal.pensionPercent, 0) / 100;
  const pension = gross * pensionRate;

  const ni = r.nationalInsurance;
  const insurance = Math.min(gross * ni.rate, Math.max(0, gross - ni.lowerLimit) * ni.phaseInRate);

  const minimumDeduction = Math.min(gross * r.minimumDeduction.rate, r.minimumDeduction.max);
  const special = north ? r.northernZone.specialDeduction : 0;
  const generalIncome = Math.max(0, gross - minimumDeduction - pension - special);
  const generalRate = north ? r.northernZone.generalIncomeRate : r.generalIncomeRate;
  const generalTax = Math.max(0, generalIncome - r.personalAllowance) * generalRate;

  const steps = r.bracketTax.map((s, i) => {
    const upper = r.bracketTax[i + 1]?.threshold ?? Infinity;
    const stepRate = north && i === 2 ? r.northernZone.step3Rate : s.rate;
    return { label: `Step ${i + 1} (${pct(stepRate)} above ${amt(s.threshold)} NOK)`, amount: Math.max(0, Math.min(gross, upper) - s.threshold) * stepRate };
  });
  const bracketTax = steps.reduce((sum, s) => sum + s.amount, 0);

  return {
    lines: [
      {
        id: 'income-tax',
        label: 'Income tax',
        category: 'incomeTax',
        amount: generalTax + bracketTax,
        details: [
          `${pct(generalRate)} on general income (${amt(generalIncome)} NOK) above the ${amt(r.personalAllowance)} NOK personal allowance.`,
          'Bracket tax (trinnskatt) is charged on gross pay, with no deductions.',
        ],
        parts: [{ label: `Tax on general income (${pct(generalRate)})`, amount: generalTax }, ...steps].filter((p) => p.amount > 0),
      },
      {
        id: 'national-insurance',
        label: 'National insurance (trygdeavgift)',
        category: 'social',
        amount: insurance,
        details: [`${pct(ni.rate)} of gross pay. Nothing is due below ${amt(ni.lowerLimit)} NOK, and the charge never exceeds ${pct(ni.phaseInRate)} of pay above that limit.`],
      },
      {
        id: 'pension',
        label: 'Employee pension contribution',
        category: 'optional',
        amount: pension,
        details: [`${pct(pensionRate)} of gross pay into the occupational scheme; it reduces general income but not the base for bracket tax or national insurance.`],
      },
    ],
    steps: [
      { label: 'Gross salary', value: gross },
      { label: 'Minimum deduction (minstefradrag)', value: minimumDeduction, note: `${pct(r.minimumDeduction.rate)}, max ${amt(r.minimumDeduction.max)} NOK` },
      ...(north ? [{ label: 'Northern zone deduction', value: special }] : []),
      { label: 'General income', value: generalIncome },
      { label: 'Personal allowance', value: r.personalAllowance },
    ],
    assumptions: [
      'Aged 17–69, tax resident all year under the ordinary scheme (not PAYE/kildeskatt på lønn).',
      'Only the standard minimum deduction; no interest, commuting or union-fee deductions.',
      'Holiday pay is treated as part of annual salary. Employers usually withhold no tax in the holiday-pay month and half tax in December, so monthly payslips differ from the annual average.',
    ],
    warnings: [],
  };
}

export const norway: CountryModule<NoRules> = {
  code: 'NO',
  name: 'Norway',
  flag: '🇳🇴',
  currency: 'NOK',
  paymentsPerYear: () => 12,
  rulesSchema: noRulesSchema,
  getSupportedCurrencies: () => ['NOK'],
  getAvailableLocations: (r) => ({ label: 'Region', defaultId: r.regions[0].id, options: r.regions.map((x) => ({ id: x.id, label: x.name })) }),
  getRequiredPersonalInputs: () => [
    { key: 'pensionPercent', type: 'number', label: 'Own pension contribution', help: 'Employee share of the occupational pension (often 0–2%), as % of gross pay.', min: 0, max: 15, step: 0.5, default: 0, unit: '%', advanced: true },
  ],
  compute,
};
