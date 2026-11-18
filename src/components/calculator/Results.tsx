import { AlertTriangle, ArrowRight, BadgeCheck, ChevronDown, ExternalLink, Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { BreakdownLine, CalcResult, DatasetMeta, DeductionCategory, VerificationStatus } from '../../engine/types';
import type { RateQuote } from '../../services/currency/currencyService';
import type { Frequency } from '../../services/storage/models';
import { formatDate, formatMoney, formatPercent, formatRate, type FormatPrefs } from '../../utils/format';
import { SEGMENT_COLORS, StackedBar } from '../charts/StackedBar';
import { Badge, Card, cx, Notice, SectionTitle, Segmented } from '../common/ui';
import { rateSourceLabel } from './OutputPanel';

export const STATUS_COPY: Record<VerificationStatus, { label: string; tone: 'pos' | 'warn' | 'neg'; text: string }> = {
  verified: { label: 'Verified rules', tone: 'pos', text: 'Tax rules checked against official sources for this tax year.' },
  estimated: { label: 'Estimate', tone: 'warn', text: 'Some rules or circumstances are approximated — see the notes below.' },
  incomplete: { label: 'Incomplete data', tone: 'neg', text: 'Important tax information is missing for this country or year.' },
};

const CATEGORY_LABEL: Record<DeductionCategory, string> = {
  incomeTax: 'Income tax',
  social: 'Social contributions',
  mandatory: 'Other mandatory deductions',
  optional: 'Optional pension contributions',
};

export interface Conversion {
  quote: RateQuote | null;
  target: string;
}

const conv = (amount: number, c: Conversion): number | null => (c.quote ? amount * c.quote.rate : null);

export function ResultHero({ result, conversion, prefs, amount, frequency, meta, paymentsPerYear, actions }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs; amount: number; frequency: Frequency; meta: DatasetMeta; paymentsPerYear: number; actions?: ReactNode }) {
  const converted = conv(result.netMonthly, conversion);
  const showConverted = converted !== null && conversion.target !== result.currency;
  const status = STATUS_COPY[result.status];
  const freqText = frequency === 'hourly' ? 'hourly' : frequency === 'annual' ? 'annual' : 'monthly';
  return (
    <Card className="relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-soft blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Your estimated take-home pay</p>
          <p className="num mt-3 text-[40px] font-semibold leading-none tracking-tight text-ink sm:text-[56px]" data-testid="hero-amount">
            {showConverted ? formatMoney(converted, conversion.target, prefs) : formatMoney(result.netMonthly, result.currency, prefs)}
            <span className="ml-2 text-lg font-medium text-muted sm:text-xl">/ month</span>
          </p>
          {showConverted && (
            <p className="num mt-3 text-[15px] text-muted" data-testid="hero-local">
              Equivalent to <span className="font-semibold text-ink">{formatMoney(result.netMonthly, result.currency, prefs)}</span> / month
            </p>
          )}
          <p className="num mt-1.5 text-sm text-faint">
            Based on {formatMoney(amount, result.currency, prefs, { decimals: frequency === 'hourly' })} gross {freqText} salary
            {frequency === 'monthly' && paymentsPerYear !== 12 ? ` × ${paymentsPerYear} payments a year` : ''}
          </p>
          {showConverted && conversion.quote && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-faint">
              <Info size={12} />
              {conversion.quote.source === 'manual'
                ? `Converted after tax at your manual rate of ${formatRate(conversion.quote.rate, prefs)}.`
                : `Converted after tax using the ${conversion.quote.historical ? '' : 'latest available '}ECB rate of ${formatDate(conversion.quote.date)}.`}
              {conversion.quote.outdated && <Badge tone="warn">{rateSourceLabel(conversion.quote).text}</Badge>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Badge tone={status.tone} title={status.text}>
            {result.status === 'verified' ? <BadgeCheck size={12} /> : <AlertTriangle size={12} />}
            {status.label}
          </Badge>
          <span className="text-xs text-faint">
            Tax year {result.taxYear} · data v{result.datasetVersion} · verified {formatDate(meta.lastVerified)}
          </span>
          {actions}
        </div>
      </div>
    </Card>
  );
}

function Kpi({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="num mt-1.5 truncate text-xl font-semibold tracking-tight text-ink" data-testid={testId}>
        {value}
      </p>
      {sub && <p className="num mt-0.5 truncate text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function KpiRow({ result, conversion, prefs }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs }) {
  const primary = (v: number) => {
    const c = conv(v, conversion);
    return c !== null ? formatMoney(c, conversion.target, prefs) : formatMoney(v, result.currency, prefs);
  };
  const secondary = (v: number) => (conv(v, conversion) !== null && conversion.target !== result.currency ? formatMoney(v, result.currency, prefs) : undefined);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Kpi label="Annual net income" value={primary(result.netAnnual)} sub={secondary(result.netAnnual)} testId="kpi-net-annual" />
      <Kpi label="Monthly net income" value={primary(result.netMonthly)} sub={secondary(result.netMonthly)} />
      <Kpi label="Effective tax rate" value={formatPercent(result.effectiveTaxRate, prefs)} sub={`Marginal ${formatPercent(result.marginalTaxRate, prefs, 0)}`} testId="kpi-effective" />
      <Kpi label="Total annual deductions" value={primary(result.totalDeductions)} sub={secondary(result.totalDeductions)} />
      <Kpi label="Total monthly deductions" value={primary(result.totalDeductions / 12)} sub={secondary(result.totalDeductions / 12)} />
    </div>
  );
}

function BreakdownRow({ line, divisor, currency, prefs }: { line: BreakdownLine; divisor: number; currency: string; prefs: FormatPrefs }) {
  const [open, setOpen] = useState(false);
  const panelId = `bd-${line.id}`;
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEGMENT_COLORS[line.category] }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{line.label}</span>
          <span className="block text-xs text-faint">{CATEGORY_LABEL[line.category]}</span>
        </span>
        <span className="num text-sm font-medium text-neg">− {formatMoney(line.amount / divisor, currency, prefs)}</span>
        <ChevronDown size={16} className={cx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="mb-3 ml-5 rounded-xl bg-surface-2 p-3.5 text-[13px]">
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
                  <dd className={cx('num font-medium', p.amount < 0 ? 'text-pos' : 'text-ink')}>
                    {p.amount < 0 ? '− ' : ''}
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
    { key: 'social', label: 'Social', value: result.socialContributions, color: SEGMENT_COLORS.social },
    { key: 'mandatory', label: 'Other mandatory', value: result.otherMandatory, color: SEGMENT_COLORS.mandatory },
    { key: 'optional', label: 'Pension (optional)', value: result.optionalDeductions, color: SEGMENT_COLORS.optional },
  ];
  const lines = result.lines.filter((l) => l.amount > 0.005);
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        hint={`All amounts in ${c}, the employment currency.`}
        action={
          <div className="w-[170px]">
            <Segmented size="sm" label="Breakdown period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} />
          </div>
        }
      >
        Tax breakdown
      </SectionTitle>
      <StackedBar segments={segments} total={result.grossAnnual} prefs={prefs} label="Share of gross salary" />
      <div className="mt-5 flex items-center justify-between border-b border-line pb-3">
        <span className="text-sm font-semibold text-ink">Gross salary</span>
        <span className="num text-sm font-semibold text-ink">{formatMoney(result.grossAnnual / d, c, prefs)}</span>
      </div>
      <ul>
        {lines.map((l) => (
          <BreakdownRow key={l.id} line={l} divisor={d} currency={c} prefs={prefs} />
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--pos)_10%,transparent)] px-3.5 py-3">
        <span className="text-sm font-semibold text-ink">= Net salary</span>
        <span className="num text-base font-semibold text-pos" data-testid="breakdown-net">
          {formatMoney(result.netAnnual / d, c, prefs)}
        </span>
      </div>
    </Card>
  );
}

export function ConversionDetails({ result, conversion, prefs }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs }) {
  const q = conversion.quote;
  const rows: [string, ReactNode][] = [
    ['Net salary (original)', formatMoney(result.netMonthly, result.currency, prefs) + ' / month'],
    ['Original currency', result.currency],
    ['Target currency', conversion.target],
    ['Exchange rate', q ? `1 ${result.currency} = ${formatRate(q.rate, prefs)} ${conversion.target}` : '—'],
    ['Rate date', q ? (q.source === 'manual' ? 'Manual rate' : q.source === 'identity' ? 'Not needed' : formatDate(q.date)) : '—'],
    ['Converted monthly', q ? formatMoney(result.netMonthly * q.rate, conversion.target, prefs) : '—'],
    ['Converted annual', q ? formatMoney(result.netAnnual * q.rate, conversion.target, prefs) : '—'],
  ];
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle hint="Taxes are calculated in the employment currency first; only the resulting net salary is converted.">Currency conversion</SectionTitle>
      <ol className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Calculation order">
        {['Gross pay', 'Taxes & contributions', 'Net pay', 'Exchange rate', 'Converted net'].map((s, i, a) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={cx('rounded-md px-2 py-1', i === a.length - 1 ? 'bg-accent-soft text-accent' : 'bg-surface-2')}>{s}</span>
            {i < a.length - 1 && <ArrowRight size={12} className="text-faint" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {q?.outdated && (
        <div className="mt-4">
          <Notice tone="warn" icon={<AlertTriangle size={15} />}>
            {q.source === 'bundled' || q.source === 'stale-cache' ? `The exchange-rate service could not be reached. The rate shown is from ${formatDate(q.date)} and may not reflect today's market.` : `The latest published rate is from ${formatDate(q.date)}.`}
          </Notice>
        </div>
      )}
    </Card>
  );
}

export function OverviewTable({ result, conversion, prefs }: { result: CalcResult; conversion: Conversion; prefs: FormatPrefs }) {
  const canConvert = conversion.quote !== null && conversion.target !== result.currency;
  const [inTarget, setInTarget] = useState(false);
  const useTarget = canConvert && inTarget;
  const cur = useTarget ? conversion.target : result.currency;
  const f = (v: number) => formatMoney(useTarget && conversion.quote ? v * conversion.quote.rate : v, cur, prefs);
  const contributions = result.socialContributions + result.otherMandatory;
  const rows: [string, number, string?][] = [
    ['Gross salary', result.grossAnnual],
    ['Income tax', -result.incomeTax],
    ['Contributions', -contributions, 'Social contributions and other mandatory levies'],
    ...(result.optionalDeductions > 0 ? ([['Pension (optional)', -result.optionalDeductions]] as [string, number][]) : []),
    ['Net salary', result.netAnnual],
  ];
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        action={
          canConvert ? (
            <div className="w-[150px]">
              <Segmented size="sm" label="Overview currency" value={useTarget ? 'target' : 'local'} onChange={(v) => setInTarget(v === 'target')} options={[{ value: 'local', label: result.currency }, { value: 'target', label: conversion.target }]} />
            </div>
          ) : undefined
        }
      >
        Salary overview
      </SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 font-medium">
                Metric
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Monthly
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Annually
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, v, title]) => {
              const isNet = label === 'Net salary';
              return (
                <tr key={label} className={cx('border-b border-line last:border-b-0', isNet && 'font-semibold')}>
                  <th scope="row" className={cx('py-2.5 text-left font-medium', isNet ? 'text-ink' : 'text-muted')} title={title}>
                    {label}
                  </th>
                  <td className={cx('num py-2.5 text-right', isNet ? 'text-pos' : v < 0 ? 'text-ink' : 'text-ink')}>{f(v / 12)}</td>
                  <td className={cx('num py-2.5 text-right', isNet ? 'text-pos' : 'text-ink')}>{f(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function NotesCard({ result, meta, onMethodology }: { result: CalcResult; meta: DatasetMeta; onMethodology: () => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle hint={STATUS_COPY[result.status].text}>Assumptions & sources</SectionTitle>
      {result.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {result.warnings.map((w) => (
            <Notice key={w} tone="warn" icon={<AlertTriangle size={15} />}>
              {w}
            </Notice>
          ))}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">This estimate assumes</h3>
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
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Official sources · {meta.taxYear}</h3>
          <ul className="space-y-2">
            {meta.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 text-[13px] text-accent hover:underline">
                  <ExternalLink size={12} className="mt-1 shrink-0" />
                  <span>
                    {s.title} <span className="text-faint">— {s.authority}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-faint">
            Last verified {formatDate(meta.lastVerified)} · effective from {formatDate(meta.effectiveDate)}.{' '}
            <button type="button" onClick={onMethodology} className="text-accent hover:underline">
              Methodology and limitations
            </button>
          </p>
        </div>
      </div>
    </Card>
  );
}
