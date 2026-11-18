import { z } from 'zod';
import { amt, pct, progressiveTax } from './math';
import { bracketsSchema, money, rate } from './schema';
import type { CountryModule } from './types';

/**
 * Starting point for newly scaffolded countries: a progressive income tax with
 * a personal allowance plus flat employee contributions with optional ceilings.
 * Replace it with a dedicated module once the country's rules are researched.
 */
export const genericRulesSchema = z.object({
  incomeTax: z.object({
    /** Deducted from taxable income before the brackets. */
    personalAllowance: money,
    brackets: bracketsSchema,
    /** Flat credit subtracted from the computed tax (not below zero). */
    taxCredit: money,
  }),
  contributions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      rate,
      /** Annual pay above which no contribution is due; null = no ceiling. */
      ceiling: money.nullable(),
      /** Whether the contribution reduces taxable income. */
      deductible: z.boolean(),
    }),
  ),
});
export type GenericRules = z.infer<typeof genericRulesSchema>;

export function createGenericModule(def: { code: string; name: string; currency: string; flag?: string }): CountryModule<GenericRules> {
  return {
    code: def.code,
    name: def.name,
    flag: def.flag ?? def.code,
    currency: def.currency,
    paymentsPerYear: () => 12,
    rulesSchema: genericRulesSchema,
    getSupportedCurrencies: () => [def.currency],
    getAvailableLocations: () => null,
    getRequiredPersonalInputs: () => [],
    compute(r, ctx) {
      const gross = ctx.grossAnnual;
      const contribs = r.contributions.map((c) => ({ ...c, amount: Math.min(gross, c.ceiling ?? Infinity) * c.rate }));
      const deductible = contribs.filter((c) => c.deductible).reduce((s, c) => s + c.amount, 0);
      const taxable = Math.max(0, gross - deductible - r.incomeTax.personalAllowance);
      const scale = progressiveTax(taxable, r.incomeTax.brackets);
      const tax = Math.max(0, scale.total - r.incomeTax.taxCredit);
      return {
        lines: [
          {
            id: 'income-tax',
            label: 'Income tax',
            category: 'incomeTax',
            amount: tax,
            details: [`Progressive scale on ${amt(taxable)} ${def.currency} taxable income after a ${amt(r.incomeTax.personalAllowance)} allowance.`],
            parts: scale.bands.filter((b) => b.amount > 0).map((b) => ({ label: `${pct(b.rate)} band`, amount: b.amount })),
          },
          ...contribs.map((c) => ({ id: c.id, label: c.label, category: 'social' as const, amount: c.amount, details: [`${pct(c.rate)} of pay${c.ceiling ? ` up to ${amt(c.ceiling)} ${def.currency}` : ''}.`] })),
        ],
        steps: [
          { label: 'Gross salary', value: gross },
          { label: 'Taxable income', value: taxable },
        ],
        assumptions: ['Generic model: single employee, no personal circumstances modelled yet.'],
        warnings: ['This country uses a simplified generic model.'],
        estimated: true,
      };
    },
  };
}
