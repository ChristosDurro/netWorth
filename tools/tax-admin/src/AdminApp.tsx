import { AlertTriangle, Check, CheckCircle2, ChevronDown, Download, ExternalLink, FlaskConical, History, Loader2, Plus, RefreshCw, RotateCcw, ShieldCheck, X, XCircle } from 'lucide-react';
import { DatasetExplorer } from './DatasetExplorer';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Flag } from '../../../src/components/common/Flag';
import { Badge, Button, Card, cx, EmptyState, Field, Notice, SectionTitle, Segmented, Select, Switch } from '../../../src/components/common/ui';
import { formatDate, formatDateTime } from '../../../src/utils/format';

/* ---------------- API types (mirror maintenance/engine/types.ts) ---------------- */

type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'research' | 'failed-validation';
interface ValidationReport {
  ok: boolean;
  schema: { ok: boolean; errors: string[] };
  invariants: { ok: boolean; errors: string[] };
  golden: { ok: boolean; checked: number; failures: string[] };
  tests: { ran: boolean; passed: boolean; total: number; failed: number; summary: string };
}
interface Proposal {
  id: string;
  country: string;
  category: string;
  kind: 'new-regulation' | 'modification' | 'future-regulation' | 'informational' | 'calculation-mismatch' | 'source-unavailable';
  rulePath: string | null;
  existingValue: unknown;
  proposedValue: unknown;
  taxYear: number | null;
  effectiveDate: string | null;
  sourceId: string;
  sourceUrl: string;
  publicationDate: string | null;
  explanation: string;
  confidence: 'extracted-value' | 'needs-research';
  affectsExistingCalculations: boolean;
  status: ProposalStatus;
  createdAt: string;
  note: string | null;
  resultVersion: string | null;
  validation: ValidationReport | null;
}
interface VersionInfo {
  version: string;
  taxYear: number;
  verificationStatus: string;
  approvedAt: string | null;
  description: string;
  previousVersion: string | null;
}
interface CountryStatus {
  code: string;
  name: string;
  status: 'supported' | 'under-development';
  active: Record<string, string>;
  versions: VersionInfo[];
  sources: number;
  failingSources: string[];
  lastSuccessfulCheck: string | null;
  lastDatasetUpdate: string | null;
  detectedChanges: number;
  pendingReviews: number;
  research: number;
  needsAttention: boolean;
  hasDraft: boolean;
}
interface Status {
  countries: CountryStatus[];
  lastCheckRun: string | null;
  lastDatasetUpdate: string | null;
  datasetVersions: string[];
  detectedChanges: number;
  pendingReviews: number;
  needsResearch: number;
  countriesNeedingAttention: number;
  settings: { monthlyCheck: boolean; dayOfMonth: number; commitOnApprove: boolean };
  runningJob: string | null;
}
interface RunRecord {
  id: string;
  type: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  countriesChecked: string[];
  sourcesChecked: number;
  sourcesSucceeded: string[];
  sourcesFailed: { id: string; error: string }[];
  changesDetected: number;
  proposalsCreated: string[];
  approved: string[];
  rejected: string[];
  tests: ValidationReport['tests'] | null;
  summary: string;
}
interface Job {
  id: string;
  status: 'running' | 'done' | 'failed';
  progress: { done: number; total: number; current: string; log: string[] };
  result: RunRecord | null;
  error: string | null;
}
interface CatalogEntry {
  code: string;
  name: string;
  currency: string;
  authority: string;
  url: string;
}
interface Draft {
  country: string;
  name: string;
  taxYear: number;
  research: { key: string; label: string; status: string; sourceUrl: string | null }[];
}

