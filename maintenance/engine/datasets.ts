import fs from 'node:fs';
import path from 'node:path';
import { countryModules } from '../../src/countries';
import { nextVersion } from '../../src/engine/registry';
import type { CountryModule, RegistryFile, TaxDataset } from '../../src/engine/types';
import { loadProposals, saveProposals } from './checker';
import { isoNow, makeId, paths, writeJsonFile, type MaintenanceContext } from './context';
import { setByPath } from './paths';
import { allVersions, datasetFile, latestActiveYear, readDataset, readRegistryFile, writeRegistryFile } from './registryAccess';
import type { Proposal, RunRecord, TestRunResult, ValidationReport } from './types';
import { goldenCasesFor, readGolden, registryWith, validateCandidate, writeGolden } from './validate';

export const TAX_TEST_SCOPE = ['tests/tax'];

function record(ctx: MaintenanceContext, r: Omit<RunRecord, 'id' | 'startedAt' | 'finishedAt' | 'countriesChecked' | 'sourcesChecked' | 'sourcesSucceeded' | 'sourcesFailed' | 'changesDetected' | 'proposalsCreated' | 'duplicatesSuppressed' | 'approved' | 'rejected' | 'tests'> & Partial<RunRecord>): RunRecord {
  const full: RunRecord = {
    id: makeId(r.type, ctx),
    startedAt: isoNow(ctx),
    finishedAt: isoNow(ctx),
    countriesChecked: [],
    sourcesChecked: 0,
    sourcesSucceeded: [],
    sourcesFailed: [],
    changesDetected: 0,
    proposalsCreated: [],
    duplicatesSuppressed: 0,
    approved: [],
    rejected: [],
    tests: null,
    ...r,
  };
  writeJsonFile(path.join(paths(ctx).history, `${full.id}.json`), full);
  return full;
}

/**
 * Writes a new immutable dataset version and activates it — but only if the
 * schema, invariants, golden regression cases and the automated test suite all
 * pass. On any failure the version file is removed and the registry restored.
 */
export async function activateCandidate(ctx: MaintenanceContext, candidate: TaxDataset, modules: CountryModule[] = countryModules): Promise<{ ok: boolean; report: ValidationReport }> {
  const regFile = readRegistryFile(ctx);
  const { country, taxYear, version } = candidate.meta;
  const file = datasetFile(ctx, country, version);
  if (fs.existsSync(file)) throw new Error(`Dataset ${country}/${version} already exists — versions are never overwritten.`);

  const proposed: RegistryFile = structuredClone(regFile);
  proposed.countries[country] = proposed.countries[country] ?? { name: country, status: 'under-development', active: {} };
  proposed.countries[country].active[String(taxYear)] = version;

  const pre = validateCandidate(ctx, candidate, proposed, modules);
  const skipped: TestRunResult = { ran: false, passed: false, total: 0, failed: 0, summary: 'Not run — earlier validation failed.' };
  if (!pre.ok) return { ok: false, report: { ...pre, tests: skipped } };

  // Transaction: write files, run the real test suite, roll back on failure.
  writeJsonFile(file, candidate);
  writeRegistryFile(ctx, proposed);
  let tests: TestRunResult;
  try {
    tests = await ctx.runTests(TAX_TEST_SCOPE);
  } catch (e) {
    tests = { ran: false, passed: false, total: 0, failed: 0, summary: `Test runner failed: ${e instanceof Error ? e.message : e}` };
  }
  if (!tests.passed) {
    fs.rmSync(file, { force: true });
    writeRegistryFile(ctx, regFile);
    return { ok: false, report: { ...pre, ok: false, tests } };
  }
  // Lock in the new version's results as regression tests.
  const golden = readGolden(ctx);
  const reg = registryWith(ctx, [], undefined, modules);
  golden.cases = [...golden.cases.filter((c) => !(c.country === country && c.version === version)), ...goldenCasesFor(reg, country, taxYear, version)];
  writeGolden(ctx, golden);
  return { ok: true, report: { ...pre, tests } };
}

