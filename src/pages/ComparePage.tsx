import { AlertTriangle, ArrowDownUp, ChevronDown, Plus, Trophy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bestOutcome, compareCountries, sortOutcomes, type CompareOutcome, type SortMode } from '../calculations/compare';
import { AmountInput } from '../components/calculator/SalaryForm';
import { CountryPicker } from '../components/calculator/CountryPicker';
import { PersonalFields } from '../components/calculator/PersonalFields';
import { STATUS_COPY } from '../components/calculator/Results';
import { Flag } from '../components/common/Flag';
import { Badge, Button, Card, cx, Field, Notice, Segmented, Select } from '../components/common/ui';
import { taxRegistry } from '../data/taxData';
import { useRateTable } from '../hooks/useRateTable';
import { CURRENCY_CODES } from '../services/currency/currencies';
import type { CompareRow } from '../services/storage/models';
import { newId } from '../services/storage/storage';
import { useApp } from '../state/AppState';
import { formatDate, formatMoney, formatPercent, type FormatPrefs } from '../utils/format';

function RowEditor({ outcome, onChange, onRemove, prefs, taxYear, canRemove }: { outcome: CompareOutcome; onChange: (r: CompareRow) => void; onRemove: () => void; prefs: FormatPrefs; taxYear: number; canRemove: boolean }) {
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
  return (
    <li className="rounded-xl border border-line bg-surface-2/50 p-3.5">
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <Field label="Country">
          <CountryPicker countries={countries} value={row.country} onChange={(country) => onChange({ ...row, country, location: '', personal: {} })} />
        </Field>
        <Field label={`Gross monthly salary${outcome.paymentsPerYear !== 12 ? ` (× ${outcome.paymentsPerYear})` : ''}`}>
          <AmountInput id={`amt-${row.id}`} label={`Gross monthly salary for ${info?.name ?? row.country}`} value={row.amount} onChange={(amount) => onChange({ ...row, amount })} currency={info?.currency ?? ''} prefs={prefs} />
        </Field>
        <div className="flex gap-1.5 pb-0.5">
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            Assumptions <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Remove ${info?.name ?? row.country}`} onClick={onRemove} disabled={!canRemove}>
            <X size={15} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {locations && (
            <Field label={locations.label}>
              <Select value={row.location || locations.defaultId} onChange={(e) => onChange({ ...row, location: e.target.value })}>
                {locations.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.hint ? ` — ${o.hint}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <PersonalFields fields={fields} values={row.personal} mode="advanced" onChange={(key, value) => onChange({ ...row, personal: { ...row.personal, [key]: value } })} />
        </div>
      )}
    </li>
  );
}

