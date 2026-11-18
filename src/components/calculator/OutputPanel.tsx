import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useId } from 'react';
import type { RateState } from '../../hooks/useRate';
import { CURRENCY_CODES, CURRENCY_NAMES } from '../../services/currency/currencies';
import type { RateQuote } from '../../services/currency/currencyService';
import type { CalcDraft } from '../../services/storage/models';
import { formatDate, formatRate, type FormatPrefs } from '../../utils/format';
import { Badge, Field, Notice, Segmented, Select, Switch, TextInput } from '../common/ui';

export function rateSourceLabel(q: RateQuote): { text: string; tone: 'pos' | 'warn' | 'accent' | 'neutral' } {
  switch (q.source) {
    case 'live':
      return q.outdated ? { text: 'Outdated', tone: 'warn' } : { text: q.historical ? 'Historical' : 'Latest', tone: 'pos' };
    case 'cache':
      return q.outdated ? { text: 'Outdated', tone: 'warn' } : { text: q.historical ? 'Historical' : 'Latest · cached', tone: 'pos' };
    case 'stale-cache':
      return { text: 'Offline · last known', tone: 'warn' };
    case 'bundled':
      return { text: 'Offline · built-in', tone: 'warn' };
    case 'manual':
      return { text: 'Manual rate', tone: 'accent' };
    default:
      return { text: 'Same currency', tone: 'neutral' };
  }
}

export function OutputPanel({ draft, patch, from, rate, prefs }: { draft: CalcDraft; patch: (p: Partial<CalcDraft>) => void; from: string; rate: RateState; prefs: FormatPrefs }) {
  const ids = useId();
  const same = from === draft.targetCurrency;
  const q = rate.quote;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Field label="Show results in" htmlFor={`${ids}-cur`}>
        <Select id={`${ids}-cur`} value={draft.targetCurrency} onChange={(e) => patch({ targetCurrency: e.target.value })}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c} — {CURRENCY_NAMES[c]}
            </option>
          ))}
        </Select>
      </Field>

      {!same && (
        <>
          <Switch
            label="Automatic currency conversion"
            description="Use the latest ECB reference rate from Frankfurter."
            checked={draft.autoConvert}
            onChange={(autoConvert) => patch({ autoConvert })}
          />

          {draft.autoConvert ? (
            <div className="space-y-3">
              <Segmented
                size="sm"
                label="Exchange rate date"
                value={draft.rateDate ? 'historical' : 'latest'}
                onChange={(v) => patch({ rateDate: v === 'latest' ? null : today })}
                options={[
                  { value: 'latest', label: 'Latest rate' },
                  { value: 'historical', label: 'Historical' },
                ]}
              />
              {draft.rateDate && (
                <Field label="Rate on date" htmlFor={`${ids}-date`} help="ECB publishes on working days; the closest earlier rate is used.">
                  <TextInput id={`${ids}-date`} type="date" min="1999-01-04" max={today} value={draft.rateDate} onChange={(e) => e.target.value && patch({ rateDate: e.target.value })} />
                </Field>
              )}
            </div>
          ) : (
            <Field label={`Manual rate: 1 ${from} = ? ${draft.targetCurrency}`} htmlFor={`${ids}-manual`} help="Used instead of the published rate. Leave empty to show results only in the employment currency.">
              <TextInput
                id={`${ids}-manual`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="e.g. 0.134"
                value={draft.manualRate ?? ''}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  patch({ manualRate: Number.isFinite(v) && v > 0 ? v : null });
                }}
              />
            </Field>
          )}
        </>
      )}

      <div className="rounded-xl border border-line bg-surface p-3.5" aria-live="polite">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Exchange rate</span>
          {q && <Badge tone={rateSourceLabel(q).tone}>{rateSourceLabel(q).text}</Badge>}
        </div>
        {same ? (
          <p className="text-[13px] text-muted">Employment and output currency are both {from}; no conversion needed.</p>
        ) : rate.loading && !q ? (
          <p className="text-[13px] text-muted">Fetching the latest rate…</p>
        ) : q ? (
          <>
            <p className="num text-[15px] font-semibold text-ink">
              1 {from} = {formatRate(q.rate, prefs)} {draft.targetCurrency}
            </p>
            <p className="num mt-0.5 text-xs text-faint">
              1 {draft.targetCurrency} = {formatRate(1 / q.rate, prefs)} {from}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              {q.source === 'manual' ? 'Entered by you.' : `ECB reference rate of ${formatDate(q.date)} via Frankfurter.`}
            </p>
            {q.outdated && (
              <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-warn">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {q.source === 'bundled' || q.source === 'stale-cache'
                  ? `The rate service is unreachable, so this is the last known rate from ${formatDate(q.date)} — not today's rate.`
                  : `This is the most recent published rate, from ${formatDate(q.date)}.`}
              </p>
            )}
            {draft.autoConvert && !q.historical && (
              <button type="button" onClick={rate.refresh} className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                <RefreshCw size={12} className={rate.loading ? 'animate-spin' : ''} /> Refresh rate
              </button>
            )}
          </>
        ) : rate.error ? (
          <Notice tone="neg">
            {rate.error}{' '}
            <button type="button" className="font-medium text-accent underline" onClick={() => patch({ autoConvert: false })}>
              Enter a rate manually
            </button>
          </Notice>
        ) : (
          <p className="text-[13px] text-muted">No conversion — enter a manual rate to see results in {draft.targetCurrency}.</p>
        )}
      </div>
    </div>
  );
}
