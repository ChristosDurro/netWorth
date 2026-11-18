import { Bookmark, Copy, Download, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Flag } from '../components/common/Flag';
import { Badge, Button, Card, EmptyState, Notice, TextInput } from '../components/common/ui';
import { taxRegistry } from '../data/taxData';
import type { SavedCalculation } from '../services/storage/models';
import { savedOps } from '../services/storage/storage';
import { useApp } from '../state/AppState';
import { formatDate, formatMoney, formatPercent } from '../utils/format';

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SavedItem({ calc, onOpen, onRename, onDuplicate, onDelete }: { calc: SavedCalculation; onOpen: () => void; onRename: (n: string) => void; onDuplicate: () => void; onDelete: () => void }) {
  const { settings } = useApp();
  const prefs = { numberLocale: settings.numberLocale, showDecimals: settings.showDecimals };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(calc.name);
  const [confirming, setConfirming] = useState(false);
  const s = calc.snapshot;
  const country = taxRegistry.listCountries(true).find((c) => c.code === calc.draft.country);
  const active = taxRegistry.activeVersion(calc.draft.country, calc.draft.taxYear);
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(name);
                setEditing(false);
              }}
            >
              <label htmlFor={`rename-${calc.id}`} className="sr-only">
                New name
              </label>
              <TextInput id={`rename-${calc.id}`} autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9" maxLength={120} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
              <Button size="sm" variant="primary" type="submit">
                Rename
              </Button>
            </form>
          ) : (
            <h3 className="truncate text-[15px] font-semibold text-ink">{calc.name}</h3>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Flag code={calc.draft.country} className="h-3 w-[17px]" /> {country?.name ?? calc.draft.country}
            </span>
            <span>Tax year {calc.draft.taxYear}</span>
            <span>Saved {formatDate(calc.updatedAt)}</span>
            {active && active !== s.datasetVersion && <Badge tone="warn">Tax data updated since saving</Badge>}
          </div>
        </div>
        <div className="flex gap-6 sm:text-right">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">Net / month</p>
            <p className="num text-base font-semibold text-ink">{s.convertedNetMonthly !== null ? formatMoney(s.convertedNetMonthly, s.targetCurrency, prefs) : formatMoney(s.netAnnual / 12, s.currency, prefs)}</p>
            <p className="num text-xs text-faint">{formatMoney(s.netAnnual / 12, s.currency, prefs)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint">Effective</p>
            <p className="num text-base font-semibold text-ink">{formatPercent(s.effectiveTaxRate, prefs)}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
        <Button size="sm" variant="primary" onClick={onOpen}>
          <FolderOpen size={14} /> Open
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Rename
        </Button>
        <Button size="sm" variant="ghost" onClick={onDuplicate}>
          <Copy size={14} /> Duplicate
        </Button>
        {confirming ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
            Delete permanently?
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto hover:text-neg" onClick={() => setConfirming(true)} aria-label={`Delete ${calc.name}`}>
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>
    </li>
  );
}

export function SavedPage() {
  const { saved, setSaved, loadDraft, navigate } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'neg'; text: string } | null>(null);

  const importFile = async (file: File) => {
    try {
      const { list, imported } = savedOps.import(saved, await file.text());
      setSaved(list);
      setMessage({ tone: 'info', text: `Imported ${imported} calculation${imported === 1 ? '' : 's'}.` });
    } catch (e) {
      setMessage({ tone: 'neg', text: e instanceof Error ? e.message : 'Import failed.' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {saved.length} saved calculation{saved.length === 1 ? '' : 's'} on this device.
        </p>
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import calculations file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <Upload size={14} /> Import JSON
          </Button>
          <Button size="sm" disabled={saved.length === 0} onClick={() => download(`networth-calculations-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(savedOps.export(saved), null, 2))}>
            <Download size={14} /> Export JSON
          </Button>
        </div>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {saved.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Bookmark size={20} />}
            title="No saved calculations yet"
            action={
              <Button variant="primary" onClick={() => navigate('calculator')}>
                Open the calculator
              </Button>
            }
          >
            Save a calculation from the results panel to compare offers later. Everything stays in this browser.
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {saved.map((c) => (
            <SavedItem
              key={c.id}
              calc={c}
              onOpen={() => {
                loadDraft(c.draft);
                navigate('calculator');
              }}
              onRename={(n) => setSaved(savedOps.rename(saved, c.id, n))}
              onDuplicate={() => setSaved(savedOps.duplicate(saved, c.id))}
              onDelete={() => setSaved(savedOps.remove(saved, c.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