export function ComparePage() {
  const { compareRows, setCompareRows, settings } = useApp();
  const prefs = { numberLocale: settings.numberLocale, showDecimals: settings.showDecimals };
  const allYears = useMemo(() => [...new Set(taxRegistry.listCountries().flatMap((c) => c.years))].sort((a, b) => b - a), []);
  const [taxYear, setTaxYear] = useState(allYears.includes(settings.taxYear) ? settings.taxYear : allYears[0]);
  const [target, setTarget] = useState(settings.outputCurrency);
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [sort, setSort] = useState<SortMode>('net-desc');
  const rates = useRateTable();

  const outcomes = useMemo(() => compareCountries(compareRows, taxYear, target, rates.table), [compareRows, taxYear, target, rates.table]);
  const sorted = sortOutcomes(outcomes, sort);
  const best = bestOutcome(outcomes);
  const d = period === 'month' ? 12 : 1;
  const anyCustom = outcomes.some((o) => o.customAssumptions.length > 0);
  const anyEstimate = outcomes.some((o) => o.result && o.result.status !== 'verified');
  const missingRate = outcomes.some((o) => o.result && o.rate === null);

  const update = (id: string, next: CompareRow) => setCompareRows(compareRows.map((r) => (r.id === id ? next : r)));
  const add = () => {
    const used = new Set(compareRows.map((r) => r.country));
    const next = taxRegistry.listCountries().find((c) => !used.has(c.code)) ?? taxRegistry.listCountries()[0];
    setCompareRows([...compareRows, { id: newId(), country: next.code, amount: next.currency === 'EUR' ? 5000 : 40000, location: '', personal: {} }]);
  };

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-7">
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
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
          <Field label="Show figures">
            <Segmented label="Comparison period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual' }]} />
          </Field>
        </div>
        <ul className="space-y-3" aria-label="Countries to compare">
          {outcomes.map((o) => (
            <RowEditor key={o.row.id} outcome={o} prefs={prefs} taxYear={taxYear} canRemove={compareRows.length > 1} onChange={(r) => update(o.row.id, r)} onRemove={() => setCompareRows(compareRows.filter((r) => r.id !== o.row.id))} />
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button onClick={add} disabled={compareRows.length >= 8}>
            <Plus size={16} /> Add country
          </Button>
          <p className="text-xs text-faint">Each salary is entered in that country's currency and taxed there before conversion.</p>
        </div>
      </Card>

      {(anyCustom || anyEstimate || missingRate || rates.source === 'stale-cache' || rates.source === 'bundled') && (
        <div className="space-y-2">
          {anyCustom && (
            <Notice tone="warn" icon={<AlertTriangle size={15} />}>
              These rows use <strong>different personal tax assumptions</strong> (see the tags in the table). Differences in net pay partly reflect those assumptions, not only the tax systems.
            </Notice>
          )}
          {anyEstimate && <Notice tone="info">Some countries are marked as estimates — their tax data is not fully verified. Treat their figures with extra caution.</Notice>}
          {missingRate && <Notice tone="neg">Exchange rates are unavailable, so some rows cannot be converted into {target}. Their figures are shown in local currency only.</Notice>}
          {(rates.source === 'stale-cache' || rates.source === 'bundled') && rates.table && (
            <Notice tone="warn" icon={<AlertTriangle size={15} />}>
              The exchange-rate service is unreachable. Conversions use the last known rates from {formatDate(rates.table.date)}.
            </Notice>
          )}
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Comparison · {period === 'month' ? 'per month' : 'per year'} · {target}</h2>
            {rates.table && <p className="mt-1 text-xs text-faint">ECB reference rates of {formatDate(rates.table.date)}. Monthly = annual ÷ 12.</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setSort(sort === 'net-desc' ? 'net-asc' : sort === 'net-asc' ? 'input' : 'net-desc')}>
            <ArrowDownUp size={14} />
            {sort === 'net-desc' ? 'Highest net first' : sort === 'net-asc' ? 'Lowest net first' : 'Input order'}
          </Button>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] text-sm" data-testid="compare-table">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="py-2.5 font-medium">
                  Country
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Gross ({target} equiv.)
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Net ({target})
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Net (local)
                </th>
                <th scope="col" className="py-2.5 text-right font-medium">
                  Effective tax
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const info = taxRegistry.listCountries().find((c) => c.code === o.row.country);
                const isBest = best?.row.id === o.row.id && outcomes.length > 1;
                return (
                  <tr key={o.row.id} className={cx('border-b border-line last:border-b-0', isBest && 'bg-[color-mix(in_srgb,var(--pos)_6%,transparent)]')}>
                    <th scope="row" className="py-3 pr-3 text-left font-medium">
                      <div className="flex items-center gap-2.5">
                        <Flag code={o.row.country} />
                        <span className="text-ink">{info?.name ?? o.row.country}</span>
                        {isBest && (
                          <Badge tone="pos">
                            <Trophy size={11} /> Highest net
                          </Badge>
                        )}
                        {o.result && o.result.status !== 'verified' && <Badge tone={STATUS_COPY[o.result.status].tone}>{STATUS_COPY[o.result.status].label}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 pl-[32px]">
                        {o.customAssumptions.length === 0 ? (
                          <span className="text-[11px] font-normal text-faint">Standard assumptions</span>
                        ) : (
                          o.customAssumptions.map((a) => (
                            <span key={a} className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-normal text-warn">
                              {a}
                            </span>
                          ))
                        )}
                      </div>
                      {o.error && <p className="mt-1 pl-[32px] text-xs font-normal text-neg">{o.error}</p>}
                    </th>
                    <td className="num py-3 text-right text-muted">{o.grossAnnualTarget !== null ? formatMoney(o.grossAnnualTarget / d, target, prefs) : '—'}</td>
                    <td className="num py-3 text-right font-semibold text-ink">{o.netAnnualTarget !== null ? formatMoney(o.netAnnualTarget / d, target, prefs) : '—'}</td>
                    <td className="num py-3 text-right text-muted">{o.result ? formatMoney(o.result.netAnnual / d, o.result.currency, prefs) : '—'}</td>
                    <td className="num py-3 text-right text-ink">{o.result ? formatPercent(o.result.effectiveTaxRate, prefs) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {best && outcomes.length > 1 && best.netAnnualTarget !== null && (
          <p className="mt-4 text-sm text-muted">
            <span className="font-semibold text-ink">{taxRegistry.listCountries().find((c) => c.code === best.row.country)?.name}</span> leaves you with the most:{' '}
            <span className="num font-semibold text-pos">{formatMoney(best.netAnnualTarget / d, target, prefs)}</span> {period === 'month' ? 'per month' : 'per year'} after tax.
          </p>
        )}
      </Card>
    </div>
  );
}
