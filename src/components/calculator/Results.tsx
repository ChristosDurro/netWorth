import { AlertTriangle, BadgeCheck, ChevronDown, CircleAlert, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BreakdownLine, CalcResult, DatasetMeta, DeductionCategory, VerificationStatus } from '../../engine/types';
import { Link } from '../../router';
import type { RateQuote } from '../../services/currency/currencyService';
import type { CalcDraft } from '../../services/storage/models';
import { formatDate, formatMoney, formatPercent, formatRate, type FormatPrefs } from '../../utils/format';
import { SEGMENT_COLORS, StackedBar } from '../charts/StackedBar';
import { Badge, Card, cx, Notice, Row, SectionTitle, Segmented } from '../common/ui';
import { rateSourceLabel } from './OutputPanel';

/** The three verification levels, with the definitions shown wherever a status appears. */
export const STATUS_COPY: Record<VerificationStatus, { label: string; tone: 'pos' | 'warn' | 'neg'; text: string }> = {
  verified: { label: 'Verified', tone: 'pos', text: 'The rules and parameters for this tax year have been reviewed against official sources.' },
  estimated: { label: 'Estimate', tone: 'warn', text: 'Some parameters rely on secondary sources or simplifications, so treat the result as an estimate.' },
  incomplete: { label: 'Incomplete', tone: 'neg', text: 'Information is missing, so the result may not represent your situation.' },
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const s = STATUS_COPY[status];
  return (
    <Badge tone={s.tone} title={s.text}>
      {status === 'verified' ? <BadgeCheck size={13} /> : <CircleAlert size={13} />}
      {s.label}
    </Badge>
  );
}

const CATEGORY_LABEL: Record<DeductionCategory, string> = {
  incomeTax: 'Income tax',
  social: 'Social contributions',
  mandatory: 'Other mandatory deductions',
  optional: 'Your pension contributions',
};
const CATEGORY_HELP: Record<DeductionCategory, string> = {
  incomeTax: 'Tax on your income, paid to the state and, in some countries, your municipality.',
  social: 'Contributions that fund pensions, health care and unemployment insurance.',
  mandatory: 'Other compulsory levies deducted from pay.',
  optional: 'Contributions you chose to pay into a pension scheme. They are your savings, not a tax.',
};

export interface Conversion {
  quote: RateQuote | null;
  target: string;
}
const conv = (amount: number, c: Conversion): number | null => (c.quote ? amount * c.quote.rate : null);

/** Smoothly tweens a figure when it changes; jumps straight there with reduced motion. */
function useAnimatedNumber(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function' || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    let start: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      if (start === null) start = t;
      const k = Math.min(1, Math.max(0, (t - start) / 320));
      const eased = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return shown;
}

function Metric({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 px-0 py-3 sm:px-5 sm:py-0 sm:first:pl-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="num mt-1 truncate text-lg font-semibold tracking-[-0.01em] text-ink" data-testid={testId}>
        {value}
      </dd>
      {sub && <dd className="num mt-0.5 truncate text-xs text-faint">{sub}</dd>}
    </div>
  );
}

