import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useId } from 'react';
import type { RateState } from '../../hooks/useRate';
import { CURRENCY_CODES, CURRENCY_NAMES } from '../../services/currency/currencies';
import type { RateQuote } from '../../services/currency/currencyService';
import type { CalcDraft } from '../../services/storage/models';
import { formatDate, formatRate, type FormatPrefs } from '../../utils/format';
import { Badge, Field, Notice, Segmented, Select, Switch, TextInput, type Tone } from '../common/ui';

/** One consistent vocabulary for rate freshness, used everywhere a rate is shown. */
export function rateSourceLabel(q: RateQuote): { text: string; tone: Tone; detail: string } {
  switch (q.source) {
    case 'live':
      return q.outdated
        ? { text: 'Outdated', tone: 'warn', detail: `Most recent published rate (${formatDate(q.date)}).` }
        : { text: q.historical ? 'Historical' : 'Latest', tone: q.historical ? 'neutral' : 'pos', detail: q.historical ? `ECB rate of ${formatDate(q.date)}.` : `Fetched just now; ECB rate of ${formatDate(q.date)}.` };
    case 'cache':
      return q.outdated
        ? { text: 'Outdated', tone: 'warn', detail: `Most recent published rate (${formatDate(q.date)}).` }
        : { text: q.historical ? 'Historical' : 'Cached', tone: q.historical ? 'neutral' : 'pos', detail: `Fetched in the last 6 hours; ECB rate of ${formatDate(q.date)}.` };
    case 'stale-cache':
      return { text: 'Offline · last known', tone: 'warn', detail: `The rate service is unreachable. Last known rate from ${formatDate(q.date)} — not today’s rate.` };
    case 'bundled':
      return { text: 'Offline · built-in', tone: 'warn', detail: `The rate service is unreachable. Built-in fallback rate from ${formatDate(q.date)} — not today’s rate.` };
    case 'manual':
      return { text: 'Manual rate', tone: 'accent', detail: 'Entered by you.' };
    default:
      return { text: 'No conversion', tone: 'neutral', detail: 'Same currency.' };
  }
}

export function OutputPanel({ draft, patch, from, rate, prefs }: { draft: CalcDraft; patch: (p: Partial<CalcDraft>) => void; from: string; rate: RateState; prefs: FormatPrefs }) {
  const ids = useId();
  const same = from === draft.targetCurrency;
  const q = rate.quote;
  const today = new Date().toISOString().slice(0, 10);
  const label = q ? rateSourceLabel(q) : null;

  return (
    <div className="space-y-4">
      <Field label="Show take-home pay in" htmlFor={`${ids}-cur`}>
        <Select id={`${ids}-cur`} value={draft.targetCurrency} onChange={(e) => patch({ targetCurrency: e.target.value })}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c} — {CURRENCY_NAMES[c]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-lg bg-surface-2 px-3.5 py-3" aria-live="polite">
        {same ? (
          <p className="text-[13px] text-muted">Paid in {from} — no conversion needed.</p>
        ) : rate.loading && !q ? (
          <p className="text-[13px] text-muted">Fetching the latest ECB rate…</p>
        ) : q && label ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mono text-sm font-medium text-ink">
                1 {from} = {formatRate(q.rate, prefs)} {draft.targetCurrency}
              </p>
              <Badge tone={label.tone}>{label.text}</Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-faint">{q.source === 'manual' ? 'Your own rate.' : `ECB reference rate of ${formatDate(q.date)} via Frankfurter.`}</p>
            {q.outdated && (
              <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-warn">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {label.detail}
              </p>
            )}
            {draft.autoConvert && !q.historical && (
              <button type="button" onClick={rate.refresh} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                <RefreshCw size={12} className={rate.loading ? 'animate-spin' : ''} /> Refresh rate
              </button>
            )}
          </>
        ) : rate.error ? (
          <Notice tone="neg">
            {rate.error} Tax results below are unaffected.{' '}
            <button type="button" className="font-medium text-accent underline" onClick={() => patch({ autoConvert: false })}>
              Enter a rate manually
            </button>
          </Notice>
        ) : (
          <p className="text-[13px] text-muted">No conversion — enter a manual rate to see results in {draft.targetCurrency}.</p>
        )}
      </div>

      {!same && (
        <details className="group" open={!draft.autoConvert || !!draft.rateDate}>
          <summary className="cursor-pointer text-[13px] font-medium text-muted hover:text-ink">
            <span className="group-open:hidden">Rate options</span>
            <span className="hidden group-open:inline">Hide rate options</span>
          </summary>
          <div className="mt-3 space-y-4">
            <Switch label="Automatic currency conversion" description="Use the published ECB reference rate." checked={draft.autoConvert} onChange={(autoConvert) => patch({ autoConvert })} />
            {draft.autoConvert ? (
              <>
                <Segmented
                  size="sm"
                  label="Exchange rate date"
                  value={draft.rateDate ? 'historical' : 'latest'}
                  onChange={(v) => patch({ rateDate: v === 'latest' ? null : today })}
                  options={[
                    { value: 'latest', label: 'Latest rate' },
                    { value: 'historical', label: 'On a date' },
                  ]}
                />
                {draft.rateDate && (
                  <Field label="Rate on date" htmlFor={`${ids}-date`} help="ECB publishes on working days; the closest earlier rate is used.">
                    <TextInput id={`${ids}-date`} type="date" min="1999-01-04" max={today} value={draft.rateDate} onChange={(e) => e.target.value && patch({ rateDate: e.target.value })} />
                  </Field>
                )}
              </>
            ) : (
              <Field label={`Manual rate: 1 ${from} = ? ${draft.targetCurrency}`} htmlFor={`${ids}-manual`} help="Use the rate your bank or transfer service quotes you.">
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
            <p className="text-xs leading-relaxed text-faint">ECB reference rates are mid-market rates. Banks and transfer services add a margin, so the amount you actually receive in {draft.targetCurrency} is usually a little lower.</p>
          </div>
        </details>
      )}
    </div>
  );
}
