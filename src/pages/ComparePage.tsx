import { AlertTriangle, ArrowUpRight, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bestOutcome, compareCountries, gapToBest, sortOutcomes, type CompareOutcome, type SortMode } from '../calculations/compare';
import { PrintButton } from '../components/calculator/Actions';
import { CountryPicker } from '../components/calculator/CountryPicker';
import { PersonalFields } from '../components/calculator/PersonalFields';
import { AmountInput } from '../components/calculator/SalaryForm';
import { StatusBadge } from '../components/calculator/Results';
import { Flag } from '../components/common/Flag';
import { Badge, Button, Card, cx, Field, Notice, Select, TextInput } from '../components/common/ui';
import { Container, PageHeader } from '../components/layout/Layout';
import { taxRegistry } from '../data/taxData';
import { useRateTable } from '../hooks/useRateTable';
import { useRouter } from '../router';
import { CURRENCY_CODES } from '../services/currency/currencies';
import type { CompareRow } from '../services/storage/models';
import { newId } from '../services/storage/storage';
import { defaultDraft, typicalSalary, useApp, usePrefs } from '../state/AppState';
import { formatDate, formatMoney, formatPercent, type FormatPrefs } from '../utils/format';

const countryName = (code: string) => taxRegistry.listCountries().find((c) => c.code === code)?.name ?? code;
const offerName = (o: CompareOutcome) => o.row.label?.trim() || countryName(o.row.country);

function OfferEditor({ outcome, index, onChange, onRemove, prefs, taxYear, canRemove }: { outcome: CompareOutcome; index: number; onChange: (r: CompareRow) => void; onRemove: () => void; prefs: FormatPrefs; taxYear: number; canRemove: boolean }) {
  const { row } = outcome;
  const [open, setOpen] = useState(false);
  const countries = taxRegistry.listCountries();
  const info = countries.find((c) => c.code === row.country);
  let fields: ReturnType<typeof taxRegistry.getRequiredPersonalInputs> = [];
  let locations: ReturnType<typeof taxRegistry.getAvailableLocations> = null;
  try {
    fields = taxRegistry.getRequiredPersonalInputs(row.country, taxYear);
    locations = taxRegistry.getAvailableLocations(row.country, taxYear);
  } catch {
    /* shown as row error */
  }
  const n = index + 1;
  return (
    <li className="border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field label={`Offer ${n} country`}>
          <CountryPicker label={`Offer ${n} country`} countries={countries} value={row.country} onChange={(country) => onChange({ ...row, country, location: '', personal: {}, amount: countries.find((c) => c.code === country)?.currency === info?.currency ? row.amount : typicalSalary(countries.find((c) => c.code === country)?.currency ?? 'EUR') })} />
        </Field>
        <Field label={`Gross monthly salary${outcome.paymentsPerYear !== 12 ? ` (× ${outcome.paymentsPerYear})` : ''}`}>
          <AmountInput id={`amt-${row.id}`} size="md" label={`Gross monthly salary for offer ${n}, ${info?.name ?? row.country}`} value={row.amount} onChange={(amount) => onChange({ ...row, amount })} currency={info?.currency ?? ''} prefs={prefs} />
        </Field>
        <Field label="Name (optional)" htmlFor={`lbl-${row.id}`}>
          <TextInput id={`lbl-${row.id}`} value={row.label ?? ''} maxLength={60} placeholder={info?.name} onChange={(e) => onChange({ ...row, label: e.target.value || undefined })} />
        </Field>
        <div className="flex gap-1 sm:pb-0.5">
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)} aria-label={`Circumstances for offer ${n}`}>
            <SlidersHorizontal size={14} /> <span className="sm:hidden lg:inline">Circumstances</span>
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Remove offer ${n}, ${info?.name ?? row.country}`} onClick={onRemove} disabled={!canRemove}>
            <X size={15} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 animate-fade space-y-4 rounded-lg bg-surface-2 p-4">
          {locations && (
            <Field label={locations.label}>
              <select aria-label={locations.label} className="h-10 w-full rounded-lg border border-control/60 bg-surface px-3 text-sm text-ink" value={row.location || locations.defaultId} onChange={(e) => onChange({ ...row, location: e.target.value })}>
                {locations.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.hint ? ` — ${o.hint}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <PersonalFields fields={fields} values={row.personal} mode="advanced" onChange={(key, value) => onChange({ ...row, personal: { ...row.personal, [key]: value } })} />
        </div>
      )}
    </li>
  );
}

