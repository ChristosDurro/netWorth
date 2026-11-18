import fs from 'node:fs';
import path from 'node:path';
import type { TaxRegistry } from '../../src/engine/registry';
import type { RegistryFile } from '../../src/engine/types';
import { isoNow, makeId, paths, readJsonFile, writeJsonFile, writeTextFile, type MaintenanceContext } from './context';
import { findYear, htmlToText, parseFeed, pdfToText, relevantText, runProbe, sha256 } from './extract';
import { PoliteFetcher } from './fetcher';
import { getByPath, sameValue } from './paths';
import { loadRegistry, latestActiveYear } from './registryAccess';
import {
  sourcesFileSchema,
  sourceStateSchema,
  stateFileSchema,
  type ChangeKind,
  type Classification,
  type DetectedChange,
  type Progress,
  type Proposal,
  type RunRecord,
  type Source,
  type SourceCheckResult,
  type SourceState,
  type StateFile,
} from './types';

export function loadSources(ctx: MaintenanceContext): Source[] {
  return sourcesFileSchema.parse(readJsonFile(paths(ctx).sources, { sources: [] })).sources;
}

export function loadState(ctx: MaintenanceContext): StateFile {
  return stateFileSchema.parse(readJsonFile(paths(ctx).state, {}));
}

export function saveState(ctx: MaintenanceContext, state: StateFile): void {
  writeJsonFile(paths(ctx).state, state);
}

export function loadProposals(ctx: MaintenanceContext): Proposal[] {
  return readJsonFile<{ proposals: Proposal[] }>(paths(ctx).proposals, { proposals: [] }).proposals;
}

export function saveProposals(ctx: MaintenanceContext, proposals: Proposal[]): void {
  writeJsonFile(paths(ctx).proposals, { proposals });
}

export const changeId = (c: Pick<DetectedChange, 'country' | 'rulePath' | 'sourceId' | 'taxYear' | 'proposedValue' | 'kind'>): string =>
  sha256([c.country, c.rulePath ?? c.sourceId, c.taxYear ?? '', JSON.stringify(c.proposedValue ?? null), c.kind].join('|')).slice(0, 16);

/** Classifies a tax year relative to today and the data we hold. */
export function kindForYear(taxYear: number, haveData: boolean, today: Date): ChangeKind {
  if (taxYear > today.getUTCFullYear()) return 'future-regulation';
  return haveData ? 'modification' : 'new-regulation';
}

export function classify(prev: SourceState, contentHash: string, relevantHash: string): Classification {
  if (!prev.contentHash) return 'first-snapshot';
  if (prev.contentHash === contentHash) return 'unchanged';
  return prev.relevantHash === relevantHash ? 'unrelated-change' : 'relevant-change';
}

/** Small line diff for explanations: lines added/removed in the relevant text. */
export function lineDiff(before: string, after: string, max = 6): { added: string[]; removed: string[] } {
  const a = new Set(before.split('\n'));
  const b = new Set(after.split('\n'));
  return { added: [...b].filter((l) => !a.has(l)).slice(0, max), removed: [...a].filter((l) => !b.has(l)).slice(0, max) };
}

interface CheckEnv {
  ctx: MaintenanceContext;
  fetcher: PoliteFetcher;
  registry: TaxRegistry;
  regFile: RegistryFile;
  today: Date;
}

const emptyResult = (s: Source, url: string): SourceCheckResult => ({
  sourceId: s.id,
  country: s.country,
  url,
  ok: false,
  httpStatus: null,
  error: null,
  classification: 'unavailable',
  contentHash: null,
  relevantHash: null,
  lastModified: null,
  probes: [],
  newItems: [],
  futureYears: [],
  notes: [],
});

function rulesFor(env: CheckEnv, country: string, year: number): unknown | null {
  const v = env.regFile.countries[country]?.active[String(year)];
  if (!v) return null;
  try {
    return env.registry.getDataset(country, year, v).rules;
  } catch {
    return null;
  }
}

