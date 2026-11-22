import { Bookmark, Columns3, Copy, Download, FolderOpen, Pencil, Trash2, Type, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Flag } from '../components/common/Flag';
import { Badge, Button, ButtonLink, Card, EmptyState, Notice, TextInput } from '../components/common/ui';
import { Container, PageHeader } from '../components/layout/Layout';
import { taxRegistry } from '../data/taxData';
import { useRouter } from '../router';
import type { SavedCalculation } from '../services/storage/models';
import { newId, savedOps } from '../services/storage/storage';
import { useApp, usePrefs } from '../state/AppState';
import { formatDate, formatMoney, formatPercent } from '../utils/format';
import { toAnnual } from '../utils/salary';

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

function SavedItem({ calc, onOpen, onEdit, onCompare, onRename, onDuplicate, onDelete }: { calc: SavedCalculation; onOpen: () => void; onEdit: () => void; onCompare: () => void; onRename: (n: string) => void; onDuplicate: () => void; onDelete: () => void }) {
  const prefs = usePrefs();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(calc.name);
  const [confirming, setConfirming] = useState(false);
  const s = calc.snapshot;
  const country = taxRegistry.listCountries(true).find((c) => c.code === calc.draft.country);
  const active = taxRegistry.activeVersion(calc.draft.country, calc.draft.taxYear);
  const converted = s.convertedNetMonthly !== null && s.targetCurrency !== s.currency;
  return (
    <li>
      <Card as="article" className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                <TextInput id={`rename-${calc.id}`} autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9 sm:h-9" maxLength={120} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
                <Button size="sm" variant="primary" type="submit">
                  Rename
                </Button>
              </form>
            ) : (
              <h3 className="truncate text-base font-semibold text-ink">{calc.name}</h3>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Flag code={calc.draft.country} className="h-3 w-[17px]" /> {country?.name ?? calc.draft.country}
              </span>
              <span>Tax year {calc.draft.taxYear}</span>
              <span>Data v{s.datasetVersion}</span>
              <span>Updated {formatDate(calc.updatedAt)}</span>
              {active && active !== s.datasetVersion && (
                <Badge tone="warn" title="Saved with an older tax-data version. Opening it recalculates with the current version.">
                  Newer tax data available
                </Badge>
              )}
            </div>
          </div>
          <dl className="flex gap-6 sm:text-right">
            <div>
              <dt className="text-xs text-faint">Take-home / month</dt>
              <dd className="num text-lg font-semibold text-ink">{converted ? formatMoney(s.convertedNetMonthly as number, s.targetCurrency, prefs) : formatMoney(s.netAnnual / 12, s.currency, prefs)}</dd>
              {converted && <dd className="num text-xs text-faint">{formatMoney(s.netAnnual / 12, s.currency, prefs)}</dd>}
            </div>
            <div>
              <dt className="text-xs text-faint">Effective tax</dt>
              <dd className="num text-lg font-semibold text-ink">{formatPercent(s.effectiveTaxRate, prefs)}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <Button size="sm" variant="primary" onClick={onOpen}>
            <FolderOpen size={14} /> Open
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onCompare}>
            <Columns3 size={14} /> Compare
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Type size={14} /> Rename
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            <Copy size={14} /> Duplicate
          </Button>
          {confirming ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted" role="group" aria-label="Confirm delete">
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
      </Card>
    </li>
  );
}

export function SavedPage() {
  const { saved, setSaved, loadDraft, compareRows, setCompareRows } = useApp();
  const { navigate } = useRouter();
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

  const addToCompare = (c: SavedCalculation) => {
    const d = c.draft;
    if (compareRows.length >= 8) {
      setMessage({ tone: 'neg', text: 'The comparison already has 8 offers. Remove one first.' });
      return;
    }
    // The comparison works with gross monthly salaries.
    const payments = taxRegistry.paymentsPerYear(d.country, d.taxYear, d.personal);
    const grossAnnual = d.direction === 'net-to-gross' ? c.snapshot.grossAnnual : toAnnual(d.amount, d.frequency, d.hoursPerWeek, payments);
    setCompareRows([...compareRows, { id: newId(), country: d.country, label: c.name.slice(0, 60), amount: Math.round(grossAnnual / payments), location: d.location, personal: d.personal }]);
    navigate('/compare');
  };

  return (
    <>
      <PageHeader
        title="Saved calculations"
        description="Stored only in this browser — nothing is uploaded. Export a backup to move them to another device."
        actions={
          <>
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
              <Upload size={14} /> Import
            </Button>
            <Button size="sm" disabled={saved.length === 0} onClick={() => download(`networth-calculations-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(savedOps.export(saved), null, 2))}>
              <Download size={14} /> Export JSON
            </Button>
          </>
        }
      />
      <Container className="space-y-4">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {saved.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Bookmark size={20} />}
              title="No saved calculations yet"
              action={
                <>
                  <ButtonLink to="/calculator" variant="primary">
                    Open the calculator
                  </ButtonLink>
                  <Button onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> Import a backup
                  </Button>
                </>
              }
            >
              Save a calculation from the results to keep job offers side by side. Everything stays in this browser.
            </EmptyState>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted">
              {saved.length} saved calculation{saved.length === 1 ? '' : 's'}. Each records the tax-data version it was calculated with; opening one recalculates it with the current data.
            </p>
            <ul className="space-y-3">
              {saved.map((c) => (
                <SavedItem
                  key={c.id}
                  calc={c}
                  onOpen={() => {
                    loadDraft(c.draft, null);
                    navigate('/calculator');
                  }}
                  onEdit={() => {
                    loadDraft(c.draft, c.id);
                    navigate('/calculator');
                  }}
                  onCompare={() => addToCompare(c)}
                  onRename={(n) => setSaved(savedOps.rename(saved, c.id, n))}
                  onDuplicate={() => setSaved(savedOps.duplicate(saved, c.id))}
                  onDelete={() => setSaved(savedOps.remove(saved, c.id))}
                />
              ))}
            </ul>
          </>
        )}
      </Container>
    </>
  );
}
