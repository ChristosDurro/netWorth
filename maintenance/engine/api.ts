import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { z } from 'zod';
import { loadProposals, loadSources, loadState, runCheck, saveState } from './checker';
import { makeId, paths, readJsonFile, type MaintenanceContext } from './context';
import { approveProposals, rollback, setProposalStatus } from './datasets';
import { readDataset } from './registryAccess';
import { addCountry, countryOverview, createVersionFromDraft, loadCatalog, publishCountry, readDraft } from './scaffold';
import { settingsSchema, type Progress, type RunRecord } from './types';

export const TOKEN_HEADER = 'x-networth-admin-token';
const MAX_BODY = 64 * 1024;

export interface Job {
  id: string;
  kind: 'check';
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  progress: Progress;
  result: RunRecord | null;
  error: string | null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Security model: the service listens on 127.0.0.1 only, every request needs the
 * random admin token (kept in a git-ignored file and injected by the Vite dev
 * proxy, never shipped to the browser bundle), the Host header must be local
 * (blocks DNS rebinding) and cross-site Origins are refused.
 */
export function checkRequestSecurity(req: Pick<IncomingMessage, 'headers'>, token: string, port: number): void {
  const host = String(req.headers.host ?? '');
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(host)) throw new HttpError(403, 'Requests must target the local maintenance service directly.');
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin))) throw new HttpError(403, 'Cross-site requests are not allowed.');
  const given = String(req.headers[TOKEN_HEADER] ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Missing or invalid admin token. Start the app with "npm run admin".');
}

export function ensureToken(ctx: MaintenanceContext): string {
  const file = path.join(ctx.maintDir, 'data', '.admin-token');
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch {
    /* create below */
  }
  const t = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, t, { mode: 0o600 });
  return t;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large.');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be JSON.');
  }
}

const idsBody = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{16}$/)).min(1).max(200), note: z.string().max(2000).nullable().optional() });
const countryCode = z.string().regex(/^[A-Z]{2}$/);

export function listHistory(ctx: MaintenanceContext, limit = 50): RunRecord[] {
  const dir = paths(ctx).history;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJsonFile<RunRecord | null>(path.join(dir, f), null))
    .filter((r): r is RunRecord => r !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
    .map(({ results, changes, ...rest }) => ({ ...rest, sourcesChecked: rest.sourcesChecked, details: { ...(rest.details ?? {}), hasResults: Boolean(results?.length), changeCount: changes?.length ?? 0 } }));
}