function mkChange(env: CheckEnv, s: Source, partial: Omit<DetectedChange, 'id' | 'country' | 'sourceId' | 'sourceUrl' | 'effectiveDate' | 'affectsExistingCalculations'> & { sourceUrl?: string }): DetectedChange {
  const effectiveDate = partial.taxYear ? `${partial.taxYear}-01-01` : null;
  const affects = partial.taxYear !== null && rulesFor(env, s.country, partial.taxYear) !== null && partial.proposedValue !== null;
  const c: DetectedChange = {
    ...partial,
    id: '',
    country: s.country,
    sourceId: s.id,
    sourceUrl: partial.sourceUrl ?? s.url,
    effectiveDate,
    affectsExistingCalculations: affects,
  };
  c.id = changeId(c);
  return c;
}

async function textOf(body: Buffer, contentType: string, method: Source['method']): Promise<string> {
  if (method === 'pdf-text' || contentType.includes('pdf')) return pdfToText(body);
  return htmlToText(body.toString('utf8'));
}

/** Compares probe values on a page against the dataset for the year the page describes. */
function evaluateProbes(env: CheckEnv, s: Source, text: string, pageYear: number, result: SourceCheckResult, url: string): DetectedChange[] {
  const changes: DetectedChange[] = [];
  const rules = rulesFor(env, s.country, pageYear);
  const latest = latestActiveYear(env.regFile, s.country);
  const reference = rules ?? (latest !== null ? rulesFor(env, s.country, latest) : null);
  for (const probe of s.probes) {
    const observed = runProbe(text, probe);
    const expected = reference !== null ? getByPath(reference, probe.rulePath) : undefined;
    const match = observed !== null && rules !== null && sameValue(observed, expected);
    result.probes.push({ probeId: probe.id, label: probe.label, rulePath: probe.rulePath, taxYear: pageYear, found: observed !== null, observed, expected: expected ?? null, match });
    if (observed === null) {
      result.notes.push(`Value "${probe.label}" was not found on the page — the layout may have changed. Check the source manually.`);
      continue;
    }
    if (rules !== null && match) continue;
    const kind = kindForYear(pageYear, rules !== null, env.today);
    const legislation = s.type === 'legislation';
    changes.push(
      mkChange(env, s, {
        category: probe.category,
        kind,
        rulePath: probe.rulePath,
        existingValue: rules !== null ? (expected ?? null) : null,
        proposedValue: observed,
        taxYear: pageYear,
        sourceUrl: url,
        publicationDate: result.lastModified,
        explanation:
          rules !== null
            ? `${s.authority} now states ${probe.label.toLowerCase()} = ${observed} for ${pageYear}; the active ${pageYear} dataset has ${JSON.stringify(expected)}.`
            : `${s.authority} publishes ${probe.label.toLowerCase()} = ${observed} for ${pageYear}, a tax year without NetWorth data yet${expected !== undefined ? ` (${latest}: ${JSON.stringify(expected)})` : ''}.` +
              (kind === 'future-regulation' ? ` It takes effect on 1 January ${pageYear} and must not change ${pageYear - 1} calculations.` : ''),
        confidence: legislation ? 'needs-research' : 'extracted-value',
      }),
    );
    if (legislation) changes[changes.length - 1].explanation += ' Source is consolidated law text — confirm from which tax year the amendment applies before approving.';
  }
  return changes;
}

