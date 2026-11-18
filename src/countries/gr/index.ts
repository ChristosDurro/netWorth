import { z } from 'zod';
import { amt, num, pct, progressiveTax, str } from '../../engine/math';
import { bracketsSchema, money, rate } from '../../engine/schema';
import type { CalcContext, CountryComputation, CountryModule } from '../../engine/types';

/** Greece — employment income scale (art. 15 ITC), tax reduction (art. 16) and e-EFKA contributions. */
export const grRulesSchema = z.object({
  /** Scale per number of dependent children: index 0 = none … last entry = that many or more. */
  scalesByChildren: z.array(bracketsSchema).min(1),
  /** Lower rates for young employees, applied up to `upTo` of taxable income when lower than the family scale. */
  youthRelief: z.array(z.object({ maxAge: z.number().int(), upTo: money, rate })),
  taxCredit: z.object({
    byChildren: z.array(money).min(1),
    perExtraChild: money,
    phaseOutThreshold: money,
    phaseOutPerThousand: money,
    noPhaseOutFromChildren: z.number().int(),
  }),
  socialSecurity: z.object({ employeeRate: rate, monthlyCeiling: money }),
  defaultPaymentsPerYear: z.number().int(),
});
export type GrRules = z.infer<typeof grRulesSchema>;

const payments = (v: unknown): number => (str(v, '14') === '12' ? 12 : 14);

function compute(r: GrRules, ctx: CalcContext): CountryComputation {
  const gross = ctx.grossAnnual;
  const children = num(ctx.personal.children, 0);
  const age = num(ctx.personal.age, 35);
  const perYear = payments(ctx.personal.salaryPayments);

  const ss = r.socialSecurity;
  const insurableCeiling = ss.monthlyCeiling * perYear;
  const efka = Math.min(gross, insurableCeiling) * ss.employeeRate;
  const taxable = Math.max(0, gross - efka);

  const family = r.scalesByChildren[Math.min(children, r.scalesByChildren.length - 1)];
  const youth = r.youthRelief.filter((y) => age <= y.maxAge).sort((a, b) => a.maxAge - b.maxAge)[0];
  // Young employees get the lower of the youth rate and the family rate on each band.
  const scale = youth
    ? family.map((b, i) => {
        const lower = i === 0 ? 0 : (family[i - 1].upTo as number);
        return lower < youth.upTo ? { ...b, rate: Math.min(b.rate, youth.rate) } : b;
      })
    : family;
  const scaleTax = progressiveTax(taxable, scale);

  const tc = r.taxCredit;
  const baseCredit = children < tc.byChildren.length ? tc.byChildren[children] : tc.byChildren[tc.byChildren.length - 1] + (children - tc.byChildren.length + 1) * tc.perExtraChild;
  const phaseOut = children >= tc.noPhaseOutFromChildren ? 0 : (Math.max(0, taxable - tc.phaseOutThreshold) / 1000) * tc.phaseOutPerThousand;
  const credit = Math.min(scaleTax.total, Math.max(0, baseCredit - phaseOut));
  const tax = scaleTax.total - credit;

  const maxModelled = r.scalesByChildren.length - 1;
  return {
    lines: [
      {
        id: 'income-tax',
        label: 'Income tax',
        category: 'incomeTax',
        amount: tax,
        details: [
          `Employment-income scale for ${children === 0 ? 'no dependent children' : `${children} dependent child${children > 1 ? 'ren' : ''}`}${youth ? `, with the reduced rate for employees aged up to ${youth.maxAge}` : ''}, applied to pay after social security (${amt(taxable)} €).`,
          `Tax reduction of ${amt(baseCredit)} €, lowered by ${tc.phaseOutPerThousand} € for every 1,000 € of income above ${amt(tc.phaseOutThreshold)} €.`,
        ],
        parts: [
          ...scaleTax.bands.map((b) => ({ label: `${pct(b.rate)} band from ${amt(b.from)} €`, amount: b.amount })).filter((p) => p.amount > 0),
          { label: 'Tax reduction (art. 16)', amount: -credit },
        ].filter((p) => p.amount !== 0),
      },
      {
        id: 'efka',
        label: 'Social security (e-EFKA)',
        category: 'social',
        amount: efka,
        details: [`${pct(ss.employeeRate)} employee share (main pension, supplementary pension, health and unemployment) on pay up to ${amt(ss.monthlyCeiling)} € per salary payment.`],
      },
    ],
    steps: [
      { label: 'Gross salary', value: gross, note: `${perYear} salary payments a year` },
      { label: 'Social security', value: efka },
      { label: 'Taxable income', value: taxable },
      { label: 'Tax by scale', value: scaleTax.total },
      { label: 'Tax reduction', value: credit },
    ],
    assumptions: [
      perYear === 14 ? 'Private-sector pay in 14 instalments: 12 monthly salaries plus Christmas, Easter and holiday bonuses.' : '12 salary payments a year.',
      'Standard private-sector employee insured with e-EFKA; no heavy-work or special-fund supplements.',
      'Tax resident with enough electronic spending to keep the full tax reduction.',
    ],
    warnings: children > maxModelled ? [`The scale for ${maxModelled} children is used; larger families get further rate reductions that are not modelled.`] : [],
    estimated: children > maxModelled,
  };
}

export const greece: CountryModule<GrRules> = {
  code: 'GR',
  name: 'Greece',
  flag: '🇬🇷',
  currency: 'EUR',
  paymentsPerYear: (p) => payments(p.salaryPayments),
  rulesSchema: grRulesSchema,
  getSupportedCurrencies: () => ['EUR'],
  getAvailableLocations: () => null,
  getRequiredPersonalInputs: (r) => [
    {
      key: 'salaryPayments',
      type: 'select',
      label: 'Salary payments per year',
      help: 'Private-sector employees receive 14 salaries; a monthly figure is multiplied accordingly.',
      options: [
        { value: '14', label: '14 (private sector)' },
        { value: '12', label: '12' },
      ],
      default: String(r.defaultPaymentsPerYear),
      advanced: false,
    },
    { key: 'age', type: 'number', label: 'Age', help: 'Employees up to 25 and 26–30 pay reduced rates on the first €20,000.', min: 16, max: 80, step: 1, default: 35, advanced: true },
    { key: 'children', type: 'number', label: 'Dependent children', help: 'Lower tax rates and a larger tax reduction apply with children.', min: 0, max: 8, step: 1, default: 0, advanced: true },
  ],
  compute,
};
