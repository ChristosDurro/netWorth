import fs from 'node:fs';
import path from 'node:path';
import type { TestRunResult } from './types';

/**
 * Everything the engine touches on the outside world. Tests replace `fetch`,
 * `now`, `runTests` and the directories so they never hit real websites or
 * the real project files.
 */
export interface MaintenanceContext {
  /** Project root (contains tax-data/, src/, tests/). */
  root: string;
  taxDataDir: string;
  maintDir: string;
  fetch: typeof fetch;
  now: () => Date;
  /** Runs the automated test suite against the files currently on disk. */
  runTests: (scope: string[]) => Promise<TestRunResult>;
  /** Optional git integration; null disables commits. */
  git: { commit: (message: string, paths: string[]) => Promise<string> } | null;
  /** Minimum delay between two requests to the same host. */
  hostDelayMs: number;
  log: (msg: string) => void;
}

export const paths = (ctx: MaintenanceContext) => ({
  sources: path.join(ctx.maintDir, 'config', 'sources.json'),
  catalog: path.join(ctx.maintDir, 'config', 'catalog.json'),
  state: path.join(ctx.maintDir, 'data', 'state.json'),
  proposals: path.join(ctx.maintDir, 'data', 'proposals.json'),
  history: path.join(ctx.maintDir, 'data', 'history'),
  snapshots: path.join(ctx.maintDir, 'data', 'snapshots'),
  registry: path.join(ctx.taxDataDir, 'registry.json'),
  golden: path.join(ctx.root, 'tests', 'tax', 'golden.json'),
  generatedTests: path.join(ctx.root, 'tests', 'tax', 'generated'),
  countriesIndex: path.join(ctx.root, 'src', 'countries', 'index.ts'),
  countriesDir: path.join(ctx.root, 'src', 'countries'),
  docsCountries: path.join(ctx.root, 'docs', 'countries'),
});

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Write via a temp file + rename so a crash never leaves half a JSON file. */
export function writeJsonFile(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function writeTextFile(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

export const isoNow = (ctx: MaintenanceContext): string => ctx.now().toISOString();

export function makeId(prefix: string, ctx: MaintenanceContext): string {
  const t = ctx.now().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${t}-${Math.random().toString(36).slice(2, 7)}`;
}
