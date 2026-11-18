import { z } from 'zod';

export const sourceRefSchema = z.object({
  title: z.string().min(1),
  authority: z.string().min(1),
  url: z.string().url(),
});

export const datasetMetaSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  taxYear: z.number().int().min(2000).max(2100),
  version: z.string().regex(/^\d{4}\.\d+$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  createdAt: z.string().min(10),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approvedAt: z.string().nullable(),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  verificationStatus: z.enum(['verified', 'estimated', 'incomplete']),
  description: z.string(),
  previousVersion: z.string().nullable(),
  sources: z.array(sourceRefSchema),
  unverified: z.array(z.string()),
  limitations: z.array(z.string()),
});

export const datasetSchema = z.object({ meta: datasetMetaSchema, rules: z.unknown() });

export const registrySchema = z.object({
  countries: z.record(
    z.string(),
    z.object({
      name: z.string(),
      status: z.enum(['supported', 'under-development']),
      active: z.record(z.string(), z.string()),
    }),
  ),
});

/** Shared rule-shape helpers. */
export const rate = z.number().min(0).max(1);
export const money = z.number().min(0);
export const bracketSchema = z.object({
  /** Upper bound of the band; null = no upper bound. */
  upTo: money.nullable(),
  rate,
});
export type Bracket = z.infer<typeof bracketSchema>;

/** Brackets must be ascending and end with an open band. */
export const bracketsSchema = z
  .array(bracketSchema)
  .min(1)
  .refine((b) => b[b.length - 1].upTo === null, 'last bracket must be open-ended')
  .refine(
    (b) => b.every((x, i) => i === 0 || x.upTo === null || (b[i - 1].upTo !== null && x.upTo > (b[i - 1].upTo as number))),
    'brackets must be strictly ascending',
  );