export function createApi(ctx: MaintenanceContext, opts: { token: string; port: number }) {
  const jobs = new Map<string, Job>();
  let running: Job | null = null;

  const startCheck = (countries?: string[]): Job => {
    if (running) return running;
    const job: Job = { id: makeId('job', ctx), kind: 'check', status: 'running', startedAt: new Date().toISOString(), progress: { done: 0, total: 0, current: 'Starting', log: [] }, result: null, error: null };
    jobs.set(job.id, job);
    running = job;
    runCheck(ctx, { countries, onProgress: (p) => (job.progress = p) })
      .then((r) => {
        job.result = r;
        job.status = 'done';
      })
      .catch((e: unknown) => {
        job.error = e instanceof Error ? e.message : String(e);
        job.status = 'failed';
      })
      .finally(() => {
        running = null;
      });
    return job;
  };

  /** Monthly automatic check: runs once per month on/after the configured day. */
  const maybeRunScheduled = (): boolean => {
    const state = loadState(ctx);
    if (!state.settings.monthlyCheck || running) return false;
    const now = ctx.now();
    if (now.getUTCDate() < state.settings.dayOfMonth) return false;
    const last = state.lastCheckRun ? new Date(state.lastCheckRun) : null;
    if (last && last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() === now.getUTCMonth()) return false;
    startCheck();
    return true;
  };

  const status = () => {
    const proposals = loadProposals(ctx);
    const countries = countryOverview(ctx).map((c) => {
      const mine = proposals.filter((p) => p.country === c.code);
      const pending = mine.filter((p) => p.status === 'pending' || p.status === 'failed-validation').length;
      const research = mine.filter((p) => p.status === 'research').length;
      return { ...c, detectedChanges: mine.length, pendingReviews: pending, research, needsAttention: pending > 0 || research > 0 || c.failingSources.length > 0 || c.status === 'under-development' || !c.lastSuccessfulCheck };
    });
    const state = loadState(ctx);
    const versions = countries.flatMap((c) => Object.entries(c.active).map(([y, v]) => `${c.code} ${y}: ${v}`));
    return {
      countries,
      lastCheckRun: state.lastCheckRun,
      lastDatasetUpdate: countries.map((c) => c.lastDatasetUpdate).filter(Boolean).sort().pop() ?? null,
      datasetVersions: versions,
      detectedChanges: proposals.length,
      pendingReviews: proposals.filter((p) => p.status === 'pending' || p.status === 'failed-validation').length,
      needsResearch: proposals.filter((p) => p.status === 'research').length,
      countriesNeedingAttention: countries.filter((c) => c.needsAttention).length,
      settings: state.settings,
      runningJob: running ? running.id : null,
    };
  };

  async function route(method: string, url: URL, body: unknown): Promise<unknown> {
    const p = url.pathname.replace(/^\/admin-api/, '/api');
    if (method === 'GET' && p === '/api/status') return status();
    if (method === 'GET' && p === '/api/sources') {
      const state = loadState(ctx);
      return loadSources(ctx).map((s) => ({ ...s, state: state.sources[s.id] ?? null }));
    }
    if (method === 'GET' && p === '/api/proposals') return loadProposals(ctx).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (method === 'POST' && p === '/api/check') {
      const b = z.object({ countries: z.array(countryCode).optional() }).parse(body);
      return startCheck(b.countries);
    }
    const jobMatch = /^\/api\/jobs\/([\w-]+)$/.exec(p);
    if (method === 'GET' && jobMatch) {
      const j = jobs.get(jobMatch[1]);
      if (!j) throw new HttpError(404, 'Unknown job.');
      return j;
    }
    if (method === 'POST' && p === '/api/proposals/approve') {
      const b = idsBody.parse(body);
      if (running) throw new HttpError(409, 'A check is running; approve when it has finished.');
      return approveProposals(ctx, b.ids, b.note ?? null);
    }
    if (method === 'POST' && (p === '/api/proposals/reject' || p === '/api/proposals/research')) {
      const b = idsBody.parse(body);
      return setProposalStatus(ctx, b.ids, p.endsWith('reject') ? 'rejected' : 'research', b.note ?? null);
    }
    const versionsMatch = /^\/api\/countries\/([A-Z]{2})\/versions$/.exec(p);
    if (method === 'GET' && versionsMatch) {
      const c = countryOverview(ctx).find((x) => x.code === versionsMatch[1]);
      if (!c) throw new HttpError(404, 'Unknown country.');
      return c.versions.map((v) => ({ ...v, dataset: readDataset(ctx, c.code, v.version) }));
    }
    if (method === 'POST' && p === '/api/rollback') {
      const b = z.object({ country: countryCode, taxYear: z.number().int(), version: z.string().regex(/^\d{4}\.\d+$/) }).parse(body);
      return rollback(ctx, b.country, b.taxYear, b.version);
    }
    if (method === 'GET' && p === '/api/history') return listHistory(ctx);
    const histMatch = /^\/api\/history\/([\w-]+)$/.exec(p);
    if (method === 'GET' && histMatch) {
      const file = path.join(paths(ctx).history, `${histMatch[1]}.json`);
      if (!fs.existsSync(file)) throw new HttpError(404, 'Unknown report.');
      return readJsonFile(file, null);
    }
    if (method === 'GET' && p === '/api/catalog') {
      const registered = new Set(countryOverview(ctx).map((c) => c.code));
      return loadCatalog(ctx).filter((c) => !registered.has(c.code));
    }
    if (method === 'POST' && p === '/api/countries') {
      const b = z.object({ code: countryCode, discover: z.boolean().optional() }).parse(body);
      return addCountry(ctx, b.code, { discover: b.discover });
    }
    const draftMatch = /^\/api\/countries\/([A-Z]{2})\/draft$/.exec(p);
    if (method === 'GET' && draftMatch) return readDraft(ctx, draftMatch[1]);
    const createMatch = /^\/api\/countries\/([A-Z]{2})\/create-version$/.exec(p);
    if (method === 'POST' && createMatch) return createVersionFromDraft(ctx, createMatch[1]);
    const publishMatch = /^\/api\/countries\/([A-Z]{2})\/publish$/.exec(p);
    if (method === 'POST' && publishMatch) return publishCountry(ctx, publishMatch[1]);
    if (method === 'POST' && p === '/api/settings') {
      const state = loadState(ctx);
      state.settings = settingsSchema.parse({ ...state.settings, ...(body as object) });
      saveState(ctx, state);
      return state.settings;
    }
    throw new HttpError(404, 'Not found.');
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      checkRequestSecurity(req, opts.token, opts.port);
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${opts.port}`);
      const body = await readBody(req);
      send(200, await route(req.method ?? 'GET', url, body));
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.message });
      else if (e instanceof z.ZodError) send(400, { error: 'Invalid request.', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      else send(500, { error: e instanceof Error ? e.message : 'Internal error' });
    }
  }

  return { handle, startCheck, maybeRunScheduled, status, jobs };
}