async function checkHtml(env: CheckEnv, s: Source, prev: SourceState, year: number): Promise<{ result: SourceCheckResult; changes: DetectedChange[]; snapshot: string | null; knownYears: number[]; seenItems?: string[] }> {
  const url = s.url.replaceAll('{year}', String(year));
  const result = emptyResult(s, url);
  const changes: DetectedChange[] = [];
  const res = await env.fetcher.get(url);
  result.httpStatus = res.status;
  result.lastModified = res.lastModified;
  if (!res.ok || !res.body) {
    result.error = res.error ?? 'Unavailable';
    result.classification = res.blockedByRobots ? 'blocked-by-robots' : 'unavailable';
    return { result, changes, snapshot: null, knownYears: prev.knownYears };
  }
  result.ok = true;

  if (s.method === 'rss') {
    const items = parseFeed(res.body.toString('utf8'));
    const seen = new Set(prev.seenItems);
    result.contentHash = sha256(items.map((i) => i.id).join('\n'));
    const relevant = items.filter((i) => s.keywords.length === 0 || s.keywords.some((k) => i.title.toLowerCase().includes(k.toLowerCase())));
    result.relevantHash = sha256(relevant.map((i) => i.id).join('\n'));
    result.classification = classify(prev, result.contentHash, result.relevantHash);
    const fresh = prev.seenItems.length === 0 ? [] : relevant.filter((i) => !seen.has(i.id));
    result.newItems = fresh.map((i) => ({ title: i.title, link: i.link, date: i.date }));
    for (const item of fresh) {
      changes.push(
        mkChange(env, s, {
          category: s.category,
          kind: 'informational',
          rulePath: null,
          existingValue: null,
          proposedValue: null,
          taxYear: null,
          sourceUrl: item.link || url,
          publicationDate: item.date,
          explanation: `New publication: "${item.title}". A new publication is not itself a change in tax rules — review it to see whether any rule changes.`,
          confidence: 'needs-research',
        }),
      );
      changes[changes.length - 1].id = changeId({ ...changes[changes.length - 1], rulePath: item.id });
    }
    const seenItems = [...new Set([...items.map((i) => i.id), ...prev.seenItems])].slice(0, 500);
    return { result, changes, snapshot: items.map((i) => `${i.date ?? ''} ${i.title}`).join('\n'), knownYears: prev.knownYears, seenItems };
  }

  const text = await textOf(res.body, res.contentType, s.method);
  const relevant = relevantText(text, s.keywords);
  result.contentHash = sha256(text);
  result.relevantHash = sha256(relevant);
  result.classification = classify(prev, result.contentHash, result.relevantHash);
  const pageYear = findYear(text, s.yearPattern) ?? year;
  if (pageYear > year) result.futureYears.push(pageYear);

  changes.push(...evaluateProbes(env, s, text, pageYear, result, url));

  // A {year} page for next year appearing for the first time is a new publication.
  const knownYears = [...prev.knownYears];
  if (s.yearUrl) {
    const next = year + 1;
    const nextUrl = s.yearUrl.replaceAll('{year}', String(next));
    const nr = await env.fetcher.get(nextUrl);
    if (nr.ok && nr.body) {
      result.futureYears.push(next);
      const nextText = await textOf(nr.body, nr.contentType, s.method);
      const probeChanges = evaluateProbes(env, s, nextText, next, result, nextUrl);
      changes.push(...probeChanges);
      if (!knownYears.includes(next)) {
        knownYears.push(next);
        if (probeChanges.length === 0)
          changes.push(
            mkChange(env, s, {
              category: s.category,
              kind: kindForYear(next, false, env.today),
              rulePath: null,
              existingValue: null,
              proposedValue: null,
              taxYear: next,
              sourceUrl: nextUrl,
              publicationDate: nr.lastModified,
              explanation: `${s.authority} has published a page for ${next}, but no monitored value could be read from it. Review it manually.`,
              confidence: 'needs-research',
            }),
          );
      }
    } else if (!nr.ok && nr.status !== 404 && nr.status !== 410 && nr.status !== 302) {
      result.notes.push(`Could not check whether ${next} figures are published (${nr.error ?? 'error'}).`);
    }
  }

  const valueChanges = changes.filter((c) => c.proposedValue !== null);
  if (result.classification === 'relevant-change' && valueChanges.length === 0) {
    let before = '';
    try {
      before = fs.readFileSync(path.join(paths(env.ctx).snapshots, `${s.id}.txt`), 'utf8');
    } catch {
      /* no snapshot */
    }
    const d = lineDiff(before, relevant);
    changes.push(
      mkChange(env, s, {
        category: s.category,
        kind: 'informational',
        rulePath: null,
        existingValue: d.removed.join('\n') || null,
        proposedValue: null,
        taxYear: null,
        publicationDate: result.lastModified,
        explanation: `Tax-relevant text on this page changed, but none of the monitored values did. This may be an announcement or an editorial change — it is not treated as a rule change.${d.added.length ? ` New lines: ${d.added.map((l) => `"${l.slice(0, 140)}"`).join('; ')}` : ''}`,
        confidence: 'needs-research',
      }),
    );
    changes[changes.length - 1].id = changeId({ ...changes[changes.length - 1], rulePath: result.relevantHash });
  }
  return { result, changes, snapshot: relevant, knownYears };
}

