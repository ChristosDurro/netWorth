import { z } from 'zod';
import { amt, bool, num, pct, progressiveTax } from '../../engine/math';
import { bracketsSchema, money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/** Netherlands — box 1 wage tax and national insurance for employees below state-pension age. */
export const nlRulesSchema = z.object({
  /** Combined income tax + national insurance (volksverzekeringen) rates. */
  brackets: bracketsSchema,
  /** Share of the first-bracket rate that is national insurance (AOW, Anw, Wlz). */
  nationalInsuranceRate: rate,
  generalCredit: z.object({ max: money, phaseOutStart: money, phaseOutRate: rate, phaseOutEnd: money }),
  /** Labour credit: piecewise linear in labour income. */
  labourCredit: z.array(z.object({ upTo: money.nullable(), base: z.number(), rate: z.number(), from: money })).min(1),
  holidayAllowanceRate: rate,
  expatRuling: z.object({ taxFreeShare: rate, salaryCap: money, minTaxableSalary: money, minTaxableSalaryUnder30: money }),
});
export type NlRules = z.infer<typeof nlRulesSchema>;

export function generalCredit(r: NlRules, income: number): number {
  const g = r.generalCredit;
  if (income <= g.phaseOutStart) return g.max;
  if (income >= g.phaseOutEnd) return 0;
  return Math.max(0, g.max - (income - g.phaseOutStart) * g.phaseOutRate);
}

/** Bands follow the Belastingdienst table: "vanaf X tot Y" — the upper bound belongs to the next band. */
export function labourCredit(r: NlRules, labourIncome: number): number {
  for (const band of r.labourCredit) {
    if (band.upTo === null || labourIncome < band.upTo) return Math.max(0, band.base + (labourIncome - band.from) * band.rate);
  }
  return 0;
}

function compute(r: NlRules, ctx: CalcContext): CountryComputation {
  const extraHoliday = bool(ctx.personal.addHolidayAllowance, false);
  const gross = extraHoliday ? ctx.grossAnnual * (1 + r.holidayAllowanceRate) : ctx.grossAnnual;
  const pensionRate = num(ctx.personal.pensionPercent, 0) / 100;
  const ruling = bool(ctx.personal.expatRuling, false);

  const pension = gross * pensionRate;
  const afterPension = gross - pension;
  const taxFree = ruling ? Math.min(afterPension, r.expatRuling.salaryCap) * r.expatRuling.taxFreeShare : 0;
  const taxable = Math.max(0, Math.floor(afterPension - taxFree));

  const scale = progressiveTax(taxable, r.brackets);
  const firstBandEnd = r.brackets[0].upTo ?? Infinity;
  const insuranceBeforeCredits = Math.min(taxable, firstBandEnd) * r.nationalInsuranceRate;
  const general = generalCredit(r, taxable);
  const labour = labourCredit(r, taxable);
  const credits = Math.min(scale.total, general + labour);
  const due = scale.total - credits;
  // Credits reduce tax and premiums proportionally.
  const insurance = scale.total > 0 ? due * (insuranceBeforeCredits / scale.total) : 0;
  const tax = due - insurance;

  const warnings: string[] = [];
  if (ruling && taxable < r.expatRuling.minTaxableSalary) {
    warnings.push(`The 30% ruling requires a taxable salary of at least €${amt(r.expatRuling.minTaxableSalary)} (€${amt(r.expatRuling.minTaxableSalaryUnder30)} under 30 with a master's degree). This salary may not qualify.`);
  }

  return {
    grossAnnual: gross,
    lines: [
      {
        id: 'income-tax',
        label: 'Wage tax (loonbelasting)',
        category: 'incomeTax',
        amount: tax,
        details: [
          `Box 1 rates: ${r.brackets.map((b) => `${pct(b.rate)}${b.upTo ? ` up to €${amt(b.upTo)}` : ' above'}`).join(', ')} (first-bracket rate includes ${pct(r.nationalInsuranceRate)} national insurance, shown separately).`,
          `Reduced by the general tax credit (€${amt(general)}) and the labour tax credit (€${amt(labour)}).`,
        ],
        parts: [
          ...scale.bands.map((b) => ({ label: `Box 1 at ${pct(b.rate)}`, amount: b.amount })).filter((p) => p.amount > 0),
          { label: 'National insurance share (shown below)', amount: -insuranceBeforeCredits },
          { label: 'Tax credits (income-tax share)', amount: -(scale.total - insuranceBeforeCredits - tax) },
        ].filter((p) => Math.abs(p.amount) > 0.005),
      },
      {
        id: 'national-insurance',
        label: 'National insurance (AOW, Anw, Wlz)',
        category: 'social',
        amount: insurance,
        details: [`${pct(r.nationalInsuranceRate)} of taxable pay up to €${amt(firstBandEnd)}, after its share of the tax credits. Employee insurance (WW, WIA) and the health-care levy (Zvw) are paid by the employer.`],
      },
      {
        id: 'pension',
        label: 'Employee pension contribution',
        category: 'optional',
        amount: pension,
        details: [`${pct(pensionRate)} of gross pay; pension premiums are deducted before wage tax.`],
      },
    ],
    steps: [
      { label: 'Gross salary', value: gross, note: extraHoliday ? `Includes ${pct(r.holidayAllowanceRate)} holiday allowance added on top` : 'Assumed to include holiday allowance' },
      ...(ruling ? [{ label: '30% ruling tax-free allowance', value: taxFree, note: `${pct(r.expatRuling.taxFreeShare)} of pay up to €${amt(r.expatRuling.salaryCap)}` }] : []),
      { label: 'Taxable wage', value: taxable },
      { label: 'Tax and premiums before credits', value: scale.total },
      { label: 'General tax credit', value: general },
      { label: 'Labour tax credit', value: labour },
    ],
    assumptions: [
      'Below state-pension (AOW) age for the whole year; tax resident with the wage-tax credits applied by this employer.',
      extraHoliday ? 'An 8% holiday allowance is paid on top of the salary entered.' : 'The salary entered already includes the 8% holiday allowance.',
      'Statutory basic health insurance is bought privately and is not a payroll deduction.',
    ],
    warnings,
  };
}

export const netherlands: CountryModule<NlRules> = {
  code: 'NL',
  name: 'Netherlands',
  flag: '🇳🇱',
  currency: 'EUR',
  paymentsPerYear: () => 12,
  rulesSchema: nlRulesSchema,
  getSupportedCurrencies: () => ['EUR'],
  getAvailableLocations: () => null,
  getRequiredPersonalInputs: (r) => [
    { key: 'addHolidayAllowance', type: 'boolean', label: 'Add 8% holiday allowance on top', help: 'Turn on if the salary you entered excludes vakantiegeld, as most Dutch job adverts do.', default: false, advanced: true },
    { key: 'expatRuling', type: 'boolean', label: '30% ruling (expat tax facility)', help: `Makes ${Math.round(r.expatRuling.taxFreeShare * 100)}% of pay tax-free for qualifying recruits from abroad.`, default: false, advanced: true },
    { key: 'pensionPercent', type: 'number', label: 'Own pension contribution', help: 'Your share of the pension premium, as % of gross pay.', min: 0, max: 30, step: 0.5, default: 0, unit: '%', advanced: true },
  ],
  compute,
};
