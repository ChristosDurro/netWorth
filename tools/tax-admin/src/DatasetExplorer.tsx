import { ExternalLink, GitCompare, PencilLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, cx, Field, Notice, SectionTitle, Select, TextInput } from '../../../src/components/common/ui';
import { formatDate } from '../../../src/utils/format';

interface Meta {
  version: string;
  taxYear: number;
  verificationStatus: 'verified' | 'estimated' | 'incomplete';
  lastVerified: string;
  effectiveDate: string;
  description: string;
  sources: { title: string; authority: string; url: string }[];
  unverified: string[];
}
interface VersionWithData {
  version: string;
  taxYear: number;
  dataset: { meta: Meta; rules: unknown };
}
type Api = <T>(path: string, body?: unknown) => Promise<T>;

/** Flattens rules into "path → value" rows. Long lists (municipalities) are summarised, not exploded. */
export function flatten(obj: unknown, prefix = '', out: [string, unknown][] = []): [string, unknown][] {
  if (Array.isArray(obj) && obj.length > 20 && obj.every((x) => x && typeof x === 'object')) {
    out.push([prefix, `[${obj.length} entries]`]);
    return out;
  }
  if (obj !== null && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out.push([prefix, obj]);
  return out;
}

const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
const TONE = { verified: 'pos', estimated: 'warn', incomplete: 'neg' } as const;

export function DatasetExplorer({ countries, api, onProposed, busy }: { countries: { code: string; name: string }[]; api: Api; onProposed: () => void; busy: boolean }) {
  const [code, setCode] = useState(countries[0]?.code ?? '');
  const [versions, setVersions] = useState<VersionWithData[]>([]);
  const [version, setVersion] = useState('');
  const [compareTo, setCompareTo] = useState('');
  const [query, setQuery] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ value: '', sourceUrl: '', reason: '' });
  const [msg, setMsg] = useState<{ tone: 'info' | 'neg'; text: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    api<VersionWithData[]>(`/countries/${code}/versions`)
      .then((v) => {
        const sorted = [...v].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
        setVersions(sorted);
        setVersion(sorted[0]?.version ?? '');
        setCompareTo('');
      })
      .catch((e) => setMsg({ tone: 'neg', text: e instanceof Error ? e.message : String(e) }));
  }, [code, api]);

  const current = versions.find((v) => v.version === version);
  const other = versions.find((v) => v.version === compareTo);
  const rows = useMemo(() => (current ? flatten(current.dataset.rules) : []), [current]);
  const otherMap = useMemo(() => new Map(other ? flatten(other.dataset.rules) : []), [other]);
  const changedPaths = other ? rows.filter(([p, v]) => show(otherMap.get(p)) !== show(v)).map(([p]) => p) : [];
  const visible = rows.filter(([p]) => !query || p.toLowerCase().includes(query.toLowerCase())).filter(([p]) => !other || !onlyDiff || changedPaths.includes(p));

  const submit = async (path: string, existing: unknown) => {
    const raw = form.value.trim();
    const value = typeof existing === 'number' ? Number(raw) : typeof existing === 'boolean' ? raw === 'true' : raw;
    if (typeof existing === 'number' && !Number.isFinite(value)) {
      setMsg({ tone: 'neg', text: 'Enter a number.' });
      return;
    }
    try {
      await api('/proposals/manual', { country: code, taxYear: current?.taxYear, rulePath: path, value, sourceUrl: form.sourceUrl.trim(), reason: form.reason.trim() });
      setMsg({ tone: 'info', text: `Proposed ${path} = ${show(value)}. It is waiting in the review queue; nothing changes until you approve it and the tests pass.` });
      setEditing(null);
      onProposed();
    } catch (e) {
      setMsg({ tone: 'neg', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle hint="Browse every parameter of a dataset version, compare two versions, or propose a manual correction. Manual edits go through the same review, validation and tests as detected changes.">Datasets</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Country" htmlFor="ds-country">
          <Select id="ds-country" value={code} onChange={(e) => setCode(e.target.value)}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Version" htmlFor="ds-version">
          <Select id="ds-version" value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Compare with" htmlFor="ds-compare">
          <Select id="ds-compare" value={compareTo} onChange={(e) => setCompareTo(e.target.value)}>
            <option value="">— none —</option>
            {versions
              .filter((v) => v.version !== version)
              .map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Filter parameters" htmlFor="ds-q">
          <TextInput id="ds-q" value={query} placeholder="e.g. bracket, rate" onChange={(e) => setQuery(e.target.value)} />
        </Field>
      </div>

      {current && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <Badge tone={TONE[current.dataset.meta.verificationStatus]}>{current.dataset.meta.verificationStatus}</Badge>
          <span>Tax year {current.taxYear}</span>
          <span>Effective {formatDate(current.dataset.meta.effectiveDate)}</span>
          <span>Last verified {formatDate(current.dataset.meta.lastVerified)}</span>
          <span>{current.dataset.meta.sources.length} sources</span>
          {other && (
            <span className="inline-flex items-center gap-1 text-ink">
              <GitCompare size={13} /> {changedPaths.length} parameter{changedPaths.length === 1 ? '' : 's'} differ from v{other.version}
            </span>
          )}
          {other && (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only differences
            </label>
          )}
        </div>
      )}
      {msg && (
        <div className="mt-4">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                Parameter
              </th>
              {other && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  v{other.version}
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-right font-medium">
                v{current?.version}
              </th>
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(([path, value]) => {
              const changed = changedPaths.includes(path);
              const editable = typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && !value.startsWith('['));
              return (
                <tr key={path} className={cx('border-t border-line align-top', changed && 'bg-warn-soft')}>
                  <td className="mono px-3 py-1.5 text-ink">
                    {path}
                    {editing === path && (
                      <form
                        className="mt-2 grid gap-2 font-sans sm:grid-cols-[120px_minmax(0,1fr)]"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submit(path, value);
                        }}
                      >
                        <TextInput aria-label="New value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="h-9 sm:h-9" required />
                        <TextInput aria-label="Official source URL" type="url" placeholder="https://… official source" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} className="h-9 sm:h-9" required />
                        <TextInput aria-label="Reason" placeholder="Why this value is correct (shown in history)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="h-9 sm:col-span-2 sm:h-9" required minLength={5} />
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" variant="primary" type="submit" disabled={busy}>
                            Propose change
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </td>
                  {other && <td className="mono px-3 py-1.5 text-right text-muted">{show(otherMap.get(path))}</td>}
                  <td className={cx('mono px-3 py-1.5 text-right', changed ? 'font-semibold text-ink' : 'text-ink')}>{show(value)}</td>
                  <td className="px-3 py-1.5">
                    {editable && editing !== path && (
                      <button
                        type="button"
                        aria-label={`Propose a new value for ${path}`}
                        onClick={() => {
                          setEditing(path);
                          setForm({ value: String(value), sourceUrl: '', reason: '' });
                          setMsg(null);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-ink"
                      >
                        <PencilLine size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {current && current.dataset.meta.sources.length > 0 && (
        <details className="mt-4 text-[13px]">
          <summary className="cursor-pointer font-medium text-ink">Sources of v{current.version}</summary>
          <ul className="mt-2 space-y-1.5">
            {current.dataset.meta.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-accent hover:underline">
                  <ExternalLink size={12} className="mt-1 shrink-0" /> {s.title} — {s.authority}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