/* ---------------- structured official APIs ---------------- */

interface MunicipalRow {
  name: string;
  municipalRate: number;
  churchRate: number;
  burialRate?: number;
}

function compareMunicipalities(env: CheckEnv, s: Source, year: number, rows: MunicipalRow[], average: { municipalRate: number; churchRate: number } | null, url: string, lastModified: string | null): DetectedChange[] {
  const rules = rulesFor(env, s.country, year) as { municipalities: (MunicipalRow & { id: string })[]; average: Record<string, number> } | null;
  const latest = latestActiveYear(env.regFile, s.country);
  const base = rules ?? (latest !== null ? (rulesFor(env, s.country, latest) as typeof rules) : null);
  if (!base) return [];
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
  const diffs: string[] = [];
  const updated = base.municipalities.map((m) => {
    const r = byName.get(m.name.toLowerCase());
    if (!r) return m;
    const next = { ...m, municipalRate: r.municipalRate, churchRate: r.churchRate, ...(r.burialRate !== undefined ? { burialRate: r.burialRate } : {}) };
    if (!sameValue(next, m)) diffs.push(`${m.name}: ${m.municipalRate}% → ${r.municipalRate}%${m.churchRate !== r.churchRate ? ` (church ${m.churchRate}% → ${r.churchRate}%)` : ''}`);
    return next;
  });
  const missing = base.municipalities.filter((m) => !byName.has(m.name.toLowerCase())).map((m) => m.name);
  const changes: DetectedChange[] = [];
  const kind = kindForYear(year, rules !== null, env.today);
  if (diffs.length > 0 || rules === null) {
    changes.push(
      mkChange(env, s, {
        category: 'local-tax',
        kind,
        rulePath: 'municipalities',
        existingValue: rules ? `${diffs.length} municipalities differ` : null,
        proposedValue: updated,
        taxYear: year,
        sourceUrl: url,
        publicationDate: lastModified,
        explanation: `${s.authority} publishes ${rows.length} local tax rates for ${year}. ${diffs.length} differ from ${rules ? `the active ${year} dataset` : `${latest} rates`}: ${diffs.slice(0, 8).join('; ')}${diffs.length > 8 ? '; …' : ''}.${missing.length ? ` Not in the official data (kept unchanged): ${missing.join(', ')}.` : ''}`,
        confidence: 'extracted-value',
      }),
    );
  }
  if (average) {
    for (const key of ['municipalRate', 'churchRate'] as const) {
      const current = base.average[key];
      if (current === undefined || (rules !== null && sameValue(current, average[key]))) continue;
      changes.push(
        mkChange(env, s, {
          category: 'local-tax',
          kind,
          rulePath: `average.${key}`,
          existingValue: rules ? current : null,
          proposedValue: average[key],
          taxYear: year,
          sourceUrl: url,
          publicationDate: lastModified,
          explanation: `National average ${key === 'municipalRate' ? 'municipal' : 'church'} tax rate for ${year} is ${average[key]}% according to ${s.authority}.`,
          confidence: 'extracted-value',
        }),
      );
    }
  }
  return changes;
}

