import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRequestSecurity, createApi, HttpError, TOKEN_HEADER } from '../../maintenance/engine/api';
import { classify, kindForYear, loadProposals, loadState, runCheck, saveState } from '../../maintenance/engine/checker';
import { approveProposals, rollback, setProposalStatus } from '../../maintenance/engine/datasets';
import { htmlToText, parseFeed, parseFormatted, relevantText, runProbe, sha256 } from '../../maintenance/engine/extract';
import { isAllowed, parseRobots } from '../../maintenance/engine/fetcher';
import { getByPath, setByPath } from '../../maintenance/engine/paths';
import { loadRegistry } from '../../maintenance/engine/registryAccess';
import { addCountry, createVersionFromDraft, publishCountry } from '../../maintenance/engine/scaffold';
import { checkSchema } from '../../maintenance/engine/validate';
import { countryModules } from '../../src/countries';
import { createGenericModule } from '../../src/engine/generic';
import type { CountryModule } from '../../src/engine/types';
import { makeFixture, NO_SOURCE, noPage } from './fixture';

const fixtures: { cleanup: () => void }[] = [];
const fx = (...a: Parameters<typeof makeFixture>) => {
  const f = makeFixture(...a);
  fixtures.push(f);
  return f;
};
afterEach(() => {
  while (fixtures.length) fixtures.pop()!.cleanup();
});

describe('content extraction and hashing', () => {
  it('strips scripts, navigation and attributes containing ">"', () => {
    const t = htmlToText('<nav>Menu</nav><div class="a [&>span]:x">Rate: <b>7,6</b> %</div><script>x()</script><p>Next &amp; last</p>');
    expect(t).toBe('Rate: 7,6 %\nNext & last');
  });
  it('hashes identical content identically and different content differently', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
  it('the same page with a different script/timestamp produces the same text hash', () => {
    expect(sha256(htmlToText(noPage(2026, '114 540')))).toBe(sha256(htmlToText(noPage(2026, '114 540'))));
  });
  it('keeps only keyword lines as the relevant part', () => expect(relevantText('a 5 kroner\nweather\nb kroner', ['kroner'])).toBe('a 5 kroner\nb kroner'));
  it('parses official number formats', () => {
    expect(parseFormatted('114 540', 'space-thousands')).toBe(114540);
    expect(parseFormatted('641.200', 'dot-thousands')).toBe(641200);
    expect(parseFormatted('38,883', 'comma-thousands')).toBe(38883);
    expect(parseFormatted('7,6', 'decimal-comma')).toBe(7.6);
    expect(parseFormatted('abc', 'decimal-dot')).toBeNull();
    expect(runProbe('Bundskat: 12,01 %', { pattern: 'Bundskat: (?<value>[\\d,]+) %', format: 'decimal-comma', scale: 0.01 })).toBe(0.1201);
  });
  it('reads RSS and Atom items', () => {
    const items = parseFeed('<rss><channel><item><title>New rates 2027</title><link>https://x/1</link><guid>1</guid><pubDate>Mon, 16 Nov 2026</pubDate></item></channel></rss>');
    expect(items).toEqual([{ id: '1', title: 'New rates 2027', link: 'https://x/1', date: 'Mon, 16 Nov 2026' }]);
  });
  it('classifies first snapshot, unchanged, unrelated and relevant changes', () => {
    const base = { lastChecked: null, lastSuccess: null, accessible: null, lastModified: null, lastError: null, consecutiveFailures: 0, seenItems: [], knownYears: [] };
    expect(classify({ ...base, contentHash: null, relevantHash: null }, 'a', 'r')).toBe('first-snapshot');
    expect(classify({ ...base, contentHash: 'a', relevantHash: 'r' }, 'a', 'r')).toBe('unchanged');
    expect(classify({ ...base, contentHash: 'a', relevantHash: 'r' }, 'b', 'r')).toBe('unrelated-change');
    expect(classify({ ...base, contentHash: 'a', relevantHash: 'r' }, 'b', 's')).toBe('relevant-change');
  });
  it('dot paths read and write rules without inventing fields', () => {
    const o = { a: { b: [{ c: 1 }] } };
    expect(getByPath(o, 'a.b.0.c')).toBe(1);
    expect(setByPath(o, 'a.b.0.c', 2).a.b[0].c).toBe(2);
    expect(o.a.b[0].c).toBe(1);
    expect(() => setByPath(o, 'a.x', 1)).toThrow(/does not exist/);
  });
});

describe('robots.txt', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/rates\nCrawl-delay: 60\n\nUser-agent: OtherBot\nDisallow: /');
  it('honours Disallow, longest-match Allow and Crawl-delay', () => {
    expect(isAllowed(rules, '/private/x')).toBe(false);
    expect(isAllowed(rules, '/private/rates/2026')).toBe(true);
    expect(isAllowed(rules, '/satser')).toBe(true);
    expect(rules.crawlDelay).toBe(60);
  });
});