/** The dataset a change for `taxYear` should be based on: that year's active version, else the latest earlier year. */
export function baseDataset(ctx: MaintenanceContext, country: string, taxYear: number): { base: TaxDataset; sameYear: boolean } {
  const reg = readRegistryFile(ctx);
  const active = reg.countries[country]?.active ?? {};
  if (active[String(taxYear)]) return { base: readDataset(ctx, country, active[String(taxYear)]), sameYear: true };
  const earlier = Object.keys(active).map(Number).filter((y) => y < taxYear).sort((a, b) => b - a)[0];
  const fallback = earlier ?? latestActiveYear(reg, country);
  if (fallback === null || fallback === undefined) throw new Error(`${country} has no dataset to base a ${taxYear} version on.`);
  return { base: readDataset(ctx, country, active[String(fallback)]), sameYear: false };
}

export function buildCandidate(ctx: MaintenanceContext, country: string, taxYear: number, changes: { rulePath: string; value: unknown; label: string }[], sources: { url: string; authority: string; title: string }[], description: string): TaxDataset {
  const { base, sameYear } = baseDataset(ctx, country, taxYear);
  let rules = structuredClone(base.rules);
  for (const c of changes) rules = setByPath(rules, c.rulePath, c.value);
  const version = nextVersion(allVersions(ctx, country), taxYear);
  const changed = new Set(changes.map((c) => c.rulePath));
  const sourceRefs = [...base.meta.sources];
  for (const s of sources) if (!sourceRefs.some((r) => r.url === s.url)) sourceRefs.push(s);
  const now = isoNow(ctx);
  return {
    meta: {
      ...base.meta,
      taxYear,
      version,
      createdAt: now,
      effectiveDate: `${taxYear}-01-01`,
      approvedAt: now,
      lastVerified: now.slice(0, 10),
      description,
      previousVersion: base.meta.version,
      sources: sourceRefs,
      // A new year built from last year's rules is incomplete until every value is confirmed.
      verificationStatus: sameYear ? base.meta.verificationStatus : 'incomplete',
      unverified: sameYear
        ? base.meta.unverified
        : [`All values not listed as updated were carried over from ${base.meta.version} and still need confirming for ${taxYear}. Updated: ${[...changed].join(', ') || 'none'}.`, ...base.meta.unverified],
    },
    rules,
  };
}