async function checkStatbank(env: CheckEnv, s: Source, prev: SourceState, year: number) {
  const changes: DetectedChange[] = [];
  const fetchYear = async (y: number) => {
    const url = s.url.replaceAll('{year}', String(y));
    const r = await env.fetcher.get(url, 'text/csv');
    if (!r.ok || !r.body) return { url, r, rows: null as MunicipalRow[] | null, avg: null as { municipalRate: number; churchRate: number } | null, raw: '' };
    const raw = r.body.toString('utf8').replace(/^﻿/, '');
    const map = new Map<string, MunicipalRow>();
    let avg: { municipalRate: number; churchRate: number } | null = null;
    for (const line of raw.trim().split(/\r?\n/).slice(1)) {
      const [name, kind, , value] = line.split(';');
      const v = Number(value);
      if (!Number.isFinite(v)) continue;
      if (name === 'All Denmark') {
        avg = avg ?? { municipalRate: NaN, churchRate: NaN };
        if (kind.startsWith('Municipal')) avg.municipalRate = v;
        if (kind.startsWith('Church')) avg.churchRate = v;
        continue;
      }
      if (name.startsWith('Region ')) continue;
      const row = map.get(name) ?? { name, municipalRate: NaN, churchRate: NaN };
      if (kind.startsWith('Municipal')) row.municipalRate = v;
      if (kind.startsWith('Church')) row.churchRate = v;
      map.set(name, row);
    }
    return { url, r, rows: [...map.values()].filter((x) => Number.isFinite(x.municipalRate)), avg, raw };
  };
  const cur = await fetchYear(year);
  const result = emptyResult(s, cur.url);
  result.httpStatus = cur.r.status;
  if (!cur.rows || cur.rows.length === 0) {
    result.error = cur.r.error ?? 'No rows returned';
    result.classification = cur.r.blockedByRobots ? 'blocked-by-robots' : 'unavailable';
    return { result, changes, snapshot: null, knownYears: prev.knownYears };
  }
  result.ok = true;
  const canonical = cur.rows.map((r) => `${r.name};${r.municipalRate};${r.churchRate}`).sort().join('\n');
  result.contentHash = sha256(cur.raw);
  result.relevantHash = sha256(canonical);
  result.classification = classify(prev, result.contentHash, result.relevantHash);
  changes.push(...compareMunicipalities(env, s, year, cur.rows, cur.avg, cur.url, null));

  // Is next year's table already published?
  const knownYears = [...prev.knownYears];
  const info = await env.fetcher.get('https://api.statbank.dk/v1/tableinfo/PSKAT?format=JSON&lang=en', 'application/json');
  if (info.ok && info.body) {
    try {
      const j = JSON.parse(info.body.toString('utf8')) as { variables: { id: string; values: { id: string }[] }[] };
      const years = j.variables.find((v) => v.id === 'Tid')?.values.map((v) => Number(v.id)) ?? [];
      const next = year + 1;
      if (years.includes(next)) {
        result.futureYears.push(next);
        const nx = await fetchYear(next);
        if (nx.rows && nx.rows.length) changes.push(...compareMunicipalities(env, s, next, nx.rows, nx.avg, nx.url, null));
        if (!knownYears.includes(next)) knownYears.push(next);
      }
    } catch {
      result.notes.push('Could not read the table metadata to look for next year.');
    }
  } else result.notes.push(`Could not check for next year's rates (${info.error ?? 'error'}).`);
  return { result, changes, snapshot: canonical, knownYears };
}

