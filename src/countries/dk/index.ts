import { z } from 'zod';
import { amt, bool, num, pct } from '../../engine/math';
import { money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/** Denmark — personal income tax for employees (A-indkomst). */
export const dkRulesSchema = z.object({
  amBidragRate: rate,
  personalAllowance: money,
  bottomTaxRate: rate,
  middleTax: z.object({ rate, threshold: money }),
  topTax: z.object({ rate, threshold: money }),
  topTopTax: z.object({ rate, threshold: money }),
  /** Ceilings on the combined marginal rate (municipal + state taxes, excl. church tax and AM-bidrag). */
  taxCeiling: z.object({ middle: rate, top: rate, topTop: rate }),
  employmentDeduction: z.object({ rate, max: money }),
  jobDeduction: z.object({ rate, threshold: money, max: money }),
  atp: z.object({ employeeMonthlyFullTime: money }),
  average: z.object({ municipalRate: z.number().min(0).max(100), churchRate: z.number().min(0).max(100) }),
  municipalities: z.array(z.object({ id: z.string(), name: z.string(), municipalRate: z.number().min(0).max(100), churchRate: z.number().min(0).max(100) })).min(1),
});
export type DkRules = z.infer<typeof dkRulesSchema>;

function compute(r: DkRules, ctx: CalcContext): CountryComputation {
  const gross = ctx.grossAnnual;
  const muni = r.municipalities.find((m) => m.id === ctx.location);
  const municipalRate = (muni?.municipalRate ?? r.average.municipalRate) / 100;
  const churchRate = bool(ctx.personal.churchMember, false) ? (muni?.churchRate ?? r.average.churchRate) / 100 : 0;
  const pensionRate = num(ctx.personal.pensionPercent, 0) / 100;

  const atp = Math.min(gross, r.atp.employeeMonthlyFullTime * 12);
  const pension = gross * pensionRate;
  // AM-bidrag is charged on pay after ATP and after the employee's own
  // contribution to an employer-administered pension scheme.
  const amBase = Math.max(0, gross - atp - pension);
  const am = amBase * r.amBidragRate;
  const personalIncome = amBase - am;

  const employmentDeduction = Math.min(amBase * r.employmentDeduction.rate, r.employmentDeduction.max);
  const jobDeduction = Math.min(Math.max(0, amBase - r.jobDeduction.threshold) * r.jobDeduction.rate, r.jobDeduction.max);
  const taxableIncome = Math.max(0, personalIncome - employmentDeduction - jobDeduction);

  // The tax ceiling lowers the state rate where a high municipal rate would
  // otherwise push the combined marginal rate above the statutory cap.
  const middleRate = Math.max(0, r.middleTax.rate - Math.max(0, r.bottomTaxRate + r.middleTax.rate + municipalRate - r.taxCeiling.middle));
  const topRate = Math.max(0, r.topTax.rate - Math.max(0, r.bottomTaxRate + middleRate + r.topTax.rate + municipalRate - r.taxCeiling.top));
  const topTopRate = Math.max(0, r.topTopTax.rate - Math.max(0, r.bottomTaxRate + middleRate + topRate + r.topTopTax.rate + municipalRate - r.taxCeiling.topTop));

  const bottom = Math.max(0, personalIncome - r.personalAllowance) * r.bottomTaxRate;
  const municipalBase = Math.max(0, taxableIncome - r.personalAllowance);
  const municipal = municipalBase * municipalRate;
  const church = municipalBase * churchRate;
  const middle = Math.max(0, personalIncome - r.middleTax.threshold) * middleRate;
  const top = Math.max(0, personalIncome - r.topTax.threshold) * topRate;
  const topTop = Math.max(0, personalIncome - r.topTopTax.threshold) * topTopRate;
  const incomeTax = bottom + municipal + middle + top + topTop;

  const ceilingApplied = middleRate < r.middleTax.rate || topRate < r.topTax.rate || topTopRate < r.topTopTax.rate;
  const where = muni ? muni.name : 'the national average municipality';

  return {
    lines: [
      {
        id: 'income-tax',
        label: 'Income tax (state + municipal)',
        category: 'incomeTax',
        amount: incomeTax,
        details: [
          `Bottom tax ${pct(r.bottomTaxRate)} on personal income above the ${amt(r.personalAllowance)} DKK personal allowance.`,
          `Municipal tax ${pct(municipalRate)} (${where}) on taxable income above the personal allowance.`,
          `Middle tax ${pct(middleRate)} above ${amt(r.middleTax.threshold)} DKK, top tax ${pct(topRate)} above ${amt(r.topTax.threshold)} DKK and top-top tax ${pct(topTopRate)} above ${amt(r.topTopTax.threshold)} DKK of personal income after AM-bidrag.`,
          ...(ceilingApplied ? ['The tax ceiling (skatteloft) reduced a state rate because of the municipal tax rate.'] : []),
        ],
        parts: [
          { label: `Bottom tax (${pct(r.bottomTaxRate)})`, amount: bottom },
          { label: `Municipal tax (${pct(municipalRate)})`, amount: municipal },
          { label: `Middle tax (${pct(middleRate)})`, amount: middle },
          { label: `Top tax (${pct(topRate)})`, amount: top },
          { label: `Top-top tax (${pct(topTopRate)})`, amount: topTop },
        ].filter((p) => p.amount > 0),
      },
      {
        id: 'am-bidrag',
        label: 'Labour market contribution (AM-bidrag)',
        category: 'social',
        amount: am,
        details: [`${pct(r.amBidragRate)} of pay after ATP and own pension contributions (${amt(amBase)} DKK).`],
      },
      {
        id: 'atp',
        label: 'ATP pension contribution',
        category: 'social',
        amount: atp,
        details: [`Fixed employee share of ${r.atp.employeeMonthlyFullTime} DKK per month for full-time work (117+ hours a month).`],
      },
      ...(churchRate > 0
        ? [{ id: 'church-tax', label: 'Church tax', category: 'mandatory' as const, amount: church, details: [`${pct(churchRate)} of taxable income above the personal allowance; only members of the Folkekirke pay it.`] }]
        : []),
      {
        id: 'pension',
        label: 'Employee pension contribution',
        category: 'optional',
        amount: pension,
        details: [`${pct(pensionRate)} of gross pay paid into an employer-administered scheme; it is deducted before AM-bidrag and income tax.`],
      },
    ],
    steps: [
      { label: 'Gross salary', value: gross },
      { label: 'Base for AM-bidrag', value: amBase, note: 'Gross pay minus ATP and own pension contribution' },
      { label: 'Personal income', value: personalIncome, note: 'After 8% AM-bidrag' },
      { label: 'Employment deduction', value: employmentDeduction, note: `${pct(r.employmentDeduction.rate)}, max ${amt(r.employmentDeduction.max)} DKK` },
      { label: 'Job deduction', value: jobDeduction, note: `${pct(r.jobDeduction.rate)} above ${amt(r.jobDeduction.threshold)} DKK, max ${amt(r.jobDeduction.max)} DKK` },
      { label: 'Taxable income', value: taxableIncome },
      { label: 'Personal allowance', value: r.personalAllowance },
    ],
    assumptions: [
      'Full-year tax resident with a full personal allowance and no other income.',
      'Full-time employee (full ATP contribution); no transport, union or interest deductions.',
      muni ? `Municipal rates for ${muni.name}.` : 'National average municipal tax rate.',
    ],
    warnings: [],
  };
}

export const denmark: CountryModule<DkRules> = {
  code: 'DK',
  name: 'Denmark',
  flag: '🇩🇰',
  currency: 'DKK',
  paymentsPerYear: () => 12,
  rulesSchema: dkRulesSchema,
  getSupportedCurrencies: () => ['DKK'],
  getAvailableLocations: (r) => ({
    label: 'Municipality',
    defaultId: 'average',
    options: [
      { id: 'average', label: 'National average', hint: `${r.average.municipalRate}%` },
      ...r.municipalities.map((m) => ({ id: m.id, label: m.name, hint: `${m.municipalRate}%` })),
    ],
  }),
  getRequiredPersonalInputs: () => [
    { key: 'churchMember', type: 'boolean', label: 'Member of the Church of Denmark', help: 'Members pay church tax (about 0.4–1.3% depending on municipality).', default: false, advanced: true },
    { key: 'pensionPercent', type: 'number', label: 'Own pension contribution', help: 'Your share paid into an employer pension scheme, as % of gross pay.', min: 0, max: 30, step: 0.5, default: 0, unit: '%', advanced: true },
  ],
  compute,
};
