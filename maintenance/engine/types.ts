import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Source registry (maintenance/config/sources.json — committed)       */
/* ------------------------------------------------------------------ */

export const probeSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Path inside the dataset's `rules`, e.g. "middleTax.threshold" or "bracketTax.2.rate". */
  rulePath: z.string(),
  /** Regex with a named group `value`. Matched against the normalised page text. */
  pattern: z.string(),
  /** How the captured text is written: "114 540", "641.200", "7,6", "38,883"… */
  format: z.enum(['space-thousands', 'dot-thousands', 'comma-thousands', 'decimal-comma', 'decimal-dot']),
  /** Multiply the parsed number (0.01 turns "7,6" % into 0.076). */
  scale: z.number().default(1),
  category: z.string().default('income-tax'),
});
export type Probe = z.infer<typeof probeSchema>;

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  country: z.string().regex(/^[A-Z]{2}$/),
  authority: z.string(),
  url: z.string().url(),
  /** Preference order: api > rss > document > html > legislation. */
  type: z.enum(['api', 'rss', 'document', 'html', 'legislation']),
  description: z.string(),
  method: z.enum(['html-text', 'pdf-text', 'rss', 'statbank-pskat', 'skv-rowstore', 'bmf-lohnsteuer']),
  category: z.string().default('general'),
  /** Lines containing any of these words form the "relevant" part of the page. */
  keywords: z.array(z.string()).default([]),
  probes: z.array(probeSchema).default([]),
  /**
   * URL template with {year} for the same publication in another tax year.
   * When a page for next year appears, that is reported as a new publication.
   */
  yearUrl: z.string().optional(),
  /** Regex (group `value`) that reads which tax year the page currently describes. */
  yearPattern: z.string().optional(),
  /** Tax year the `url` describes; defaults to the latest active year for the country. */
  taxYear: z.number().int().optional(),
  enabled: z.boolean().default(true),
  /** Added automatically by "Add Country" and not yet confirmed by a person. */
  discovered: z.boolean().default(false),
});
export type Source = z.infer<typeof sourceSchema>;

export const sourcesFileSchema = z.object({ sources: z.array(sourceSchema) });

/* ------------------------------------------------------------------ */
/* Mutable state (maintenance/data/state.json — committed)            */
/* ------------------------------------------------------------------ */

export const sourceStateSchema = z.object({
  lastChecked: z.string().nullable().default(null),
  lastSuccess: z.string().nullable().default(null),
  accessible: z.boolean().nullable().default(null),
  contentHash: z.string().nullable().default(null),
  relevantHash: z.string().nullable().default(null),
  lastModified: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  consecutiveFailures: z.number().default(0),
  /** RSS: identifiers of items already seen. */
  seenItems: z.array(z.string()).default([]),
  /** Years for which a {year} page was already found. */
  knownYears: z.array(z.number()).default([]),
});
export type SourceState = z.infer<typeof sourceStateSchema>;

export const settingsSchema = z.object({
  monthlyCheck: z.boolean().default(false),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  commitOnApprove: z.boolean().default(false),
});

export const stateFileSchema = z.object({
  sources: z.record(z.string(), sourceStateSchema).default({}),
  settings: settingsSchema.default({ monthlyCheck: false, dayOfMonth: 1, commitOnApprove: false }),
  lastCheckRun: z.string().nullable().default(null),
  lastCheckRunId: z.string().nullable().default(null),
});
export type StateFile = z.infer<typeof stateFileSchema>;

/* ------------------------------------------------------------------ */
/* Detection results                                                   */
/* ------------------------------------------------------------------ */

export type Classification =
  | 'first-snapshot' // nothing to compare against yet
  | 'unchanged'
  | 'unrelated-change' // page changed, but not in the tax-relevant lines
  | 'relevant-change' // tax-relevant lines changed (needs a human or a probe)
  | 'unavailable' // could not be retrieved — NOT evidence that nothing changed
  | 'blocked-by-robots';

export interface ProbeResult {
  probeId: string;
  label: string;
  rulePath: string;
  taxYear: number;
  found: boolean;
  observed: number | null;
  expected: unknown;
  match: boolean;
}

export interface SourceCheckResult {
  sourceId: string;
  country: string;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  classification: Classification;
  contentHash: string | null;
  relevantHash: string | null;
  lastModified: string | null;
  probes: ProbeResult[];
  newItems: { title: string; link: string; date: string | null }[];
  futureYears: number[];
  notes: string[];
}

export type ChangeKind =
  | 'new-regulation' // values for a tax year we have no data for yet
  | 'modification' // a value of an already effective year differs
  | 'future-regulation' // announced, effective after today
  | 'informational' // new publication or relevant text change, no value extracted
  | 'calculation-mismatch' // official calculator disagrees with ours
  | 'source-unavailable';

export interface DetectedChange {
  /** Stable id: same change detected twice gets the same id (duplicate detection). */
  id: string;
  country: string;
  category: string;
  kind: ChangeKind;
  rulePath: string | null;
  existingValue: unknown;
  proposedValue: unknown;
  taxYear: number | null;
  effectiveDate: string | null;
  sourceId: string;
  sourceUrl: string;
  publicationDate: string | null;
  explanation: string;
  /** "extracted-value": a number was read from an official page. "needs-research": only a signal. */
  confidence: 'extracted-value' | 'needs-research';
  affectsExistingCalculations: boolean;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'research' | 'failed-validation';

export interface Proposal extends DetectedChange {
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  runId: string;
  note: string | null;
  /** Dataset version created when approved. */
  resultVersion: string | null;
  validation: ValidationReport | null;
}

export interface TestRunResult {
  ran: boolean;
  passed: boolean;
  total: number;
  failed: number;
  summary: string;
}

export interface ValidationReport {
  ok: boolean;
  schema: { ok: boolean; errors: string[] };
  invariants: { ok: boolean; errors: string[] };
  golden: { ok: boolean; checked: number; failures: string[] };
  tests: TestRunResult;
}

export interface RunRecord {
  id: string;
  type: 'check' | 'approve' | 'reject' | 'research' | 'rollback' | 'add-country' | 'create-version' | 'publish-country';
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  countriesChecked: string[];
  sourcesChecked: number;
  sourcesSucceeded: string[];
  sourcesFailed: { id: string; error: string }[];
  changesDetected: number;
  proposalsCreated: string[];
  duplicatesSuppressed: number;
  approved: string[];
  rejected: string[];
  tests: TestRunResult | null;
  summary: string;
  results?: SourceCheckResult[];
  changes?: DetectedChange[];
  details?: Record<string, unknown>;
}

export interface Progress {
  done: number;
  total: number;
  current: string;
  log: string[];
}