class ApiError extends Error {}
async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`./admin-api${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('offline');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* proxy error page */
  }
  if (!res.ok) {
    if (res.status === 502 || res.status === 504 || data === null) throw new ApiError('offline');
    throw new ApiError((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

/* ---------------- helpers ---------------- */

const KIND: Record<Proposal['kind'], { label: string; tone: 'accent' | 'warn' | 'neg' | 'neutral' | 'pos' }> = {
  'new-regulation': { label: 'New regulation', tone: 'accent' },
  modification: { label: 'Modification', tone: 'warn' },
  'future-regulation': { label: 'Announced · future', tone: 'accent' },
  informational: { label: 'Informational', tone: 'neutral' },
  'calculation-mismatch': { label: 'Calculation mismatch', tone: 'neg' },
  'source-unavailable': { label: 'Source unavailable', tone: 'neg' },
};
const STATUS_TONE: Record<ProposalStatus, 'warn' | 'pos' | 'neutral' | 'accent' | 'neg'> = { pending: 'warn', approved: 'pos', rejected: 'neutral', research: 'accent', 'failed-validation': 'neg' };

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return `${v.length} entries`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' | 'neg' }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={cx('num mt-1 text-lg font-semibold', tone === 'warn' ? 'text-warn' : tone === 'neg' ? 'text-neg' : 'text-ink')}>{value}</p>
    </div>
  );
}

function ValidationView({ v }: { v: ValidationReport }) {
  const row = (ok: boolean, label: string, detail: string) => (
    <li className="flex gap-2">
      {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-pos" /> : <XCircle size={14} className="mt-0.5 shrink-0 text-neg" />}
      <span>
        <span className="font-medium text-ink">{label}</span> — {detail}
      </span>
    </li>
  );
  return (
    <ul className="space-y-1 text-xs text-muted">
      {row(v.schema.ok, 'Schema', v.schema.ok ? 'valid' : v.schema.errors.slice(0, 3).join('; '))}
      {row(v.invariants.ok, 'Invariants', v.invariants.ok ? 'net pay rises with gross, no negative or non-finite values' : v.invariants.errors.slice(0, 3).join('; '))}
      {row(v.golden.ok, 'Other countries & versions', v.golden.ok ? `${v.golden.checked} regression cases unchanged` : v.golden.failures.slice(0, 3).join('; '))}
      {row(v.tests.passed, 'Test suite', v.tests.summary)}
    </ul>
  );
}

/* ---------------- sections ---------------- */

function ProposalCard({ p, selected, onSelect, onAction, busy, versions }: { p: Proposal; selected: boolean; onSelect: (v: boolean) => void; onAction: (a: 'approve' | 'reject' | 'research', ids: string[]) => void; busy: boolean; versions: VersionInfo[] }) {
  const [open, setOpen] = useState(false);
  const actionable = p.proposedValue !== null && p.rulePath !== null && p.taxYear !== null && p.status !== 'approved' && p.status !== 'rejected';
  const k = KIND[p.kind];
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        {actionable && <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select for bulk approval" className="mt-1 h-4 w-4 accent-[var(--accent)]" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Flag code={p.country} className="h-3 w-[17px]" />
            <span className="text-sm font-semibold text-ink">{p.country}</span>
            <Badge tone={k.tone}>{k.label}</Badge>
            <Badge tone={STATUS_TONE[p.status]}>{p.status.replace('-', ' ')}</Badge>
            {p.confidence === 'extracted-value' ? <Badge tone="pos">Value read from source</Badge> : <Badge tone="neutral">Needs research</Badge>}
            {p.taxYear && <span className="text-xs text-faint">Tax year {p.taxYear}</span>}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.explanation}</p>
          {p.rulePath && (
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="text-faint">Current rule · {p.rulePath}</p>
                <p className="num mt-0.5 break-all font-medium text-ink">{show(p.existingValue)}</p>
              </div>
              <span className="hidden self-center text-faint sm:block">→</span>
              <div className="rounded-lg bg-accent-soft px-3 py-2">
                <p className="text-faint">Proposed</p>
                <p className="num mt-0.5 break-all font-medium text-ink">{show(p.proposedValue)}</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
            <span>Effective {p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</span>
            <span>Published {p.publicationDate ? formatDate(p.publicationDate) : 'unknown'}</span>
            <span>Detected {formatDateTime(p.createdAt)}</span>
            <span>Affects: {p.country.toLowerCase()} module · compute(){p.rulePath ? ` · rules.${p.rulePath}` : ''}</span>
            {p.affectsExistingCalculations && <span className="text-warn">Changes results of an existing tax year</span>}
            {p.resultVersion && <span className="text-pos">Activated as v{p.resultVersion}</span>}
          </div>
          {p.note && <p className="mt-2 text-xs italic text-muted">Note: {p.note}</p>}
          {p.validation && (
            <div className="mt-3 rounded-lg border border-line p-3">
              <p className="mb-1.5 text-xs font-semibold text-ink">Validation before activation</p>
              <ValidationView v={p.validation} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actionable && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => onAction('approve', [p.id])}>
                <Check size={14} /> Approve
              </Button>
            )}
            {p.status !== 'approved' && p.status !== 'rejected' && (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('reject', [p.id])}>
                  <X size={14} /> Reject
                </Button>
                {p.status !== 'research' && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('research', [p.id])}>
                    <FlaskConical size={14} /> Mark for research
                  </Button>
                )}
              </>
            )}
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent hover:bg-surface-2">
              <ExternalLink size={14} /> Open official source
            </a>
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <History size={14} /> Previous versions
            </Button>
          </div>
          {open && (
            <ul className="mt-2 space-y-1 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              {versions.length === 0 && <li>No versions.</li>}
              {versions.map((v) => (
                <li key={v.version}>
                  <span className="font-medium text-ink">v{v.version}</span> · {v.verificationStatus} · approved {formatDate(v.approvedAt)} — {v.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function CountryRow({ c, onRollback, busy }: { c: CountryStatus; onRollback: (country: string, taxYear: number, version: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-line">
        <th scope="row" className="py-3 pr-3 text-left font-medium">
          <button type="button" className="flex items-center gap-2 text-ink" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown size={14} className={cx('text-faint transition-transform', open && 'rotate-180')} />
            <Flag code={c.code} /> {c.name}
          </button>
        </th>
        <td className="py-3 pr-3">{c.status === 'supported' ? <Badge tone="pos">Supported</Badge> : <Badge tone="warn">Under development</Badge>}</td>
        <td className="num py-3 pr-3 text-muted">{Object.entries(c.active).map(([y, v]) => `${y}: v${v}`).join(', ') || '—'}</td>
        <td className="py-3 pr-3 text-muted">{c.lastSuccessfulCheck ? formatDateTime(c.lastSuccessfulCheck) : 'Never fully checked'}</td>
        <td className="py-3 pr-3 text-muted">{formatDate(c.lastDatasetUpdate)}</td>
        <td className="num py-3 pr-3 text-right text-ink">{c.detectedChanges}</td>
        <td className="num py-3 pr-3 text-right text-ink">{c.pendingReviews}</td>
        <td className="py-3 text-right">
          {c.failingSources.length > 0 ? (
            <Badge tone="neg">{c.failingSources.length} source(s) failing</Badge>
          ) : c.needsAttention ? (
            <Badge tone="warn">Attention</Badge>
          ) : (
            <Badge tone="pos">OK</Badge>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-surface-2/40">
          <td colSpan={8} className="px-3 py-3">
            {c.failingSources.length > 0 && <p className="mb-2 text-xs text-neg">Failing: {c.failingSources.join(', ')} — a failed check is not proof that nothing changed.</p>}
            <p className="mb-2 text-xs font-semibold text-ink">Dataset versions</p>
            <ul className="space-y-1.5 text-xs">
              {c.versions.map((v) => {
                const active = c.active[String(v.taxYear)] === v.version;
                return (
                  <li key={v.version} className="flex flex-wrap items-center gap-2 text-muted">
                    <span className="num font-medium text-ink">v{v.version}</span>
                    {active && <Badge tone="pos">Active</Badge>}
                    <span>{v.verificationStatus}</span>
                    <span>· approved {formatDate(v.approvedAt)}</span>
                    <span className="min-w-0 flex-1 truncate">· {v.description}</span>
                    {!active && c.active[String(v.taxYear)] && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRollback(c.code, v.taxYear, v.version)}>
                        <RotateCcw size={13} /> Restore this version
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function AddCountry({ catalog, drafts, onAdd, onCreate, onPublish, busy }: { catalog: CatalogEntry[]; drafts: (Draft & { status: string; hasVersion: boolean })[]; onAdd: (code: string) => void; onCreate: (code: string) => void; onPublish: (code: string) => void; busy: boolean }) {
  const [code, setCode] = useState('');
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle hint="Registers the official tax authority, discovers candidate source pages, scaffolds the module, draft dataset, tests and a research report. Nothing is published until verified.">Add country</SectionTitle>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Field label="Country (official authority catalog)" htmlFor="add-country">
            <Select id="add-country" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Select a country…</option>
              {catalog.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} — {c.authority}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" disabled={!code || busy} onClick={() => onAdd(code)}>
          <Plus size={16} /> Add country
        </Button>
      </div>
      {drafts.length > 0 && (
        <ul className="mt-5 space-y-3">
          {drafts.map((d) => {
            const missing = d.research.filter((r) => r.status === 'missing').length;
            return (
              <li key={d.country} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Flag code={d.country} />
                  <span className="font-semibold text-ink">{d.name}</span>
                  <Badge tone="warn">Under development</Badge>
                  <span className="text-xs text-faint">Tax year {d.taxYear}</span>
                </div>
                <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
                  {d.research.map((r) => (
                    <li key={r.key} className="flex items-center gap-1.5 text-muted">
                      {r.status === 'verified' || r.status === 'not-applicable' ? <CheckCircle2 size={13} className="text-pos" /> : <AlertTriangle size={13} className="text-warn" />}
                      {r.label} <span className="text-faint">({r.status})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-faint">
                  Fill <code>tax-data/{d.country}/draft.json</code> from official sources; see <code>docs/countries/{d.country}.md</code>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || missing > 0} onClick={() => onCreate(d.country)} title={missing ? `${missing} research items are still missing` : undefined}>
                    Create dataset from draft
                  </Button>
                  <Button size="sm" variant="primary" disabled={busy || !d.hasVersion} onClick={() => onPublish(d.country)}>
                    Publish country
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- page ---------------- */

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [drafts, setDrafts] = useState<(Draft & { status: string; hasVersion: boolean })[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'neg' | 'warn'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, p, h, c] = await Promise.all([api<Status>('/status'), api<Proposal[]>('/proposals'), api<RunRecord[]>('/history'), api<CatalogEntry[]>('/catalog')]);
      setStatus(s);
      setProposals(p);
      setHistory(h);
      setCatalog(c);
      setOffline(false);
      const dev = s.countries.filter((x) => x.hasDraft || x.status === 'under-development');
      const ds = await Promise.all(dev.map((x) => api<Draft | null>(`/countries/${x.code}/draft`).then((d) => (d ? { ...d, status: x.status, hasVersion: Object.keys(x.active).length > 0 } : null))));
      setDrafts(ds.filter((d): d is NonNullable<typeof d> => d !== null && d.status === 'under-development'));
      if (s.runningJob) setJob((j) => j ?? { id: s.runningJob as string, status: 'running', progress: { done: 0, total: 0, current: 'Running…', log: [] }, result: null, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.message === 'offline') setOffline(true);
      else setMessage({ tone: 'neg', text: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll the running job.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api<Job>(`/jobs/${job.id}`);
        setJob(j);
        if (j.status !== 'running') {
          setMessage({ tone: j.status === 'done' ? (j.result?.sourcesFailed.length ? 'warn' : 'info') : 'neg', text: j.result?.summary ?? j.error ?? 'Check finished.' });
          void refresh();
        }
      } catch {
        /* keep polling */
      }
    }, 1200);
    return () => clearInterval(t);
  }, [job, refresh]);

  const run = async (fn: () => Promise<{ summary?: string; status?: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({ tone: r.status === 'failed' ? 'neg' : r.status === 'partial' ? 'warn' : 'info', text: r.summary ?? 'Done.' });
    } catch (e) {
      setMessage({ tone: 'neg', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setSelected(new Set());
      void refresh();
    }
  };

  const act = (a: 'approve' | 'reject' | 'research', ids: string[]) => {
    const note = a === 'approve' ? null : window.prompt(a === 'reject' ? 'Reason for rejecting (optional):' : 'What needs researching? (optional)') ?? null;
    void run(() => api(`/proposals/${a}`, { ids, note }));
  };

  const versionsByCountry = useMemo(() => Object.fromEntries((status?.countries ?? []).map((c) => [c.code, c.versions])), [status]);
  const visible = proposals.filter((p) => filter === 'all' || p.status === 'pending' || p.status === 'research' || p.status === 'failed-validation');

  if (offline) {
    return (
      <Card className="p-6">
        <EmptyState icon={<ShieldCheck size={20} />} title="The local maintenance service is not running">
          The Update Center talks to a service that only runs on your computer. Stop the dev server and start both with <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run admin</code>, then reload this page.
        </EmptyState>
        <div className="mt-4 flex justify-center">
          <Button onClick={() => void refresh()}>
            <RefreshCw size={14} /> Retry
          </Button>
        </div>
      </Card>
    );
  }
  if (!status) return <p className="text-sm text-muted">Connecting to the maintenance service…</p>;

  const running = job?.status === 'running';
  const pct = job && job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Notice tone="info">
        Local maintenance mode. Checks read official sources and <strong>propose</strong> changes; nothing reaches the calculator until you approve it and all validation and tests pass. Production picks up approved data with the next build and deploy.
      </Notice>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Monitored countries: {status.countries.length}</h2>
            <p className="mt-1 text-sm text-muted">One click checks every official source for every registered country.</p>
          </div>
          <Button variant="primary" disabled={running || busy} onClick={() => void api<Job>('/check', {}).then(setJob).catch((e: unknown) => setMessage({ tone: 'neg', text: String(e) }))}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {running ? 'Checking…' : 'Check for Tax Updates'}
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Last check" value={status.lastCheckRun ? formatDateTime(status.lastCheckRun) : 'Never'} />
          <Stat label="Last dataset update" value={formatDate(status.lastDatasetUpdate)} />
          <Stat label="Active datasets" value={status.datasetVersions.length} />
          <Stat label="Detected changes" value={status.detectedChanges} />
          <Stat label="Pending reviews" value={status.pendingReviews} tone={status.pendingReviews ? 'warn' : undefined} />
          <Stat label="Need attention" value={status.countriesNeedingAttention} tone={status.countriesNeedingAttention ? 'warn' : undefined} />
        </div>
        {job && (job.status === 'running' || job.progress.log.length > 0) && (
          <div className="mt-5 rounded-xl border border-line p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink">{job.status === 'running' ? job.progress.current : job.status === 'done' ? 'Check complete' : 'Check failed'}</span>
              <span className="num text-muted">
                {job.progress.done}/{job.progress.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${job.status === 'running' ? pct : 100}%` }} />
            </div>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-faint">{job.progress.log.slice(-12).join('\n')}</pre>
          </div>
        )}
        {message && (
          <div className="mt-4">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle hint="Expand a country to see its version history and restore an earlier verified dataset.">Countries</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {['Country', 'Status', 'Active version', 'Last successful check', 'Last update', 'Changes', 'Pending', ''].map((h) => (
                  <th key={h} scope="col" className={cx('py-2 pr-3 font-medium', (h === 'Changes' || h === 'Pending' || h === '') && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.countries.map((c) => (
                <CountryRow key={c.code} c={c} busy={busy || running} onRollback={(country, taxYear, version) => window.confirm(`Restore ${country} ${taxYear} to v${version}? Tests run before it becomes active.`) && void run(() => api('/rollback', { country, taxYear, version }))} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DatasetExplorer countries={status.countries.map((c) => ({ code: c.code, name: c.name }))} api={api} onProposed={() => void refresh()} busy={busy || running} />

      <Card className="p-5 sm:p-6">
        <SectionTitle
          hint="Review detected changes before they can affect any calculation."
          action={
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => act('approve', [...selected])}>
                  Approve {selected.size} selected
                </Button>
              )}
              <div className="w-[150px]">
                <Segmented size="sm" label="Proposal filter" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
              </div>
            </div>
          }
        >
          Review queue
        </SectionTitle>
        {visible.length === 0 ? (
          <p className="text-sm text-muted">{proposals.length ? 'No open items — everything has been reviewed.' : 'No changes detected yet. Run a check to compare the official sources with the stored data.'}</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((p) => (
              <ProposalCard
                key={p.id}
                p={p}
                busy={busy || running}
                versions={versionsByCountry[p.country] ?? []}
                selected={selected.has(p.id)}
                onSelect={(v) => setSelected((s) => {
                  const n = new Set(s);
                  if (v) n.add(p.id);
                  else n.delete(p.id);
                  return n;
                })}
                onAction={act}
              />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <AddCountry
          catalog={catalog}
          drafts={drafts}
          busy={busy}
          onAdd={(code) => void run(() => api('/countries', { code }))}
          onCreate={(code) => void run(() => api(`/countries/${code}/create-version`, {}))}
          onPublish={(code) => window.confirm(`Publish ${code} in the public calculator?`) && void run(() => api(`/countries/${code}/publish`, {}))}
        />
        <Card className="p-5 sm:p-6">
          <SectionTitle hint="Runs while the maintenance service is running. For unattended checks use the GitHub Actions workflow (see README).">Monthly maintenance</SectionTitle>
          <div className="space-y-4">
            <Switch label="Automatic monthly check" description="Checks every registered country once a month." checked={status.settings.monthlyCheck} onChange={(monthlyCheck) => void run(() => api('/settings', { monthlyCheck }).then(() => ({ summary: `Monthly check ${monthlyCheck ? 'enabled' : 'disabled'}.` })))} />
            <Field label="Day of month" htmlFor="dom">
              <Select id="dom" value={status.settings.dayOfMonth} onChange={(e) => void run(() => api('/settings', { dayOfMonth: Number(e.target.value) }).then(() => ({ summary: 'Saved.' })))}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Switch label="Create a git commit on approval" description="Commits the updated datasets and regression tests locally (never pushes). Takes effect after restarting the service." checked={status.settings.commitOnApprove} onChange={(commitOnApprove) => void run(() => api('/settings', { commitOnApprove }).then(() => ({ summary: 'Saved — restart the maintenance service to apply.' })))} />
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <SectionTitle hint="Every check, approval, rejection and rollback is recorded.">Maintenance history</SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Badge tone={h.status === 'success' ? 'pos' : h.status === 'partial' ? 'warn' : 'neg'}>{h.status}</Badge>
                <span className="font-medium text-ink">{h.type}</span>
                <span className="text-xs text-faint">{formatDateTime(h.startedAt)}</span>
                <span className="min-w-0 flex-1 text-[13px] text-muted">{h.summary}</span>
                <Button size="sm" variant="ghost" onClick={() => void api(`/history/${h.id}`).then((r) => download(`${h.id}.json`, r))}>
                  <Download size={14} /> JSON
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
