import { datasetSchema, registrySchema } from './schema';
import type {
  BreakdownLine,
  CalcInput,
  CalcResult,
  CountryModule,
  CountryStatus,
  DatasetMeta,
  InputField,
  LocationConfig,
  PersonalInputs,
  RegistryFile,
  TaxDataset,
  VerificationStatus,
} from './types';

export class TaxDataError extends Error {}

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  currency: string;
  status: CountryStatus;
  years: number[];
}

const versionRevision = (v: string): number => Number(v.split('.')[1]);
export const compareVersions = (a: string, b: string): number => {
  const [ay, ar] = a.split('.').map(Number);
  const [by, br] = b.split('.').map(Number);
  return ay - by || ar - br;
};

/** Fill in defaults, drop unknown keys and coerce types for a module's personal inputs. */
export function normalisePersonal(fields: InputField[], given: PersonalInputs | undefined): PersonalInputs {
  const out: PersonalInputs = {};
  for (const f of fields) {
    const v = given?.[f.key];
    if (f.type === 'number') {
      const n = typeof v === 'number' && Number.isFinite(v) ? v : f.default;
      out[f.key] = Math.min(f.max, Math.max(f.min, n));
    } else if (f.type === 'boolean') {
      out[f.key] = typeof v === 'boolean' ? v : f.default;
    } else {
      out[f.key] = typeof v === 'string' && f.options.some((o) => o.value === v) ? v : f.default;
    }
  }
  return out;
}

/**
 * Holds every dataset version plus the registry of active versions and runs
 * calculations. It is constructed from plain objects so the same code serves
 * the browser (Vite glob import), Vitest and the Node maintenance engine.
 */
export class TaxRegistry {
  private datasets = new Map<string, TaxDataset>();
  private modules = new Map<string, CountryModule>();
  readonly registry: RegistryFile;

  constructor(modules: CountryModule[], registry: unknown, datasets: unknown[]) {
    this.registry = registrySchema.parse(registry);
    for (const m of modules) this.modules.set(m.code, m as CountryModule);
    for (const raw of datasets) {
      const ds = datasetSchema.parse(raw) as TaxDataset;
      this.datasets.set(`${ds.meta.country}/${ds.meta.version}`, ds);
    }
  }

  module(code: string): CountryModule {
    const m = this.modules.get(code);
    if (!m) throw new TaxDataError(`No tax module is registered for "${code}".`);
    return m;
  }

  hasModule(code: string): boolean {
    return this.modules.has(code);
  }