export function ResultSummary({ result, conversion, prefs, draft, paymentsPerYear, meta, actions }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs; draft: CalcDraft; paymentsPerYear: number; meta: DatasetMeta; actions?: ReactNode }) {
  const reverse = draft.direction === 'net-to-gross';
  const local = result.currency;
  const canConvert = conversion.quote !== null && conversion.target !== local;
  const main = (v: number) => (canConvert ? (conv(v, conversion) as number) : v);
  const mainCur = canConvert ? conversion.target : local;
  const heroValue = reverse ? result.grossMonthly : result.netMonthly;
  const animated = useAnimatedNumber(main(heroValue));
  const label = rateSourceLabel(conversion.quote ?? { base: local, quote: local, rate: 1, date: null, source: 'identity', outdated: false, historical: false });

  return (
    <Card className="animate-enter overflow-hidden" aria-labelledby="result-heading">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="result-heading" className="text-sm font-medium text-muted">
            {reverse ? 'Gross salary you need' : 'Your net take-home pay'}
          </h2>
          <a href="#sources" className="rounded-md" title={STATUS_COPY[result.status].text}>
            <StatusBadge status={result.status} />
          </a>
        </div>
        <p className="num mt-2 text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[60px]" data-testid="hero-amount">
          {formatMoney(animated, mainCur, prefs)}
          <span className="ml-2 text-lg font-medium tracking-normal text-muted sm:text-xl">/ month</span>
        </p>
        <p className="num mt-2 text-[15px] text-muted" data-testid="hero-local">
          {canConvert ? (
            <>
              <span className="font-medium text-ink">{formatMoney(heroValue, local, prefs)}</span> / month in {local} ·{' '}
            </>
          ) : null}
          <span className="font-medium text-ink">{formatMoney(main(reverse ? result.grossAnnual : result.netAnnual), mainCur, prefs)}</span> per year
        </p>
        {reverse && (
          <p className="num mt-1 text-sm text-faint">
            to take home {formatMoney(main(result.netMonthly), mainCur, prefs)} a month after {formatPercent(result.effectiveTaxRate, prefs)} in tax and contributions
          </p>
        )}

        <dl className="mt-6 grid divide-y divide-line border-t border-line pt-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {reverse ? (
            <Metric label="Take-home pay" value={`${formatMoney(result.netMonthly, local, prefs)}`} sub={`${formatMoney(result.netAnnual, local, prefs)} per year`} />
          ) : (
            <Metric label="Gross salary" value={`${formatMoney(result.grossMonthly, local, prefs)}`} sub={`${formatMoney(result.grossAnnual, local, prefs)} per year${paymentsPerYear !== 12 ? ` · ${paymentsPerYear} payments` : ''}`} />
          )}
          <Metric label="Tax & contributions" value={`${formatMoney(result.totalDeductions / 12, local, prefs)}`} sub={`${formatMoney(result.totalDeductions, local, prefs)} per year`} />
          <Metric label="Effective tax rate" value={formatPercent(result.effectiveTaxRate, prefs)} sub="of gross pay" testId="kpi-effective" />
        </dl>
      </div>
      <div className="flex flex-col gap-3 border-t border-line bg-surface-2/50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-xs leading-relaxed text-faint">
          {canConvert && conversion.quote
            ? conversion.quote.source === 'manual'
              ? `Converted after tax at your rate of ${formatRate(conversion.quote.rate, prefs)}. `
              : `Converted after tax at the ECB rate of ${formatDate(conversion.quote.date)}${conversion.quote.outdated ? ` (${label.text.toLowerCase()})` : ''}. `
            : ''}
          Tax year {result.taxYear} · data v{result.datasetVersion} · checked {formatDate(meta.lastVerified)}
        </p>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