describe('effective dates', () => {
  const today = new Date('2026-11-18T00:00:00Z');
  it('a change for next year is a future regulation, never a modification of this year', () => {
    expect(kindForYear(2027, false, today)).toBe('future-regulation');
    expect(kindForYear(2026, true, today)).toBe('modification');
    expect(kindForYear(2026, false, today)).toBe('new-regulation');
  });
});

describe('source monitoring', () => {
  it('first check stores snapshots; an identical second check reports no changes', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    const r1 = await runCheck(f.ctx);
    expect(r1.results![0].classification).toBe('first-snapshot');
    expect(r1.results![0].probes[0]).toMatchObject({ found: true, observed: 114540, match: true });
    expect(r1.proposalsCreated).toEqual([]);
    expect(f.exists('maintenance/data/snapshots/no-test-personfradrag.txt')).toBe(true);
    const r2 = await runCheck(f.ctx);
    expect(r2.results![0].classification).toBe('unchanged');
    expect(r2.status).toBe('success');
  });

  it('detects a changed value as a modification with old and new value', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    await runCheck(f.ctx);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '120 000')]);
    const r = await runCheck(f.ctx);
    expect(r.results![0].classification).toBe('relevant-change');
    const [p] = loadProposals(f.ctx);
    expect(p).toMatchObject({ country: 'NO', kind: 'modification', rulePath: 'personalAllowance', existingValue: 114540, proposedValue: 120000, taxYear: 2026, effectiveDate: '2026-01-01', status: 'pending', confidence: 'extracted-value', affectsExistingCalculations: true, sourceUrl: NO_SOURCE.url });
    expect(p.publicationDate).toMatch(/16 Nov 2026/);
  });

  it('does not create the same proposal twice', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '120 000')]);
    const r1 = await runCheck(f.ctx);
    const r2 = await runCheck(f.ctx);
    expect(r1.proposalsCreated).toHaveLength(1);
    expect(r2.proposalsCreated).toHaveLength(0);
    expect(r2.duplicatesSuppressed).toBe(1);
    expect(loadProposals(f.ctx)).toHaveLength(1);
  });

  it('values announced for next year are proposed for that year only', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2027, '119 000')]);
    await runCheck(f.ctx);
    const [p] = loadProposals(f.ctx);
    expect(p).toMatchObject({ kind: 'future-regulation', taxYear: 2027, effectiveDate: '2027-01-01', existingValue: null, proposedValue: 119000, affectsExistingCalculations: false });
  });

  it('a page change outside the tax-relevant lines is reported as unrelated', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    await runCheck(f.ctx);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540').replace('<h1>Personfradrag</h1>', '<h1>Personfradrag og satser</h1>')]);
    const r = await runCheck(f.ctx);
    expect(r.results![0].classification).toBe('unrelated-change');
    expect(loadProposals(f.ctx)).toHaveLength(0);
  });

  it('a relevant text change without a value change is informational only', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    await runCheck(f.ctx);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540').replace('</main>', '<p>New guidance for 2026 kroner payments</p></main>')]);
    await runCheck(f.ctx);
    const [p] = loadProposals(f.ctx);
    expect(p).toMatchObject({ kind: 'informational', proposedValue: null, status: 'research' });
    expect(p.explanation).toMatch(/not treated as a rule change/);
  });

  it('a failed retrieval is tracked separately and never treated as "unchanged"', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    await runCheck(f.ctx);
    const hashBefore = loadState(f.ctx).sources[NO_SOURCE.id].contentHash;
    f.site.pages.set(NO_SOURCE.url, [500, 'error']);
    const r = await runCheck(f.ctx);
    expect(r.status).toBe('failed');
    expect(r.results![0].classification).toBe('unavailable');
    expect(r.sourcesFailed[0]).toMatchObject({ id: NO_SOURCE.id, error: 'HTTP 500' });
    expect(r.summary).toMatch(/NOT confirmed unchanged/);
    const st = loadState(f.ctx).sources[NO_SOURCE.id];
    expect(st.accessible).toBe(false);
    expect(st.consecutiveFailures).toBe(1);
    expect(st.contentHash).toBe(hashBefore);
  });

  it('network errors are reported, not thrown', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [-1, '']);
    const r = await runCheck(f.ctx);
    expect(r.results![0].ok).toBe(false);
    expect(r.results![0].error).toMatch(/fetch failed/);
  });

  it('respects robots.txt and does not fetch disallowed pages', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set('https://www.skatteetaten.example/robots.txt', [200, 'User-agent: *\nDisallow: /satser/', 'text/plain']);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    const r = await runCheck(f.ctx);
    expect(r.results![0].classification).toBe('blocked-by-robots');
    expect(f.site.requests).not.toContain(NO_SOURCE.url);
  });

  it('reports a probe whose value is no longer on the page instead of assuming no change', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, '<p>Velg år</p><p>2026</p><p>Page moved</p>']);
    const r = await runCheck(f.ctx);
    expect(r.results![0].probes[0].found).toBe(false);
    expect(r.results![0].notes.join(' ')).toMatch(/not found on the page/);
  });

  it('detects new publications in an RSS feed', async () => {
    const feed = (items: string[]) => `<rss><channel>${items.map((t, i) => `<item><title>${t}</title><link>https://gov.example/n/${i}</link><guid>${t}</guid></item>`).join('')}</channel></rss>`;
    const src = { id: 'gr-test-feed', country: 'GR', authority: 'AADE', url: 'https://gov.example/rss.xml', type: 'rss', description: 'News feed', method: 'rss', category: 'income-tax', keywords: [] };
    const f = fx([src]);
    f.site.pages.set(src.url, [200, feed(['Old news']), 'application/rss+xml']);
    await runCheck(f.ctx);
    f.site.pages.set(src.url, [200, feed(['Νέα κλίμακα φόρου 2027', 'Old news']), 'application/rss+xml']);
    const r = await runCheck(f.ctx);
    expect(r.results![0].classification).toBe('relevant-change');
    expect(r.results![0].newItems.map((i) => i.title)).toEqual(['Νέα κλίμακα φόρου 2027']);
    const [p] = loadProposals(f.ctx);
    expect(p).toMatchObject({ kind: 'informational', status: 'research', proposedValue: null });
    expect(p.explanation).toMatch(/not itself a change in tax rules/);
    const again = await runCheck(f.ctx);
    expect(again.proposalsCreated).toHaveLength(0);
  });
});