function Gap({ gap, target, prefs, isBest }: { gap: number | null; target: string; prefs: FormatPrefs; isBest: boolean }) {
  if (isBest) return <Badge tone="pos">Highest net</Badge>;
  if (gap === null) return <span className="text-faint">—</span>;
  return <span className="mono text-sm text-muted">−{formatMoney(Math.abs(gap) / 12, target, prefs)}/mo</span>;
}

function Details({ o, prefs, onOpen }: { o: CompareOutcome; prefs: FormatPrefs; onOpen: () => void }) {
  const r = o.result;
  if (!r) return null;
  const items: [string, number][] = [
    ['Income tax', r.incomeTax],
    ['Social contributions', r.socialContributions],
    ...(r.otherMandatory > 0 ? ([['Other mandatory', r.otherMandatory]] as [string, number][]) : []),
    ...(r.optionalDeductions > 0 ? ([['Pension (your choice)', r.optionalDeductions]] as [string, number][]) : []),
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-faint">Gross / month</dt>
          <dd className="mono text-ink">{formatMoney(r.grossMonthly, r.currency, prefs)}</dd>
        </div>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-faint">{k}</dt>
            <dd className="mono text-ink">−{formatMoney(v / 12, r.currency, prefs)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-faint">Take-home / month</dt>
          <dd className="mono font-medium text-pos">{formatMoney(r.netMonthly, r.currency, prefs)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {o.customAssumptions.map((a) => (
          <Badge key={a} tone="warn">
            {a}
          </Badge>
        ))}
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open in calculator <ArrowUpRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function ComparePage() {
  const { compareRows, setCompareRows, settings, loadDraft } = useApp();
  const { navigate } = useRouter();
  const prefs = usePrefs();
  const allYears = useMemo(() => [...new Set(taxRegistry.listCountries().flatMap((c) => c.years))].sort((a, b) => b - a), []);
  const [taxYear, setTaxYear] = useState(allYears.includes(settings.taxYear) ? settings.taxYear : allYears[0]);
  const [target, setTarget] = useState(settings.outputCurrency);
  const [sort, setSort] = useState<SortMode>('net-desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const rates = useRateTable();

  const outcomes = useMemo(() => compareCountries(compareRows, taxYear, target, rates.table), [compareRows, taxYear, target, rates.table]);
  const sorted = sortOutcomes(outcomes, sort);
  const best = bestOutcome(outcomes);
  const anyCustom = outcomes.some((o) => o.customAssumptions.length > 0);
  const anyEstimate = outcomes.some((o) => o.result && o.result.status !== 'verified');
  const missingRate = outcomes.some((o) => o.result && o.rate === null);
  const offline = (rates.source === 'stale-cache' || rates.source === 'bundled') && rates.table;
  const second = sortOutcomes(outcomes, 'net-desc')[1];

  const update = (id: string, next: CompareRow) => setCompareRows(compareRows.map((r) => (r.id === id ? next : r)));
  const add = () => {
    const used = new Set(compareRows.map((r) => r.country));
    const next = taxRegistry.listCountries().find((c) => !used.has(c.code)) ?? taxRegistry.listCountries()[0];
    setCompareRows([...compareRows, { id: newId(), country: next.code, amount: typicalSalary(next.currency), location: '', personal: {} }]);
  };
  const openInCalculator = (o: CompareOutcome) => {
    const d = defaultDraft(settings, o.row.country);
    loadDraft({ ...d, taxYear, amount: o.row.amount, frequency: 'monthly', location: o.row.location, personal: o.row.personal, mode: Object.keys(o.row.personal).length ? 'advanced' : d.mode, targetCurrency: target }, null);
    navigate('/calculator');
  };

  const money = (v: number | null) => (v === null ? '—' : formatMoney(v, target, prefs));

  return (
    <>
      <PageHeader title="Compare job offers" description="Each offer is taxed in its own country and currency first. Only the take-home pay is converted, so you compare what actually reaches your account." actions={<PrintButton />} />
      <Container className="space-y-6">
        <Card className="no-print p-5 sm:p-6" aria-labelledby="offers-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <h2 id="offers-heading" className="text-[15px] font-semibold text-ink">
              Offers
            </h2>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-[110px_140px]">
              <Field label="Tax year" htmlFor="cmp-year">
                <Select id="cmp-year" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Compare in" htmlFor="cmp-cur">
                <Select id="cmp-cur" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <ul aria-label="Offers to compare">
            {outcomes.map((o, i) => (
              <OfferEditor key={o.row.id} index={i} outcome={o} prefs={prefs} taxYear={taxYear} canRemove={compareRows.length > 1} onChange={(r) => update(o.row.id, r)} onRemove={() => setCompareRows(compareRows.filter((r) => r.id !== o.row.id))} />
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button onClick={add} disabled={compareRows.length >= 8}>
              <Plus size={16} /> Add offer
            </Button>
            <p className="text-xs text-faint">Up to 8 offers. Each salary is entered in that country’s currency.</p>
          </div>
        </Card>

        {(anyCustom || anyEstimate || missingRate || offline) && (
          <div className="space-y-2">
            {anyCustom && (
              <Notice tone="warn" icon={<AlertTriangle size={15} />}>
                Some offers use <strong>different personal circumstances</strong>. Part of the difference in take-home pay comes from those, not only from the tax systems.
              </Notice>
            )}
            {anyEstimate && <Notice tone="info">Offers marked “Estimate” use tax data that is not fully verified. Treat them with extra caution.</Notice>}
            {missingRate && <Notice tone="neg">Exchange rates are unavailable, so some offers cannot be converted into {target}. Tax results are still shown in local currency.</Notice>}
            {offline && rates.table && (
              <Notice tone="warn" icon={<AlertTriangle size={15} />}>
                The exchange-rate service is unreachable. Conversions use the last known rates from {formatDate(rates.table.date)}, not today’s rates.
              </Notice>
            )}
          </div>
        )}

        <section aria-labelledby="ranking-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="ranking-heading" className="text-xl font-semibold tracking-[-0.01em] text-ink">
                Take-home pay in {target}
              </h2>
              {best && best.netAnnualTarget !== null && outcomes.length > 1 && (
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-ink">{offerName(best)}</span> leaves you with the most
                  {second && second.netAnnualTarget !== null && (
                    <>
                      {' '}
                      — <span className="num font-medium text-ink">{formatMoney((best.netAnnualTarget - second.netAnnualTarget) / 12, target, prefs)}</span> a month more than {offerName(second)}
                    </>
                  )}
                  .
                </p>
              )}
              {rates.table && <p className="mt-1 text-xs text-faint">ECB reference rates of {formatDate(rates.table.date)}. Monthly = annual ÷ 12.</p>}
            </div>
            <div className="no-print w-full sm:w-56">
              <label htmlFor="cmp-sort" className="mb-1.5 block text-[13px] font-medium text-ink">
                Sort by
              </label>
              <Select id="cmp-sort" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
                <option value="net-desc">Highest take-home pay</option>
                <option value="tax-asc">Lowest effective tax rate</option>
                <option value="input">Order added</option>
              </Select>
            </div>
          </div>

          {/* Desktop and tablet: one row per offer. */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm" data-testid="compare-table">
              <thead className="bg-surface-2/60">
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Offer
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Net / month
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Net / year
                  </th>
                  <th scope="col" className="hidden px-3 py-3 text-right font-medium lg:table-cell">
                    Gross / year
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Effective tax
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    vs. best
                  </th>
                  <th scope="col" className="w-10 px-3 py-3">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => {
                  const isBest = best?.row.id === o.row.id && outcomes.length > 1;
                  const open = expanded === o.row.id;
                  return (
                    <FragmentRow key={o.row.id}>
                      <tr className={cx('border-t border-line', isBest && 'bg-pos-soft/40')}>
                        <th scope="row" className={cx('px-5 py-3.5 text-left font-medium', isBest && 'shadow-[inset_3px_0_0_var(--pos)]')}>
                          <div className="flex items-center gap-2.5">
                            <Flag code={o.row.country} />
                            <span className="text-ink">{offerName(o)}</span>
                            {o.result && o.result.status !== 'verified' && <StatusBadge status={o.result.status} />}
                          </div>
                          <p className="mt-0.5 pl-[30px] text-xs font-normal text-faint">
                            {o.result ? `${formatMoney(o.result.netMonthly, o.result.currency, prefs)} / month in ${o.result.currency}` : o.error}
                          </p>
                        </th>
                        <td className="mono px-3 py-3.5 text-right text-base font-semibold text-ink">{money(o.netAnnualTarget !== null ? o.netAnnualTarget / 12 : null)}</td>
                        <td className="mono px-3 py-3.5 text-right text-ink">{money(o.netAnnualTarget)}</td>
                        <td className="mono hidden px-3 py-3.5 text-right text-muted lg:table-cell">{money(o.grossAnnualTarget)}</td>
                        <td className="mono px-3 py-3.5 text-right text-ink">{o.result ? formatPercent(o.result.effectiveTaxRate, prefs) : '—'}</td>
                        <td className="px-3 py-3.5 text-right">
                          <Gap gap={gapToBest(o, best)} target={target} prefs={prefs} isBest={isBest} />
                        </td>
                        <td className="px-3 py-3.5">
                          <button type="button" aria-expanded={open} aria-label={`Details for ${offerName(o)}`} onClick={() => setExpanded(open ? null : o.row.id)} className="no-print inline-flex h-8 w-8 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-ink">
                            <ChevronDown size={16} className={cx('transition-transform', open && 'rotate-180')} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-surface-2/40">
                          <td colSpan={7} className="px-5 py-4">
                            <Details o={o} prefs={prefs} onOpen={() => openInCalculator(o)} />
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Phones: stacked cards, no sideways scrolling. */}
          <ol className="space-y-3 md:hidden" aria-label="Ranked offers">
            {sorted.map((o) => {
              const isBest = best?.row.id === o.row.id && outcomes.length > 1;
              const open = expanded === o.row.id;
              return (
                <li key={o.row.id}>
                  <Card as="article" className={cx('p-4', isBest && 'border-pos/40')}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
                        <Flag code={o.row.country} /> {offerName(o)}
                      </h3>
                      <Gap gap={gapToBest(o, best)} target={target} prefs={prefs} isBest={isBest} />
                    </div>
                    <p className="num mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">
                      {money(o.netAnnualTarget !== null ? o.netAnnualTarget / 12 : null)}
                      <span className="ml-1 text-sm font-medium tracking-normal text-muted">/ month</span>
                    </p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-faint">Net / year</dt>
                        <dd className="mono mt-0.5 text-ink">{money(o.netAnnualTarget)}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">Gross / year</dt>
                        <dd className="mono mt-0.5 text-ink">{money(o.grossAnnualTarget)}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">Effective tax</dt>
                        <dd className="mono mt-0.5 text-ink">{o.result ? formatPercent(o.result.effectiveTaxRate, prefs) : '—'}</dd>
                      </div>
                    </dl>
                    {o.result && o.result.status !== 'verified' && (
                      <div className="mt-3">
                        <StatusBadge status={o.result.status} />
                      </div>
                    )}
                    {o.error && <p className="mt-2 text-xs text-neg">{o.error}</p>}
                    <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : o.row.id)} className="no-print mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                      {open ? 'Hide details' : 'Tax details'} <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="mt-3 border-t border-line pt-3">
                        <Details o={o} prefs={prefs} onOpen={() => openInCalculator(o)} />
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>
      </Container>
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