function BreakdownLineRow({ line, divisor, currency, prefs }: { line: BreakdownLine; divisor: number; currency: string; prefs: FormatPrefs }) {
  const [open, setOpen] = useState(false);
  const panelId = `bd-${line.id}`;
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 rounded-md py-2.5 text-left hover:bg-surface-2/60">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{line.label}</span>
        <span className="mono text-sm text-ink">−{formatMoney(line.amount / divisor, currency, prefs)}</span>
        <ChevronDown size={15} className={cx('shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="mb-2 animate-fade rounded-lg bg-surface-2 p-3.5 text-[13px]">
          <ul className="space-y-1.5 text-muted">
            {line.details.map((d) => (
              <li key={d} className="leading-relaxed">
                {d}
              </li>
            ))}
          </ul>
          {line.parts && line.parts.length > 0 && (
            <dl className="mt-3 space-y-1 border-t border-line pt-3">
              {line.parts.map((p) => (
                <div key={p.label} className="flex justify-between gap-4">
                  <dt className="text-muted">{p.label}</dt>
                  <dd className={cx('mono', p.amount < 0 ? 'text-pos' : 'text-ink')}>
                    {p.amount < 0 ? '−' : ''}
                    {formatMoney(Math.abs(p.amount) / divisor, currency, prefs)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

export function Breakdown({ result, prefs }: { result: CalcResult; prefs: FormatPrefs }) {
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const d = period === 'month' ? 12 : 1;
  const c = result.currency;
  const segments = [
    { key: 'net', label: 'Take-home', value: result.netAnnual, color: SEGMENT_COLORS.net },
    { key: 'incomeTax', label: 'Income tax', value: result.incomeTax, color: SEGMENT_COLORS.incomeTax },
    { key: 'social', label: 'Social contributions', value: result.socialContributions, color: SEGMENT_COLORS.social },
    { key: 'mandatory', label: 'Other mandatory', value: result.otherMandatory, color: SEGMENT_COLORS.mandatory },
    { key: 'optional', label: 'Pension (your choice)', value: result.optionalDeductions, color: SEGMENT_COLORS.optional },
  ];
  const categories = (['incomeTax', 'social', 'mandatory', 'optional'] as DeductionCategory[])
    .map((cat) => ({ cat, lines: result.lines.filter((l) => l.category === cat && l.amount > 0.005) }))
    .filter((g) => g.lines.length > 0);
  return (
    <Card className="p-5 sm:p-6" aria-labelledby="breakdown-heading">
      <SectionTitle
        id="breakdown-heading"
        hint={`Where your gross salary goes. Amounts in ${c}, the currency you are paid in.`}
        action={
          <div className="w-[164px]">
            <Segmented size="sm" label="Breakdown period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} />
          </div>
        }
      >
        Tax breakdown
      </SectionTitle>
      <StackedBar segments={segments} total={result.grossAnnual} prefs={prefs} label="Share of gross salary" />
      <div className="mt-6 flex items-baseline justify-between border-b border-line pb-3">
        <span className="text-sm font-medium text-ink">Gross salary</span>
        <span className="mono text-sm font-medium text-ink">{formatMoney(result.grossAnnual / d, c, prefs)}</span>
      </div>
      <div className="divide-y divide-line">
        {categories.map(({ cat, lines }) => {
          const total = lines.reduce((s, l) => s + l.amount, 0);
          return (
            <section key={cat} className="py-3" aria-label={CATEGORY_LABEL[cat]}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: SEGMENT_COLORS[cat] }} aria-hidden="true" />
                  {CATEGORY_LABEL[cat]}
                </h3>
                <span className="mono text-[13px] font-semibold text-ink">−{formatMoney(total / d, c, prefs)}</span>
              </div>
              <p className="mt-0.5 pl-4 text-xs text-faint">{CATEGORY_HELP[cat]}</p>
              <ul className="mt-1 pl-4">
                {lines.map((l) => (
                  <BreakdownLineRow key={l.id} line={l} divisor={d} currency={c} prefs={prefs} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-1 flex items-baseline justify-between rounded-lg bg-pos-soft px-3.5 py-3">
        <span className="text-sm font-semibold text-ink">Take-home pay</span>
        <span className="mono text-base font-semibold text-pos" data-testid="breakdown-net">
          {formatMoney(result.netAnnual / d, c, prefs)}
        </span>
      </div>
    </Card>
  );
}

export function PeriodTable({ result, conversion, prefs }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs }) {
  const canConvert = conversion.quote !== null && conversion.target !== result.currency;
  const [inTarget, setInTarget] = useState(false);
  const useTarget = canConvert && inTarget;
  const cur = useTarget ? conversion.target : result.currency;
  const f = (v: number) => formatMoney(useTarget && conversion.quote ? v * conversion.quote.rate : v, cur, prefs);
  const rows: [string, number, boolean?][] = [
    ['Gross salary', result.grossAnnual],
    ['Income tax', -result.incomeTax],
    ['Social contributions', -result.socialContributions],
    ...(result.otherMandatory > 0 ? ([['Other mandatory', -result.otherMandatory]] as [string, number][]) : []),
    ...(result.optionalDeductions > 0 ? ([['Pension (your choice)', -result.optionalDeductions]] as [string, number][]) : []),
    ['Take-home pay', result.netAnnual, true],
  ];
  return (
    <Card className="p-5 sm:p-6" aria-labelledby="period-heading">
      <SectionTitle
        id="period-heading"
        hint="Monthly figures are the annual amount divided by 12."
        action={
          canConvert ? (
            <div className="w-[150px]">
              <Segmented size="sm" label="Table currency" value={useTarget ? 'target' : 'local'} onChange={(v) => setInTarget(v === 'target')} options={[{ value: 'local', label: result.currency }, { value: 'target', label: conversion.target }]} />
            </div>
          ) : undefined
        }
      >
        Monthly and annual
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Item</span>
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Monthly
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Annual
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, v, isNet]) => (
              <tr key={label} className={cx('border-b border-line last:border-b-0', isNet && 'font-semibold')}>
                <th scope="row" className={cx('py-2.5 pr-3 text-left font-normal', isNet ? 'font-semibold text-ink' : 'text-muted')}>
                  {label}
                </th>
                <td className={cx('mono whitespace-nowrap py-2.5 pl-3 text-right', isNet ? 'text-pos' : 'text-ink')}>{f(v / 12)}</td>
                <td className={cx('mono whitespace-nowrap py-2.5 pl-3 text-right', isNet ? 'text-pos' : 'text-ink')}>{f(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ConversionDetails({ result, conversion, prefs }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs }) {
  const q = conversion.quote;
  if (conversion.target === result.currency) return null;
  const label = q ? rateSourceLabel(q) : null;
  return (
    <Card className="p-5 sm:p-6" aria-labelledby="conversion-heading">
      <SectionTitle id="conversion-heading" hint={`Tax is calculated in ${result.currency}, the currency you are paid in. Only the take-home pay is converted.`}>
        Currency conversion
      </SectionTitle>
      <dl className="divide-y divide-line">
        <Row label="Take-home pay">{formatMoney(result.netMonthly, result.currency, prefs)} / month</Row>
        <Row label="Exchange rate">{q ? `1 ${result.currency} = ${formatRate(q.rate, prefs)} ${conversion.target}` : 'Not available'}</Row>
        <Row label="Source">{q ? (q.source === 'manual' ? 'Your own rate' : 'ECB reference rate (Frankfurter)') : '—'}</Row>
        <Row label="Rate date">{q && q.source !== 'manual' ? formatDate(q.date) : '—'}</Row>
        <Row label="Status">{label ? <Badge tone={label.tone}>{label.text}</Badge> : '—'}</Row>
        <Row label="Converted" strong>
          {q ? `${formatMoney(result.netMonthly * q.rate, conversion.target, prefs)} / month` : '—'}
        </Row>
      </dl>
      {q?.outdated && label && (
        <div className="mt-4">
          <Notice tone="warn" icon={<AlertTriangle size={15} />}>
            {label.detail}
          </Notice>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-faint">ECB reference rates are mid-market rates. The rate your bank or transfer service gives you includes a margin, so you may receive slightly less.</p>
    </Card>
  );
}

export function AdvancedDetails({ result, prefs, paymentsPerYear }: { result: CalcResult; prefs: FormatPrefs; paymentsPerYear: number }) {
  const step = Math.max(result.grossAnnual * 0.01, 100);
  return (
    <Card className="p-5 sm:p-6" aria-labelledby="advanced-heading">
      <SectionTitle id="advanced-heading">Advanced details</SectionTitle>
      <dl className="divide-y divide-line">
        <Row label="Marginal tax rate">{formatPercent(result.marginalTaxRate, prefs, 1)}</Row>
        {paymentsPerYear !== 12 && <Row label={`Take-home per payment (${paymentsPerYear} a year)`}>{formatMoney(result.netAnnual / paymentsPerYear, result.currency, prefs)}</Row>}
        <Row label="Total deductions per year">{formatMoney(result.totalDeductions, result.currency, prefs)}</Row>
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        The marginal rate is the share of a raise you would lose to tax and contributions — here measured on the next {formatMoney(step, result.currency, prefs)} of gross pay a year. The effective rate is the share of all your pay.
      </p>
    </Card>
  );
}

export function SourcesCard({ result, meta }: { result: CalcResult; meta: DatasetMeta }) {
  const status = STATUS_COPY[result.status];
  return (
    <Card className="scroll-mt-24 p-5 sm:p-6" id="sources" aria-labelledby="sources-heading">
      <SectionTitle id="sources-heading" action={<StatusBadge status={result.status} />}>
        Assumptions, sources and verification
      </SectionTitle>
      <p className="text-sm leading-relaxed text-muted">{status.text}</p>
      <dl className="mt-3 grid gap-x-6 text-[13px] sm:grid-cols-3">
        <Row label="Tax year">{meta.taxYear}</Row>
        <Row label="Dataset">v{meta.version}</Row>
        <Row label="Last checked">{formatDate(meta.lastVerified)}</Row>
      </dl>
      {result.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.warnings.map((w) => (
            <Notice key={w} tone="warn" icon={<AlertTriangle size={15} />}>
              {w}
            </Notice>
          ))}
        </div>
      )}
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">This calculation assumes</h3>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {meta.unverified.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-ink">Not yet confirmed against a primary source</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted">
                {meta.unverified.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
          {meta.limitations.length > 0 && (
            <details className="mt-4 text-[13px] text-muted">
              <summary className="cursor-pointer font-medium text-ink">Limitations ({meta.limitations.length})</summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                {meta.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Official sources · {meta.taxYear}</h3>
          <ul className="space-y-2">
            {meta.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-[13px] text-accent hover:underline">
                  <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden="true" />
                  <span>
                    {s.title} <span className="text-faint">— {s.authority}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-faint">
            Effective from {formatDate(meta.effectiveDate)}.{' '}
            <Link to="/methodology" className="text-accent underline underline-offset-2">
              How NetWorth calculates
            </Link>
          </p>
        </div>
      </div>
    </Card>
  );
}