describe('structured official data (Statistics Denmark)', () => {
  const src = { id: 'dk-test-pskat', country: 'DK', authority: 'Statistics Denmark', url: 'https://api.statbank.example/PSKAT?Tid={year}', type: 'api', description: 'Municipal rates', method: 'statbank-pskat', category: 'local-tax' };
  const csv = (copenhagen: number, avg = 25.05) =>
    `﻿OMRÅDE;SKATPCT;TID;INDHOLD\nAll Denmark;Municipal tax rate;2026;${avg}\nAll Denmark;Church tax rate;2026;0.87\nCopenhagen;Municipal tax rate;2026;${copenhagen}\nCopenhagen;Church tax rate;2026;0.80\nAarhus;Municipal tax rate;2026;24.52\nAarhus;Church tax rate;2026;0.74\n`;
  it('compares every municipality and proposes the changed list', async () => {
    const f = fx([src]);
    f.site.pages.set('https://api.statbank.example/PSKAT?Tid=2026', [200, csv(23.9), 'text/csv']);
    await runCheck(f.ctx);
    const p = loadProposals(f.ctx).find((x) => x.rulePath === 'municipalities')!;
    expect(p.kind).toBe('modification');
    expect(p.explanation).toMatch(/Copenhagen: 23.39% → 23.9%/);
    const list = p.proposedValue as { name: string; municipalRate: number }[];
    expect(list.find((m) => m.name === 'Copenhagen')!.municipalRate).toBe(23.9);
    expect(list).toHaveLength(98);
  });
  it('matching official rates produce no proposals', async () => {
    const f = fx([src]);
    f.site.pages.set('https://api.statbank.example/PSKAT?Tid=2026', [200, csv(23.39), 'text/csv']);
    const r = await runCheck(f.ctx);
    expect(r.changesDetected).toBe(0);
  });
});

