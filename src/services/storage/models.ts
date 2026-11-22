import { z } from 'zod';

export const frequencySchema = z.enum(['monthly', 'annual', 'hourly']);
export type Frequency = z.infer<typeof frequencySchema>;

export const personalSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

/** Everything the user typed into the calculator. */
export const draftSchema = z.object({
  country: z.string(),
  taxYear: z.number().int(),
  amount: z.number().min(0),
  frequency: frequencySchema,
  hoursPerWeek: z.number().min(1).max(80),
  location: z.string(),
  mode: z.enum(['simple', 'advanced']),
  personal: personalSchema,
  targetCurrency: z.string().regex(/^[A-Z]{3}$/),
  autoConvert: z.boolean(),
  manualRate: z.number().positive().nullable(),
  rateDate: z.string().nullable(),
  /** gross-to-net (default) or the reverse: which gross salary gives this net amount. */
  direction: z.enum(['gross-to-net', 'net-to-gross']).default('gross-to-net'),
});
export type CalcDraft = z.infer<typeof draftSchema>;

export const settingsSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  outputCurrency: z.string().regex(/^[A-Z]{3}$/),
  taxYear: z.number().int(),
  frequency: frequencySchema,
  theme: z.enum(['dark', 'light', 'system']),
  mode: z.enum(['simple', 'advanced']),
  numberLocale: z.enum(['en-US', 'de-DE', 'fr-FR', 'en-IN']),
  showDecimals: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  country: 'DK',
  outputCurrency: 'EUR',
  taxYear: 2026,
  frequency: 'monthly',
  theme: 'dark',
  mode: 'simple',
  numberLocale: 'en-US',
  showDecimals: false,
};

export const savedCalculationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  createdAt: z.string(),
  updatedAt: z.string(),
  draft: draftSchema,
  /** Result at the time of saving, for the list view. Recomputed when reopened. */
  snapshot: z.object({
    currency: z.string(),
    grossAnnual: z.number(),
    netAnnual: z.number(),
    effectiveTaxRate: z.number(),
    datasetVersion: z.string(),
    targetCurrency: z.string(),
    convertedNetMonthly: z.number().nullable(),
    rateDate: z.string().nullable(),
  }),
});
export type SavedCalculation = z.infer<typeof savedCalculationSchema>;

export const exportFileSchema = z.object({
  app: z.literal('networth'),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  calculations: z.array(savedCalculationSchema),
});
export type ExportFile = z.infer<typeof exportFileSchema>;

export const compareRowSchema = z.object({
  id: z.string(),
  /** Optional name for the offer, e.g. "Product role, Stockholm". */
  label: z.string().max(60).optional(),
  country: z.string(),
  amount: z.number().min(0),
  location: z.string(),
  personal: personalSchema,
});
export type CompareRow = z.infer<typeof compareRowSchema>;