async function checkSkvRowstore(env: CheckEnv, s: Source, prev: SourceState, year: number) {
  const changes: DetectedChange[] = [];
  type Row = Record<string, string>;
  const fetchYear = async (y: number): Promise<{ url: string; rows: Row[] | null; status: number | null; error: string | null; blocked: boolean }> => {
    const url = s.url.replaceAll('{year}', String(y));
    const rows: Row[] = [];
    let offset = 0;
    for (let page = 0; page < 10; page++) {
      const r = await env.fetcher.get(`${url}&_limit=500&_offset=${offset}`, 'application/json');
      if (!r.ok || !r.body) return { url, rows: null, status: r.status, error: r.error, blocked: r.blockedByRobots };
      const j = JSON.parse(r.body.toString('utf8')) as { resultCount: number; results: Row[] };
      rows.push(...j.results);
      offset += 500;
      if (offset >= j.resultCount) break;
    }
    return { url, rows, status: 200, error: null, blocked: false };
  };
  const aggregate = (rows: Row[]): MunicipalRow[] => {
    const by = new Map<string, { k: number; l: number; b: number[]; c: number[] }>();
    for (const r of rows) {
      const o = by.get(r.kommun) ?? { k: Number(r['kommunal-skatt']), l: Number(r['landstings-skatt']), b: [], c: [] };
      o.b.push(Number(r['begravnings-avgift']));
      o.c.push(Number(r.kyrkoavgift));
      by.set(r.kommun, o);
    }
    const avg = (a: number[]) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 1000) / 1000;
    const title = (n: string) => n.toLowerCase().replace(/(^|[\s-])(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
    return [...by.entries()].map(([name, o]) => ({ name: title(name), municipalRate: Math.round((o.k + o.l) * 100) / 100, burialRate: avg(o.b), churchRate: avg(o.c) }));
  };
  const cur = await fetchYear(year);
  const result = emptyResult(s, cur.url);
  result.httpStatus = cur.status;
  if (!cur.rows || cur.rows.length === 0) {
    result.error = cur.error ?? `No rates published for ${year}`;
    result.classification = cur.blocked ? 'blocked-by-robots' : 'unavailable';
    return { result, changes, snapshot: null, knownYears: prev.knownYears };
  }
  result.ok = true;
  const agg = aggregate(cur.rows);
  const canonical = agg.map((r) => `${r.name};${r.municipalRate};${r.burialRate};${r.churchRate}`).sort().join('\n');
  result.contentHash = sha256(JSON.stringify(cur.rows));
  result.relevantHash = sha256(canonical);
  result.classification = classify(prev, result.contentHash, result.relevantHash);
  changes.push(...compareMunicipalities(env, s, year, agg, null, cur.url, null));

  const knownYears = [...prev.knownYears];
  const next = await fetchYear(year + 1);
  if (next.rows && next.rows.length > 0) {
    result.futureYears.push(year + 1);
    changes.push(...compareMunicipalities(env, s, year + 1, aggregate(next.rows), null, next.url, null));
    if (!knownYears.includes(year + 1)) knownYears.push(year + 1);
  }
  return { result, changes, snapshot: canonical, knownYears };
}

/** Reference salaries recalculated by the official BMF calculator. */
export const BMF_REFERENCE_CASES = [
  { gross: 60000, taxClass: 1 },
  { gross: 120000, taxClass: 1 },
];

async function checkBmf(env: CheckEnv, s: Source, prev: SourceState, year: number) {
  const changes: DetectedChange[] = [];
  const base = s.url.replaceAll('{year}', String(year));
  const result = emptyResult(s, base);
  const rules = rulesFor(env, 'DE', year) as { social: { health: { averageAdditionalRate: number } } } | null;
  const kvz = rules ? (rules.social.health.averageAdditionalRate * 100).toFixed(2) : '2.90';
  const lines: string[] = [];
  let anyOk = false;
  for (const c of BMF_REFERENCE_CASES) {
    const url = `${base}?code=LSt${year}ext&LZZ=1&RE4=${c.gross * 100}&STKL=${c.taxClass}&KVZ=${kvz}&PVZ=1&PVS=0&PVA=0&KRV=0&PKV=0&ALV=0&AF=0&F=1&ZKF=0&R=0`;
    const r = await env.fetcher.get(url, 'application/xml');
    result.httpStatus = r.status;
    const xml = r.body?.toString('utf8') ?? '';
    const lst = /name="LSTLZZ" value="(\d+)"/.exec(xml);
    const soli = /name="SOLZLZZ" value="(\d+)"/.exec(xml);
    if (!r.ok || !lst) {
      result.error = r.error ?? 'Unexpected response from the BMF calculator';
      if (r.blockedByRobots) result.classification = 'blocked-by-robots';
      continue;
    }
    anyOk = true;
    const official = { wageTax: Number(lst[1]) / 100, soli: soli ? Number(soli[1]) / 100 : 0 };
    lines.push(`${c.gross};${c.taxClass};${official.wageTax};${official.soli}`);
    if (!rules) continue;
    const ours = env.registry.calculateNetSalary({ country: 'DE', taxYear: year, grossAnnual: c.gross, personal: { taxClass: String(c.taxClass), children: 0, age: 30 } });
    const parts = ours.lines.find((l) => l.id === 'income-tax')?.parts ?? [];
    const ourWage = parts.find((p) => p.label === 'Wage tax')?.amount ?? 0;
    const ourSoli = parts.find((p) => p.label === 'Solidarity surcharge')?.amount ?? 0;
    const ok = Math.abs(ourWage - official.wageTax) < 0.01 && Math.abs(ourSoli - official.soli) < 0.01;
    result.probes.push({ probeId: `bmf-${c.gross}`, label: `Wage tax, class ${c.taxClass}, €${c.gross}`, rulePath: '(calculation)', taxYear: year, found: true, observed: official.wageTax + official.soli, expected: ourWage + ourSoli, match: ok });
    if (!ok)
      changes.push(
        mkChange(env, s, {
          category: 'income-tax',
          kind: 'calculation-mismatch',
          rulePath: null,
          existingValue: { wageTax: ourWage, soli: ourSoli },
          proposedValue: null,
          taxYear: year,
          sourceUrl: url,
          publicationDate: null,
          explanation: `The official BMF calculator returns wage tax €${official.wageTax} + solidarity surcharge €${official.soli} for €${c.gross} (class ${c.taxClass}, ${year}); NetWorth calculates €${ourWage} + €${ourSoli}. A parameter of the ${year} payroll algorithm has probably changed — compare the latest PAP with the dataset.`,
          confidence: 'needs-research',
        }),
      );
  }
  if (!anyOk) {
    if (result.classification !== 'blocked-by-robots') result.classification = 'unavailable';
    return { result, changes, snapshot: null, knownYears: prev.knownYears };
  }
  result.ok = true;
  result.error = null;
  const canonical = lines.join('\n');
  result.contentHash = sha256(canonical);
  result.relevantHash = result.contentHash;
  result.classification = classify(prev, result.contentHash, result.relevantHash);

  const knownYears = [...prev.knownYears];
  const next = year + 1;
  const nr = await env.fetcher.get(`${s.url.replaceAll('{year}', String(next))}?code=LSt${next}ext&LZZ=1&RE4=6000000&STKL=1`, 'application/xml');
  if (nr.ok && nr.body && new RegExp(`jahr="${next}"`).test(nr.body.toString('utf8'))) {
    result.futureYears.push(next);
    if (!knownYears.includes(next)) {
      knownYears.push(next);
      changes.push(
        mkChange(env, s, {
          category: 'income-tax',
          kind: kindForYear(next, rulesFor(env, 'DE', next) !== null, env.today),
          rulePath: null,
          existingValue: null,
          proposedValue: null,
          taxYear: next,
          sourceUrl: s.url.replaceAll('{year}', String(next)),
          publicationDate: nr.lastModified,
          explanation: `The BMF has published the ${next} wage-tax algorithm (PAP ${next}). Its parameters must be transferred into a ${next} dataset; ${year} calculations are unaffected.`,
          confidence: 'needs-research',
        }),
      );
    }
  }
  return { result, changes, snapshot: canonical, knownYears };
}

/* ---------------- job orchestration ---------------- */

export interface CheckOptions {
  countries?: string[];
  onProgress?: (p: Progress) => void;
  runId?: string;
}

export async function runCheck(ctx: MaintenanceContext, opts: CheckOptions = {}): Promise<RunRecord> {
  const p = paths(ctx);
  const startedAt = isoNow(ctx);
  const runId = opts.runId ?? makeId('check', ctx);
  const registry = loadRegistry(ctx);
  const regFile = registry.registry;
  const env: CheckEnv = { ctx, fetcher: new PoliteFetcher(ctx), registry, regFile, today: ctx.now() };
  const countries = Object.keys(regFile.countries).filter((c) => !opts.countries || opts.countries.includes(c));
  const sources = loadSources(ctx).filter((s) => s.enabled && countries.includes(s.country));
  const state = loadState(ctx);
  const progress: Progress = { done: 0, total: sources.length, current: 'Starting', log: [] };
  const emit = (msg?: string) => {
    if (msg) {
      progress.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
      ctx.log(msg);
    }
    opts.onProgress?.({ ...progress, log: [...progress.log] });
  };
  emit(`Checking ${sources.length} official sources for ${countries.length} countries`);

  const results: SourceCheckResult[] = [];
  const changes: DetectedChange[] = [];

  for (const s of sources) {
    progress.current = `${s.country} · ${s.authority} — ${s.description.split('.')[0]}`;
    emit();
    const prev = sourceStateSchema.parse(state.sources[s.id] ?? {});
    const year = latestActiveYear(regFile, s.country) ?? ctx.now().getUTCFullYear();
    let out: { result: SourceCheckResult; changes: DetectedChange[]; snapshot: string | null; knownYears: number[]; seenItems?: string[] };
    try {
      if (s.method === 'statbank-pskat') out = await checkStatbank(env, s, prev, year);
      else if (s.method === 'skv-rowstore') out = await checkSkvRowstore(env, s, prev, year);
      else if (s.method === 'bmf-lohnsteuer') out = await checkBmf(env, s, prev, year);
      else out = await checkHtml(env, s, prev, year);
    } catch (e) {
      const r = emptyResult(s, s.url);
      r.error = e instanceof Error ? e.message : String(e);
      out = { result: r, changes: [], snapshot: null, knownYears: prev.knownYears };
    }
    const now = isoNow(ctx);
    const r = out.result;
    state.sources[s.id] = {
      ...prev,
      lastChecked: now,
      accessible: r.ok,
      lastError: r.ok ? null : r.error,
      consecutiveFailures: r.ok ? 0 : prev.consecutiveFailures + 1,
      ...(r.ok
        ? {
            lastSuccess: now,
            contentHash: r.contentHash,
            relevantHash: r.relevantHash,
            lastModified: r.lastModified,
            knownYears: out.knownYears,
            ...(out.seenItems ? { seenItems: out.seenItems } : {}),
          }
        : {}),
    };
    if (r.ok && out.snapshot !== null) writeTextFile(path.join(p.snapshots, `${s.id}.txt`), out.snapshot);
    results.push(r);
    changes.push(...out.changes);
    progress.done++;
    emit(`${r.ok ? '✓' : '✗'} ${s.id}: ${r.ok ? r.classification : `unavailable (${r.error})`}${out.changes.length ? ` — ${out.changes.length} change(s)` : ''}`);
  }

  // Proposals: one per distinct change. The same change found again is not duplicated.
  const proposals = loadProposals(ctx);
  const known = new Set(proposals.map((x) => x.id));
  const created: string[] = [];
  let duplicates = 0;
  const unique = new Map(changes.map((c) => [c.id, c]));
  for (const c of unique.values()) {
    if (known.has(c.id)) {
      duplicates++;
      continue;
    }
    const actionable = c.proposedValue !== null && (c.kind === 'modification' || c.kind === 'new-regulation' || c.kind === 'future-regulation');
    proposals.push({ ...c, status: actionable ? 'pending' : 'research', createdAt: isoNow(ctx), updatedAt: isoNow(ctx), runId, note: actionable ? null : 'Signal only — needs a person to read the source.', resultVersion: null, validation: null });
    created.push(c.id);
  }
  saveProposals(ctx, proposals);

  const failed = results.filter((r) => !r.ok);
  state.lastCheckRun = isoNow(ctx);
  state.lastCheckRunId = runId;
  saveState(ctx, state);

  const record: RunRecord = {
    id: runId,
    type: 'check',
    startedAt,
    finishedAt: isoNow(ctx),
    status: failed.length === 0 ? 'success' : failed.length === results.length ? 'failed' : 'partial',
    countriesChecked: countries,
    sourcesChecked: results.length,
    sourcesSucceeded: results.filter((r) => r.ok).map((r) => r.sourceId),
    sourcesFailed: failed.map((r) => ({ id: r.sourceId, error: r.error ?? 'unknown' })),
    changesDetected: unique.size,
    proposalsCreated: created,
    duplicatesSuppressed: duplicates,
    approved: [],
    rejected: [],
    tests: null,
    summary: `${results.length - failed.length}/${results.length} sources checked, ${unique.size} change(s) detected, ${created.length} new for review${duplicates ? `, ${duplicates} already known` : ''}${failed.length ? `, ${failed.length} source(s) failed — those countries are NOT confirmed unchanged` : ''}.`,
    results,
    changes: [...unique.values()],
  };
  writeJsonFile(path.join(p.history, `${runId}.json`), record);
  progress.current = 'Done';
  emit(record.summary);
  return record;
}
