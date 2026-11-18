import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MaintenanceContext } from '../../maintenance/engine/context';
import type { TestRunResult } from '../../maintenance/engine/types';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export interface MockSite {
  /** url → [status, body, contentType] */
  pages: Map<string, [number, string, string?]>;
  requests: string[];
}

/** A throw-away copy of the project's data with mocked government websites. */
export function makeFixture(sources: unknown[], opts: { now?: string; testsPass?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-maint-'));
  fs.cpSync(path.join(ROOT, 'tax-data'), path.join(dir, 'tax-data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests', 'tax'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests', 'tax', 'golden.json'), path.join(dir, 'tests', 'tax', 'golden.json'));
  fs.mkdirSync(path.join(dir, 'src', 'countries'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'countries', 'index.ts'), path.join(dir, 'src', 'countries', 'index.ts'));
  fs.mkdirSync(path.join(dir, 'maintenance', 'config'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'maintenance', 'config', 'catalog.json'), path.join(dir, 'maintenance', 'config', 'catalog.json'));
  fs.writeFileSync(path.join(dir, 'maintenance', 'config', 'sources.json'), JSON.stringify({ sources }));

  const site: MockSite = { pages: new Map(), requests: [] };
  const testRuns: string[][] = [];
  let testsPass = opts.testsPass ?? true;
  let now = new Date(opts.now ?? '2026-11-18T12:00:00Z');

  const fetchMock = (async (input: RequestInfo | URL) => {
    const url = String(input);
    site.requests.push(url);
    const hit = site.pages.get(url);
    if (!hit) return new Response('not found', { status: 404 });
    if (hit[0] === -1) throw new TypeError('fetch failed');
    return new Response(hit[1], { status: hit[0], headers: { 'content-type': hit[2] ?? 'text/html; charset=utf-8', 'last-modified': 'Mon, 16 Nov 2026 08:00:00 GMT' } });
  }) as typeof fetch;

  const ctx: MaintenanceContext = {
    root: dir,
    taxDataDir: path.join(dir, 'tax-data'),
    maintDir: path.join(dir, 'maintenance'),
    fetch: fetchMock,
    now: () => now,
    runTests: async (scope): Promise<TestRunResult> => {
      testRuns.push(scope);
      return testsPass ? { ran: true, passed: true, total: 100, failed: 0, summary: '100/100 tests passed' } : { ran: true, passed: false, total: 100, failed: 3, summary: '97/100 tests passed' };
    },
    git: null,
    hostDelayMs: 0,
    log: () => {},
  };
  return {
    ctx,
    dir,
    site,
    testRuns,
    setTestsPass: (v: boolean) => (testsPass = v),
    setNow: (iso: string) => (now = new Date(iso)),
    read: (rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')),
    exists: (rel: string) => fs.existsSync(path.join(dir, rel)),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** A tiny Norwegian-style rate page. */
export const noPage = (year: number, personfradrag: string) => `<html><head><title>x</title><script>var t=${Math.random()}</script></head><body>
<nav>Menu <a href="/">Home</a></nav>
<main><h1>Personfradrag</h1><p>Velg år</p><ul><li>${year}</li><li>${year - 1}</li></ul>
<p>Klasse 1</p><p>${personfradrag} kroner</p></main><footer>© Skatteetaten</footer></body></html>`;

export const NO_SOURCE = {
  id: 'no-test-personfradrag',
  country: 'NO',
  authority: 'Skatteetaten',
  url: 'https://www.skatteetaten.example/satser/personfradrag/',
  type: 'html',
  description: 'Personal allowance.',
  method: 'html-text',
  category: 'income-tax',
  keywords: ['kroner', 'klasse'],
  yearPattern: 'Velg år\\n(?<value>\\d{4})',
  probes: [{ id: 'pf', label: 'Personal allowance', rulePath: 'personalAllowance', pattern: 'Klasse 1\\n(?<value>[\\d ]+?) kroner', format: 'space-thousands', scale: 1, category: 'income-tax' }],
};