describe('review, versioning and rollback', () => {
  async function withPending(testsPass = true) {
    const f = fx([NO_SOURCE], { testsPass });
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '120 000')]);
    await runCheck(f.ctx);
    return { f, id: loadProposals(f.ctx)[0].id };
  }

  it('approval creates a new version, activates it and keeps the old one', async () => {
    const { f, id } = await withPending();
    const before = loadRegistry(f.ctx).calculateNetSalary({ country: 'NO', taxYear: 2026, grossAnnual: 600000 });
    const rec = await approveProposals(f.ctx, [id]);
    expect(rec.status).toBe('success');
    expect(f.testRuns).toEqual([['tests/tax']]);
    expect(f.read('tax-data/registry.json').countries.NO.active['2026']).toBe('2026.2');
    const v2 = f.read('tax-data/NO/2026.2.json');
    expect(v2.rules.personalAllowance).toBe(120000);
    expect(v2.meta).toMatchObject({ version: '2026.2', previousVersion: '2026.1', taxYear: 2026, effectiveDate: '2026-01-01' });
    expect(f.read('tax-data/NO/2026.1.json').rules.personalAllowance).toBe(114540);
    const reg = loadRegistry(f.ctx);
    expect(reg.calculateNetSalary({ country: 'NO', taxYear: 2026, grossAnnual: 600000, datasetVersion: '2026.1' }).netAnnual).toBe(before.netAnnual);
    expect(reg.calculateNetSalary({ country: 'NO', taxYear: 2026, grossAnnual: 600000 }).netAnnual).toBeGreaterThan(before.netAnnual);
    expect(f.read('tests/tax/golden.json').cases.some((c: { version: string; country: string }) => c.country === 'NO' && c.version === '2026.2')).toBe(true);
    expect(loadProposals(f.ctx)[0]).toMatchObject({ status: 'approved', resultVersion: '2026.2' });
    expect(loadProposals(f.ctx)[0].validation?.golden.ok).toBe(true);
  });

  it('does not activate when the test suite fails', async () => {
    const { f, id } = await withPending(false);
    const rec = await approveProposals(f.ctx, [id]);
    expect(rec.status).toBe('failed');
    expect(f.read('tax-data/registry.json').countries.NO.active['2026']).toBe('2026.1');
    expect(f.exists('tax-data/NO/2026.2.json')).toBe(false);
    expect(loadProposals(f.ctx)[0].status).toBe('failed-validation');
  });

  it('does not activate an invalid dataset (schema) and never runs tests for it', async () => {
    const { f, id } = await withPending();
    const proposals = f.read('maintenance/data/proposals.json');
    proposals.proposals[0].rulePath = 'generalIncomeRate';
    proposals.proposals[0].proposedValue = 22; // 2200% — rejected by the schema
    fs.writeFileSync(path.join(f.dir, 'maintenance/data/proposals.json'), JSON.stringify(proposals));
    const rec = await approveProposals(f.ctx, [id]);
    expect(rec.status).toBe('failed');
    expect(f.testRuns).toHaveLength(0);
    expect(loadProposals(f.ctx)[0].validation?.schema.ok).toBe(false);
  });

  it('rejects a change that would make net pay fall as gross rises (invariants)', async () => {
    const { f, id } = await withPending();
    const proposals = f.read('maintenance/data/proposals.json');
    proposals.proposals[0].rulePath = 'bracketTax.4.rate';
    proposals.proposals[0].proposedValue = 1; // 100% step-5 rate: total marginal rate > 100%, net falls
    fs.writeFileSync(path.join(f.dir, 'maintenance/data/proposals.json'), JSON.stringify(proposals));
    await approveProposals(f.ctx, [id]);
    expect(loadProposals(f.ctx)[0].validation?.invariants.ok).toBe(false);
    expect(f.read('tax-data/registry.json').countries.NO.active['2026']).toBe('2026.1');
  });

  it('a future-year proposal creates a separate, incomplete dataset and leaves the current year alone', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2027, '119 000')]);
    await runCheck(f.ctx);
    await approveProposals(f.ctx, [loadProposals(f.ctx)[0].id]);
    const reg = f.read('tax-data/registry.json');
    expect(reg.countries.NO.active).toEqual({ '2026': '2026.1', '2027': '2027.1' });
    const v = f.read('tax-data/NO/2027.1.json');
    expect(v.meta).toMatchObject({ taxYear: 2027, effectiveDate: '2027-01-01', verificationStatus: 'incomplete' });
    expect(v.meta.unverified[0]).toMatch(/carried over from 2026.1/);
  });

  it('reject and research update status; approved proposals cannot be rejected', async () => {
    const { f, id } = await withPending();
    setProposalStatus(f.ctx, [id], 'research', 'Check the press release');
    expect(loadProposals(f.ctx)[0]).toMatchObject({ status: 'research', note: 'Check the press release' });
    setProposalStatus(f.ctx, [id], 'rejected', 'Typo on the website');
    expect(loadProposals(f.ctx)[0].status).toBe('rejected');
    await expect(approveProposals(f.ctx, [id])).rejects.toThrow(/already rejected/);
  });

  it('informational proposals cannot be approved', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    await runCheck(f.ctx);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540').replace('</main>', '<p>Extra kroner note</p></main>')]);
    await runCheck(f.ctx);
    await expect(approveProposals(f.ctx, [loadProposals(f.ctx)[0].id])).rejects.toThrow(/no concrete value/);
  });

  it('rollback restores the previous version after tests pass, and is reverted if they fail', async () => {
    const { f, id } = await withPending();
    await approveProposals(f.ctx, [id]);
    f.setTestsPass(false);
    const failed = await rollback(f.ctx, 'NO', 2026, '2026.1');
    expect(failed.status).toBe('failed');
    expect(f.read('tax-data/registry.json').countries.NO.active['2026']).toBe('2026.2');
    f.setTestsPass(true);
    const ok = await rollback(f.ctx, 'NO', 2026, '2026.1');
    expect(ok.status).toBe('success');
    expect(f.read('tax-data/registry.json').countries.NO.active['2026']).toBe('2026.1');
    expect(f.exists('tax-data/NO/2026.2.json')).toBe(true); // history is never deleted
    await expect(rollback(f.ctx, 'NO', 2026, '2026.1')).rejects.toThrow(/already active/);
  });

  it('every operation is recorded in the history', async () => {
    const { f, id } = await withPending();
    await approveProposals(f.ctx, [id]);
    const files = fs.readdirSync(path.join(f.dir, 'maintenance/data/history'));
    expect(files.some((x) => x.startsWith('check-'))).toBe(true);
    expect(files.some((x) => x.startsWith('approve-'))).toBe(true);
  });
});

