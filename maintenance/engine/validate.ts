import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countryModules } from '../../src/countries';
import { readTaxData } from '../../src/data/nodeLoader';
import { TaxRegistry } from '../../src/engine/registry';
import { datasetMetaSchema } from '../../src/engine/schema';
import type { CountryModule, PersonalInputs, RegistryFile, TaxDataset } from '../../src/engine/types';
import { paths, readJsonFile, writeJsonFile, type MaintenanceContext } from './context';
import type { TestRunResult, ValidationReport } from './types';

/* ---------------- golden regression cases ---------------- */

export interface GoldenCase {
  country: string;
  taxYear: number;
  version: string;
  grossAnnual: number;
  location?: string;
  personal?: PersonalInputs;
  expect: { netAnnual: number; incomeTax: number; social: number; mandatory: number };
}
export interface GoldenFile {
  note: string;
  cases: GoldenCase[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Salary grid in the country's own currency (Nordic currencies are ~10× EUR). */
export function salaryGrid(currency: string): number[] {
  const f = ['DKK', 'SEK', 'NOK'].includes(currency) ? 10 : 1;
  return [8000, 20000, 35000, 50000, 70000, 100000, 180000, 400000].map((x) => x * f);
}

export function goldenCasesFor(reg: TaxRegistry, country: string, taxYear: number, version: string): GoldenCase[] {
  const meta = reg.getDataset(country, taxYear, version).meta;
  const variants: { location?: string; personal?: PersonalInputs }[] = [{}];
  const fields = reg.getRequiredPersonalInputs(country, taxYear, version);
  const locs = reg.getAvailableLocations(country, taxYear, version);
  if (locs && locs.options.length > 1) variants.push({ location: locs.options[1].id });
  for (const f of fields) {
    if (f.type === 'boolean') variants.push({ personal: { [f.key]: !f.default } });
    if (f.type === 'select' && f.options.length > 1) variants.push({ personal: { [f.key]: f.options.find((o) => o.value !== f.default)!.value } });
    if (f.type === 'number' && f.key !== 'age') variants.push({ personal: { [f.key]: Math.min(f.max, f.default + Math.max(f.step, (f.max - f.min) / 4)) } });
  }
  const out: GoldenCase[] = [];
  for (const g of salaryGrid(meta.currency)) {
    for (const v of g === salaryGrid(meta.currency)[3] ? variants : [{}]) {
      const r = reg.calculateNetSalary({ country, taxYear, grossAnnual: g, location: v.location, personal: v.personal, datasetVersion: version });
      out.push({ country, taxYear, version, grossAnnual: g, ...v, expect: { netAnnual: round2(r.netAnnual), incomeTax: round2(r.incomeTax), social: round2(r.socialContributions), mandatory: round2(r.otherMandatory) } });
    }
  }
  return out;
}

export function readGolden(ctx: MaintenanceContext): GoldenFile {
  return readJsonFile<GoldenFile>(paths(ctx).golden, { note: '', cases: [] });
}

export function writeGolden(ctx: MaintenanceContext, g: GoldenFile): void {
  writeJsonFile(paths(ctx).golden, g);
}

/** Runs every golden case against a registry. Cases are pinned to a dataset version. */
export function checkGolden(reg: TaxRegistry, cases: GoldenCase[]): { ok: boolean; checked: number; failures: string[] } {
  const failures: string[] = [];
  for (const c of cases) {
    try {
      const r = reg.calculateNetSalary({ country: c.country, taxYear: c.taxYear, grossAnnual: c.grossAnnual, location: c.location, personal: c.personal, datasetVersion: c.version });
      const got = { netAnnual: round2(r.netAnnual), incomeTax: round2(r.incomeTax), social: round2(r.socialContributions), mandatory: round2(r.otherMandatory) };
      for (const k of Object.keys(c.expect) as (keyof GoldenCase['expect'])[]) {
        if (Math.abs(got[k] - c.expect[k]) > 0.011) failures.push(`${c.country} ${c.version} gross ${c.grossAnnual}${c.location ? ` @${c.location}` : ''}${c.personal ? ` ${JSON.stringify(c.personal)}` : ''}: ${k} expected ${c.expect[k]}, got ${got[k]}`);
      }
    } catch (e) {
      failures.push(`${c.country} ${c.version}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: failures.length === 0, checked: cases.length, failures };
}

/* ---------------- dataset checks ---------------- */

export function checkSchema(mod: CountryModule | undefined, ds: TaxDataset): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const m = datasetMetaSchema.safeParse(ds.meta);
  if (!m.success) errors.push(...m.error.issues.map((i) => `meta.${i.path.join('.')}: ${i.message}`));
  if (!mod) errors.push(`No calculation module is registered for ${ds.meta?.country}.`);
  else {
    const r = mod.rulesSchema.safeParse(ds.rules);
    if (!r.success) errors.push(...r.error.issues.map((i) => `rules.${i.path.join('.')}: ${i.message}`));
  }
  if (m.success && ds.meta.effectiveDate.slice(0, 4) !== String(ds.meta.taxYear)) errors.push(`Effective date ${ds.meta.effectiveDate} is outside tax year ${ds.meta.taxYear}.`);
  return { ok: errors.length === 0, errors };
}

/** Behavioural sanity checks that must hold for any correct tax dataset. */
export function checkInvariants(reg: TaxRegistry, country: string, taxYear: number, version: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const meta = reg.getDataset(country, taxYear, version).meta;
  const f = ['DKK', 'SEK', 'NOK'].includes(meta.currency) ? 10 : 1;
  let prevNet = -Infinity;
  for (let g = 0; g <= 600000 * f; g += 2500 * f) {
    let r;
    try {
      r = reg.calculateNetSalary({ country, taxYear, grossAnnual: g, datasetVersion: version });
    } catch (e) {
      errors.push(`Calculation fails at ${g}: ${e instanceof Error ? e.message : e}`);
      break;
    }
    const nums = [r.netAnnual, r.incomeTax, r.socialContributions, r.otherMandatory, r.effectiveTaxRate, r.marginalTaxRate];
    if (nums.some((n) => !Number.isFinite(n))) errors.push(`Non-finite result at gross ${g}.`);
    if (r.totalDeductions < -0.01) errors.push(`Negative total deductions at gross ${g}.`);
    if (r.netAnnual > r.grossAnnual + 0.01) errors.push(`Net exceeds gross at ${g}.`);
    if (r.effectiveTaxRate < 0 || r.effectiveTaxRate > 1) errors.push(`Effective rate out of range at ${g}.`);
    if (r.netAnnual + 1 < prevNet) errors.push(`Net pay falls when gross rises to ${g} (${prevNet.toFixed(2)} → ${r.netAnnual.toFixed(2)}).`);
    prevNet = r.netAnnual;
    if (errors.length > 5) break;
  }
  return { ok: errors.length === 0, errors };
}

/** Builds an in-memory registry from disk with some datasets added and the registry overridden. */
export function registryWith(ctx: MaintenanceContext, extra: TaxDataset[], regFile?: RegistryFile, modules: CountryModule[] = countryModules): TaxRegistry {
  const { registry, datasets } = readTaxData(ctx.taxDataDir);
  return new TaxRegistry(modules, regFile ?? registry, [...datasets, ...extra]);
}

export function validateCandidate(ctx: MaintenanceContext, candidate: TaxDataset, regFile: RegistryFile, modules: CountryModule[] = countryModules): Omit<ValidationReport, 'tests'> {
  const mod = modules.find((m) => m.code === candidate.meta.country);
  const schema = checkSchema(mod, candidate);
  if (!schema.ok) return { ok: false, schema, invariants: { ok: false, errors: ['Skipped: schema invalid.'] }, golden: { ok: false, checked: 0, failures: ['Skipped: schema invalid.'] } };
  const reg = registryWith(ctx, [candidate], regFile, modules);
  const invariants = checkInvariants(reg, candidate.meta.country, candidate.meta.taxYear, candidate.meta.version);
  const golden = checkGolden(reg, readGolden(ctx).cases);
  return { ok: schema.ok && invariants.ok && golden.ok, schema, invariants, golden };
}

/* ---------------- running the real test suite ---------------- */

/** Default runner: executes Vitest on the project and parses its JSON report. */
export function vitestRunner(root: string): (scope: string[]) => Promise<TestRunResult> {
  return (scope) =>
    new Promise((resolve) => {
      const out = path.join(os.tmpdir(), `networth-vitest-${process.pid}-${Date.now()}.json`);
      const child = spawn('npx', ['vitest', 'run', ...scope, '--reporter=json', `--outputFile=${out}`], { cwd: root, shell: process.platform === 'win32', stdio: 'ignore', env: { ...process.env, CI: '1' } });
      const timer = setTimeout(() => child.kill(), 10 * 60_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const j = JSON.parse(fs.readFileSync(out, 'utf8')) as { numTotalTests: number; numFailedTests: number; numPassedTests: number };
          fs.rmSync(out, { force: true });
          resolve({ ran: true, passed: code === 0 && j.numFailedTests === 0, total: j.numTotalTests, failed: j.numFailedTests, summary: `${j.numPassedTests}/${j.numTotalTests} tests passed` });
        } catch {
          resolve({ ran: true, passed: false, total: 0, failed: 0, summary: `Test run did not produce a report (exit code ${code}).` });
        }
      });
    });
}