  /** Countries offered in the public calculator: status "supported" with ≥1 active year. */
  listCountries(includeUnderDevelopment = false): CountryInfo[] {
    const out: CountryInfo[] = [];
    for (const [code, entry] of Object.entries(this.registry.countries)) {
      const m = this.modules.get(code);
      if (!m) continue;
      if (entry.status !== 'supported' && !includeUnderDevelopment) continue;
      const years = Object.keys(entry.active).map(Number).sort((a, b) => b - a);
      if (years.length === 0 && !includeUnderDevelopment) continue;
      out.push({ code, name: entry.name, flag: m.flag, currency: m.currency, status: entry.status, years });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  getSupportedTaxYears(code: string): number[] {
    return Object.keys(this.registry.countries[code]?.active ?? {})
      .map(Number)
      .sort((a, b) => b - a);
  }

  listVersions(code: string, taxYear?: number): DatasetMeta[] {
    return [...this.datasets.values()]
      .filter((d) => d.meta.country === code && (taxYear === undefined || d.meta.taxYear === taxYear))
      .map((d) => d.meta)
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  activeVersion(code: string, taxYear: number): string | null {
    return this.registry.countries[code]?.active[String(taxYear)] ?? null;
  }

  /**
   * Resolve the dataset for a country/year. A year never falls back to another
   * year's rules: if nothing is active for the requested year this throws.
   */
  getDataset(code: string, taxYear: number, version?: string): TaxDataset {
    const v = version ?? this.activeVersion(code, taxYear);
    if (!v) throw new TaxDataError(`No verified ${taxYear} tax data is available for ${code}.`);
    const ds = this.datasets.get(`${code}/${v}`);
    if (!ds) throw new TaxDataError(`Dataset ${code}/${v} is missing.`);
    if (ds.meta.taxYear !== taxYear) throw new TaxDataError(`Dataset ${code}/${v} belongs to tax year ${ds.meta.taxYear}, not ${taxYear}.`);
    return ds;
  }

  getRules<R>(code: string, taxYear: number, version?: string): { rules: R; meta: DatasetMeta } {
    const ds = this.getDataset(code, taxYear, version);
    const parsed = this.module(code).rulesSchema.safeParse(ds.rules);
    if (!parsed.success) {
      throw new TaxDataError(`Dataset ${code}/${ds.meta.version} failed validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    return { rules: parsed.data as R, meta: ds.meta };
  }

  getAvailableLocations(code: string, taxYear: number, version?: string): LocationConfig | null {
    const { rules } = this.getRules(code, taxYear, version);
    return this.module(code).getAvailableLocations(rules);
  }

  getRequiredPersonalInputs(code: string, taxYear: number, version?: string): InputField[] {
    const { rules } = this.getRules(code, taxYear, version);
    return this.module(code).getRequiredPersonalInputs(rules);
  }

  paymentsPerYear(code: string, taxYear: number, personal?: PersonalInputs): number {
    const fields = this.getRequiredPersonalInputs(code, taxYear);
    return this.module(code).paymentsPerYear(normalisePersonal(fields, personal));
  }

  calculateNetSalary(input: CalcInput): CalcResult {
    if (!Number.isFinite(input.grossAnnual) || input.grossAnnual < 0) throw new TaxDataError('Gross salary must be a non-negative number.');
    const mod = this.module(input.country);
    const { rules, meta } = this.getRules(input.country, input.taxYear, input.datasetVersion);
    const locations = mod.getAvailableLocations(rules);
    const location = locations ? (locations.options.some((o) => o.id === input.location) ? (input.location as string) : locations.defaultId) : '';
    const personal = normalisePersonal(mod.getRequiredPersonalInputs(rules), input.personal);

    const run = (gross: number) => mod.compute(rules, { grossAnnual: gross, location, personal });
    const totals = (lines: BreakdownLine[]) => {
      const sum = (c: BreakdownLine['category']) => lines.filter((l) => l.category === c).reduce((s, l) => s + l.amount, 0);
      return { incomeTax: sum('incomeTax'), social: sum('social'), mandatory: sum('mandatory'), optional: sum('optional') };
    };

    const comp = run(input.grossAnnual);
    const gross = comp.grossAnnual ?? input.grossAnnual;
    const t = totals(comp.lines);
    const totalDeductions = t.incomeTax + t.social + t.mandatory + t.optional;
    const netAnnual = gross - totalDeductions;

    // Marginal rate: share of one extra slice of gross pay lost to tax and
    // mandatory contributions. Uses a 1 % slice so payroll rounding steps do not distort it.
    const delta = Math.max(input.grossAnnual * 0.01, 100);
    const next = run(input.grossAnnual + delta);
    const nt = totals(next.lines);
    const nextGross = next.grossAnnual ?? input.grossAnnual + delta;
    const grossStep = nextGross - gross;
    const mandatoryNow = t.incomeTax + t.social + t.mandatory;
    const mandatoryNext = nt.incomeTax + nt.social + nt.mandatory;
    const marginal = grossStep > 0 ? (mandatoryNext - mandatoryNow) / grossStep : 0;

    let status: VerificationStatus = meta.verificationStatus;
    if (status === 'verified' && comp.estimated) status = 'estimated';

    return {
      country: input.country,
      taxYear: input.taxYear,
      datasetVersion: meta.version,
      currency: meta.currency,
      status,
      location,
      personal,
      grossAnnual: gross,
      grossMonthly: gross / 12,
      incomeTax: t.incomeTax,
      socialContributions: t.social,
      otherMandatory: t.mandatory,
      optionalDeductions: t.optional,
      totalDeductions,
      netAnnual,
      netMonthly: netAnnual / 12,
      effectiveTaxRate: gross > 0 ? (t.incomeTax + t.social + t.mandatory) / gross : 0,
      marginalTaxRate: Math.min(1, Math.max(0, marginal)),
      lines: comp.lines.filter((l) => Math.abs(l.amount) > 0.005 || l.category !== 'optional'),
      steps: comp.steps,
      assumptions: comp.assumptions,
      warnings: [
        ...comp.warnings,
        ...(meta.verificationStatus === 'incomplete' ? [`The ${meta.taxYear} tax data for this country is incomplete — treat the result as a rough indication only.`] : []),
      ],
    };
  }
}

export const nextVersion = (existing: string[], taxYear: number): string => {
  const revs = existing.filter((v) => v.startsWith(`${taxYear}.`)).map(versionRevision);
  return `${taxYear}.${revs.length ? Math.max(...revs) + 1 : 1}`;
};