describe('dataset validation', () => {
  it('rejects datasets with bad metadata or rules', () => {
    const mod = countryModules.find((m) => m.code === 'NO');
    const ds = JSON.parse(fs.readFileSync('tax-data/NO/2026.1.json', 'utf8'));
    expect(checkSchema(mod, ds).ok).toBe(true);
    expect(checkSchema(mod, { ...ds, meta: { ...ds.meta, effectiveDate: '2025-01-01' } }).errors.join()).toMatch(/outside tax year/);
    expect(checkSchema(mod, { ...ds, rules: { ...ds.rules, bracketTax: [] } }).ok).toBe(false);
    expect(checkSchema(undefined, ds).errors.join()).toMatch(/No calculation module/);
  });
});

describe('new country scaffolding', () => {
  it('registers Austria as Under Development with sources, module, draft, tests and report — and no invented values', async () => {
    const f = fx([]);
    f.site.pages.set('https://www.bmf.gv.at/', [200, '<a href="/themen/steuern/lohnsteuer-tarif.html">Lohnsteuer Tarif</a><a href="https://evil.example/tax">tax</a><a href="/presse">Presse</a>']);
    const rec = await addCountry(f.ctx, 'AT');
    expect(rec.status).toBe('success');
    const reg = f.read('tax-data/registry.json');
    expect(reg.countries.AT).toEqual({ name: 'Austria', status: 'under-development', active: {} });
    const sources = f.read('maintenance/config/sources.json').sources.filter((s: { country: string }) => s.country === 'AT');
    expect(sources.map((s: { url: string }) => s.url)).toContain('https://www.bmf.gv.at/themen/steuern/lohnsteuer-tarif.html');
    expect(sources.some((s: { url: string }) => s.url.includes('evil.example'))).toBe(false);
    const draft = f.read('tax-data/AT/draft.json');
    expect(draft.rules.incomeTax).toEqual({ personalAllowance: null, brackets: null, taxCredit: null });
    expect(draft.research.every((r: { status: string }) => r.status === 'missing')).toBe(true);
    expect(fs.readFileSync(path.join(f.dir, 'src/countries/index.ts'), 'utf8')).toMatch(/import \{ atModule \} from '\.\/at'/);
    expect(f.exists('src/countries/at/index.ts')).toBe(true);
    expect(f.exists('tests/tax/generated/at.scaffold.test.ts')).toBe(true);
    expect(fs.readFileSync(path.join(f.dir, 'docs/countries/AT.md'), 'utf8')).toMatch(/Still to research/);
    await expect(addCountry(f.ctx, 'AT')).rejects.toThrow(/already registered/);
    await expect(addCountry(f.ctx, 'ZZ')).rejects.toThrow(/not in the authority catalog/);
  });

  it('an incomplete draft cannot become a dataset; a completed one can, and only verified data is published', async () => {
    const f = fx([]);
    await addCountry(f.ctx, 'AT', { discover: false });
    const mods = [...countryModules, createGenericModule({ code: 'AT', name: 'Austria', currency: 'EUR' }) as CountryModule];
    const first = await createVersionFromDraft(f.ctx, 'AT', mods);
    expect(first.status).toBe('failed');
    expect(loadRegistry(f.ctx, mods).listCountries().some((c) => c.code === 'AT')).toBe(false);

    const draftPath = path.join(f.dir, 'tax-data/AT/draft.json');
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    draft.rules = { incomeTax: { personalAllowance: 0, brackets: [{ upTo: 13308, rate: 0 }, { upTo: 21617, rate: 0.2 }, { upTo: null, rate: 0.3 }], taxCredit: 0 }, contributions: [{ id: 'sv', label: 'Social insurance', rate: 0.18, ceiling: 100000, deductible: true }] };
    draft.research = draft.research.map((r: object) => ({ ...r, status: 'researched', sourceUrl: 'https://www.bmf.gv.at/' }));
    fs.writeFileSync(draftPath, JSON.stringify(draft));
    const second = await createVersionFromDraft(f.ctx, 'AT', mods);
    expect(second.status).toBe('success');
    expect(f.read('tax-data/AT/2026.1.json').meta.verificationStatus).toBe('estimated');
    expect(f.read('tax-data/registry.json').countries.AT.status).toBe('under-development');
    expect(loadRegistry(f.ctx, mods).listCountries().some((c) => c.code === 'AT')).toBe(false);

    const pub = await publishCountry(f.ctx, 'AT');
    expect(pub.status).toBe('success');
    expect(loadRegistry(f.ctx, mods).listCountries().some((c) => c.code === 'AT')).toBe(true);
  });

  it('publishing an incomplete dataset is refused', async () => {
    const f = fx([]);
    await addCountry(f.ctx, 'AT', { discover: false });
    const reg = f.read('tax-data/registry.json');
    reg.countries.AT.active = { '2026': '2026.1' };
    const ds = { ...f.read('tax-data/NO/2026.1.json'), meta: { ...f.read('tax-data/NO/2026.1.json').meta, country: 'AT', verificationStatus: 'incomplete', unverified: ['Brackets'] } };
    fs.mkdirSync(path.join(f.dir, 'tax-data/AT'), { recursive: true });
    fs.writeFileSync(path.join(f.dir, 'tax-data/AT/2026.1.json'), JSON.stringify(ds));
    fs.writeFileSync(path.join(f.dir, 'tax-data/registry.json'), JSON.stringify(reg));
    await expect(publishCountry(f.ctx, 'AT')).rejects.toThrow(/still incomplete/);
  });
});