export async function approveProposals(ctx: MaintenanceContext, ids: string[], note: string | null = null, modules: CountryModule[] = countryModules): Promise<RunRecord> {
  const proposals = loadProposals(ctx);
  const chosen = proposals.filter((p) => ids.includes(p.id));
  if (chosen.length === 0) throw new Error('No matching proposals.');
  for (const p of chosen) {
    if (p.status !== 'pending' && p.status !== 'research' && p.status !== 'failed-validation') throw new Error(`Proposal ${p.id} is already ${p.status}.`);
    if (p.proposedValue === null || !p.rulePath || p.taxYear === null) throw new Error(`Proposal ${p.id} has no concrete value to apply — it can only be researched or rejected.`);
  }
  // One new dataset version per country and tax year.
  const groups = new Map<string, Proposal[]>();
  for (const p of chosen) groups.set(`${p.country}|${p.taxYear}`, [...(groups.get(`${p.country}|${p.taxYear}`) ?? []), p]);

  const approved: string[] = [];
  const failed: string[] = [];
  const details: Record<string, unknown> = {};
  let lastTests: TestRunResult | null = null;
  for (const [key, group] of groups) {
    const [country, yearStr] = key.split('|');
    const taxYear = Number(yearStr);
    const candidate = buildCandidate(
      ctx,
      country,
      taxYear,
      group.map((p) => ({ rulePath: p.rulePath as string, value: p.proposedValue, label: p.rulePath as string })),
      group.map((p) => ({ url: p.sourceUrl, authority: p.sourceId, title: `Detected change (${p.category})` })),
      `Approved update: ${group.map((p) => p.rulePath).join(', ')}.${note ? ` Note: ${note}` : ''}`,
    );
    const { ok, report } = await activateCandidate(ctx, candidate, modules);
    lastTests = report.tests;
    details[key] = { version: candidate.meta.version, ok, report };
    for (const p of group) {
      p.status = ok ? 'approved' : 'failed-validation';
      p.updatedAt = isoNow(ctx);
      p.validation = report;
      p.resultVersion = ok ? candidate.meta.version : null;
      p.note = note ?? p.note;
      (ok ? approved : failed).push(p.id);
    }
  }
  saveProposals(ctx, proposals);

  let commit: string | null = null;
  if (approved.length && ctx.git) {
    try {
      commit = await ctx.git.commit(`tax-data: approve ${approved.length} update(s)`, ['tax-data', 'tests/tax/golden.json', 'maintenance/data']);
    } catch (e) {
      details.gitError = e instanceof Error ? e.message : String(e);
    }
  }
  return record(ctx, {
    type: 'approve',
    status: failed.length === 0 ? 'success' : approved.length ? 'partial' : 'failed',
    approved,
    tests: lastTests,
    countriesChecked: [...new Set(chosen.map((p) => p.country))],
    summary: failed.length ? `${approved.length} approved, ${failed.length} rejected by validation — the previous dataset stays active.` : `${approved.length} change(s) approved and activated.${commit ? ` Commit ${commit}.` : ''}`,
    details,
  });
}

export function setProposalStatus(ctx: MaintenanceContext, ids: string[], status: 'rejected' | 'research', note: string | null): RunRecord {
  const proposals = loadProposals(ctx);
  const changed: string[] = [];
  for (const p of proposals) {
    if (!ids.includes(p.id)) continue;
    if (p.status === 'approved') throw new Error(`Proposal ${p.id} is already approved; use rollback instead.`);
    p.status = status;
    p.note = note;
    p.updatedAt = isoNow(ctx);
    changed.push(p.id);
  }
  if (changed.length === 0) throw new Error('No matching proposals.');
  saveProposals(ctx, proposals);
  return record(ctx, { type: status === 'rejected' ? 'reject' : 'research', status: 'success', rejected: status === 'rejected' ? changed : [], summary: `${changed.length} proposal(s) marked ${status === 'rejected' ? 'rejected' : 'for further research'}.`, details: { note } });
}

/** Re-activates an earlier version for one tax year. Versions are never deleted. */
export async function rollback(ctx: MaintenanceContext, country: string, taxYear: number, version: string): Promise<RunRecord> {
  const regFile = readRegistryFile(ctx);
  const current = regFile.countries[country]?.active[String(taxYear)];
  if (!current) throw new Error(`${country} has no active ${taxYear} dataset.`);
  if (current === version) throw new Error(`${version} is already active.`);
  const target = readDataset(ctx, country, version);
  if (target.meta.taxYear !== taxYear) throw new Error(`${version} belongs to tax year ${target.meta.taxYear}, not ${taxYear}.`);
  const next: RegistryFile = structuredClone(regFile);
  next.countries[country].active[String(taxYear)] = version;
  writeRegistryFile(ctx, next);
  const tests = await ctx.runTests(TAX_TEST_SCOPE);
  if (!tests.passed) {
    writeRegistryFile(ctx, regFile);
    return record(ctx, { type: 'rollback', status: 'failed', tests, countriesChecked: [country], summary: `Rollback of ${country} ${taxYear} to ${version} failed its tests; ${current} stays active.` });
  }
  return record(ctx, { type: 'rollback', status: 'success', tests, countriesChecked: [country], summary: `${country} ${taxYear}: ${current} → ${version} restored.`, details: { from: current, to: version } });
}
