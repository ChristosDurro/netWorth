import type { z } from 'zod';

/**
 * Core contracts shared by every country module, the React app and the
 * maintenance engine. Nothing in this folder may import UI or Node APIs.
 */

export type VerificationStatus = 'verified' | 'estimated' | 'incomplete';

export interface SourceRef {
  title: string;
  authority: string;
  url: string;
}

/** Metadata stored with every versioned tax dataset (tax-data/<CC>/<version>.json). */
export interface DatasetMeta {
  country: string;
  taxYear: number;
  /** "<taxYear>.<revision>", e.g. "2026.1". Versions are immutable once written. */
  version: string;
  currency: string;
  createdAt: string;
  /** First day the rules apply (ISO date). */
  effectiveDate: string;
  approvedAt: string | null;
  lastVerified: string;
  verificationStatus: VerificationStatus;
  description: string;
  previousVersion: string | null;
  sources: SourceRef[];
  /** Values that could not be confirmed against a primary source. */
  unverified: string[];
  /** Situations the model deliberately does not cover. */
  limitations: string[];
}

export interface TaxDataset<R = unknown> {
  meta: DatasetMeta;
  rules: R;
}

export type PersonalValue = string | number | boolean;
export type PersonalInputs = Record<string, PersonalValue>;

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  /** Advanced fields are hidden in simple mode and fall back to their default. */
  advanced: boolean;
}
export type InputField =
  | (FieldBase & { type: 'select'; options: { value: string; label: string }[]; default: string })
  | (FieldBase & { type: 'number'; min: number; max: number; step: number; default: number; unit?: string })
  | (FieldBase & { type: 'boolean'; default: boolean });

export interface TaxLocation {
  id: string;
  label: string;
  /** Short hint shown next to the option, e.g. the local tax rate. */
  hint?: string;
}

export interface LocationConfig {
  label: string;
  defaultId: string;
  options: TaxLocation[];
}

export type DeductionCategory = 'incomeTax' | 'social' | 'mandatory' | 'optional';

export interface BreakdownLine {
  id: string;
  label: string;
  category: DeductionCategory;
  /** Annual amount in the employment currency. Positive = reduces net pay. */
  amount: number;
  /** Plain-language explanation of how the line was derived. */
  details: string[];
  /** Optional sub-rows (brackets, credits…). Their sum equals `amount`. */
  parts?: { label: string; amount: number }[];
}

export interface CalcStep {
  label: string;
  value: number;
  note?: string;
}

/** What a country module returns; the engine wrapper derives the totals. */
export interface CountryComputation {
  /** Set when the module adjusts gross pay (e.g. Dutch holiday allowance). */
  grossAnnual?: number;
  lines: BreakdownLine[];
  steps: CalcStep[];
  assumptions: string[];
  warnings: string[];
  /** True when the module had to simplify something material for this input. */
  estimated?: boolean;
}

export interface CalcContext {
  grossAnnual: number;
  location: string;
  personal: PersonalInputs;
}

export interface CalcInput {
  country: string;
  taxYear: number;
  grossAnnual: number;
  location?: string;
  personal?: PersonalInputs;
  /** Pin a specific dataset version (used by saved calculations and tests). */
  datasetVersion?: string;
}

export interface CalcResult {
  country: string;
  taxYear: number;
  datasetVersion: string;
  currency: string;
  status: VerificationStatus;
  location: string;
  personal: PersonalInputs;
  grossAnnual: number;
  grossMonthly: number;
  incomeTax: number;
  socialContributions: number;
  otherMandatory: number;
  optionalDeductions: number;
  totalDeductions: number;
  netAnnual: number;
  netMonthly: number;
  effectiveTaxRate: number;
  marginalTaxRate: number;
  lines: BreakdownLine[];
  steps: CalcStep[];
  assumptions: string[];
  warnings: string[];
}

/**
 * The contract every country implements. `R` is the shape of the country's
 * rule set; it is validated with `rulesSchema` before any calculation runs.
 */
export interface CountryModule<R = unknown> {
  code: string;
  name: string;
  flag: string;
  currency: string;
  /** Salary instalments per year when a "monthly" salary is quoted. */
  paymentsPerYear(personal: PersonalInputs): number;
  rulesSchema: z.ZodType<R>;
  getSupportedCurrencies(): string[];
  getAvailableLocations(rules: R): LocationConfig | null;
  getRequiredPersonalInputs(rules: R): InputField[];
  compute(rules: R, ctx: CalcContext): CountryComputation;
}

export type CountryStatus = 'supported' | 'under-development';

export interface RegistryFile {
  countries: Record<
    string,
    {
      name: string;
      status: CountryStatus;
      /** taxYear → active dataset version. */
      active: Record<string, string>;
    }
  >;
}