describe('security of the administrative service', () => {
  const token = 'a'.repeat(64);
  const ok = { host: '127.0.0.1:5341', [TOKEN_HEADER]: token };
  it('accepts the local host with the right token', () => expect(() => checkRequestSecurity({ headers: ok }, token, 5341)).not.toThrow());
  it('refuses a missing or wrong token', () => {
    expect(() => checkRequestSecurity({ headers: { host: '127.0.0.1:5341' } }, token, 5341)).toThrow(HttpError);
    expect(() => checkRequestSecurity({ headers: { ...ok, [TOKEN_HEADER]: 'b'.repeat(64) } }, token, 5341)).toThrow(/token/);
  });
  it('refuses other Host headers (DNS rebinding)', () => expect(() => checkRequestSecurity({ headers: { ...ok, host: 'evil.example:5341' } }, token, 5341)).toThrow(/local/));
  it('refuses cross-site origins', () => expect(() => checkRequestSecurity({ headers: { ...ok, origin: 'https://evil.example' } }, token, 5341)).toThrow(/Cross-site/));

  it('end-to-end: the HTTP API enforces auth, validates input and limits body size', async () => {
    const f = fx([NO_SOURCE]);
    const server = http.createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const api = createApi(f.ctx, { token, port });
    server.on('request', (req, res) => void api.handle(req, res));
    const call = (p: string, init: RequestInit = {}, withToken = true) => fetch(`http://127.0.0.1:${port}${p}`, { ...init, headers: { ...(withToken ? { [TOKEN_HEADER]: token } : {}), 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    try {
      expect((await call('/api/status', {}, false)).status).toBe(401);
      const s = await call('/api/status');
      expect(s.status).toBe(200);
      expect((await s.json()).countries).toHaveLength(6);
      expect((await call('/api/countries/../../etc/versions')).status).toBe(404);
      expect((await call('/api/rollback', { method: 'POST', body: JSON.stringify({ country: '../x', taxYear: 2026, version: '1' }) })).status).toBe(400);
      expect((await call('/api/proposals/approve', { method: 'POST', body: JSON.stringify({ ids: ['not-an-id'] }) })).status).toBe(400);
      expect((await call('/api/settings', { method: 'POST', body: 'x'.repeat(70000) })).status).toBe(413);
      const set = await call('/api/settings', { method: 'POST', body: JSON.stringify({ monthlyCheck: true, dayOfMonth: 3 }) });
      expect(await set.json()).toMatchObject({ monthlyCheck: true, dayOfMonth: 3 });
    } finally {
      server.close();
    }
  });

  it('monthly scheduling runs once per month after the configured day', async () => {
    const f = fx([NO_SOURCE]);
    f.site.pages.set(NO_SOURCE.url, [200, noPage(2026, '114 540')]);
    const api = createApi(f.ctx, { token, port: 1 });
    expect(api.maybeRunScheduled()).toBe(false); // disabled by default
    const st = loadState(f.ctx);
    st.settings.monthlyCheck = true;
    st.settings.dayOfMonth = 1;
    saveState(f.ctx, st);
    expect(api.maybeRunScheduled()).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(api.maybeRunScheduled()).toBe(false); // already ran this month
    f.setNow('2026-12-02T12:00:00Z');
    expect(api.maybeRunScheduled()).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
  });
});
