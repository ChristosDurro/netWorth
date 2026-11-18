import { ArrowDownToLine, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { taxRegistry } from '../../data/taxData';
import type { CountryForm } from '../../hooks/useCalculation';
import type { CalcDraft, Frequency } from '../../services/storage/models';
import { formatNumber, type FormatPrefs } from '../../utils/format';
import { fromAnnual, parseAmount, PAID_WEEKS_PER_YEAR, toAnnual } from '../../utils/salary';
import { Button, Field, Segmented, Select, TextInput } from '../common/ui';
import { CountryPicker } from './CountryPicker';
import { PersonalFields } from './PersonalFields';

/** Text field that formats thousands while keeping what the user types. */
export function AmountInput({ id, value, onChange, currency, prefs, label }: { id: string; value: number; onChange: (n: number) => void; currency: string; prefs: FormatPrefs; label: string }) {
  const display = (n: number) => (n > 0 ? formatNumber(n, prefs, Number.isInteger(n) ? 0 : 2) : '');
  const [text, setText] = useState(() => display(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, prefs.numberLocale]);
  return (
    <div className="relative">
      <TextInput
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder="0"
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(display(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseAmount(e.target.value));
        }}
        className="num h-12 pr-16 text-lg font-semibold"
      />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-faint">{currency}</span>
    </div>
  );
}

const FREQ_LABEL: Record<Frequency, string> = { monthly: 'Monthly', annual: 'Annual', hourly: 'Hourly' };

export function SalaryForm({ draft, patch, form, prefs, paymentsPerYear, onCalculate }: { draft: CalcDraft; patch: (p: Partial<CalcDraft>) => void; form: CountryForm; prefs: FormatPrefs; paymentsPerYear: number; onCalculate: () => void }) {
  const ids = useId();
  const countries = taxRegistry.listCountries();
  const country = countries.find((c) => c.code === draft.country);
  const currency = country?.currency ?? '';

  const changeCountry = (code: string) => {
    const years = taxRegistry.getSupportedTaxYears(code);
    patch({ country: code, location: '', personal: {}, taxYear: years.includes(draft.taxYear) ? draft.taxYear : years[0] });
  };

  const changeFrequency = (f: Frequency) => {
    if (f === draft.frequency) return;
    const annual = toAnnual(draft.amount, draft.frequency, draft.hoursPerWeek, paymentsPerYear);
    const next = fromAnnual(annual, f, draft.hoursPerWeek, paymentsPerYear);
    patch({ frequency: f, amount: f === 'hourly' ? Math.round(next * 100) / 100 : Math.round(next) });
  };

  const annual = toAnnual(draft.amount, draft.frequency, draft.hoursPerWeek, paymentsPerYear);
  const equivalence =
    annual > 0
      ? draft.frequency === 'annual'
        ? `≈ ${formatNumber(annual / 12, prefs)} ${currency} per month (annual ÷ 12)`
        : draft.frequency === 'monthly'
          ? `= ${formatNumber(annual, prefs)} ${currency} per year (${paymentsPerYear} payments)`
          : `= ${formatNumber(annual, prefs)} ${currency} per year (${draft.hoursPerWeek} h × ${PAID_WEEKS_PER_YEAR} paid weeks)`
      : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Field label="Employment country" htmlFor={`${ids}-country`}>
          <CountryPicker id={`${ids}-country`} countries={countries} value={draft.country} onChange={changeCountry} />
        </Field>
        <Field label="Tax year" htmlFor={`${ids}-year`}>
          <Select id={`${ids}-year`} value={draft.taxYear} onChange={(e) => patch({ taxYear: Number(e.target.value) })}>
            {form.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={`${ids}-amount`} className="text-[13px] font-medium text-muted">
            Gross salary
          </label>
          <div className="w-[230px]">
            <Segmented size="sm" label="Salary frequency" value={draft.frequency} onChange={changeFrequency} options={(['monthly', 'annual', 'hourly'] as Frequency[]).map((f) => ({ value: f, label: FREQ_LABEL[f] }))} />
          </div>
        </div>
        <AmountInput id={`${ids}-amount`} label={`Gross ${draft.frequency} salary in ${currency}`} value={draft.amount} onChange={(amount) => patch({ amount })} currency={currency} prefs={prefs} />
        {equivalence && <p className="num mt-1.5 text-xs text-faint">{equivalence}</p>}
      </div>

      {draft.frequency === 'hourly' && (
        <Field label="Working hours per week" htmlFor={`${ids}-hours`} help={`Annual pay = hourly rate × hours × ${PAID_WEEKS_PER_YEAR} paid weeks (paid holidays included).`}>
          <TextInput
            id={`${ids}-hours`}
            type="number"
            min={1}
            max={80}
            step={0.5}
            value={draft.hoursPerWeek}
            onChange={(e) => {
              const h = e.target.valueAsNumber;
              if (Number.isFinite(h) && h > 0) patch({ hoursPerWeek: Math.min(80, h) });
            }}
          />
        </Field>
      )}

      {form.locations && (
        <Field label={form.locations.label} htmlFor={`${ids}-loc`} help={form.locations.options.length > 3 ? 'Local tax rates differ by location.' : undefined}>
          <Select id={`${ids}-loc`} value={draft.location || form.locations.defaultId} onChange={(e) => patch({ location: e.target.value })}>
            {form.locations.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.hint ? ` — ${o.hint}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="rounded-xl border border-line bg-surface-2/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <SlidersHorizontal size={15} className="text-muted" />
            Personal tax information
          </div>
          <div className="w-[200px]">
            <Segmented size="sm" label="Calculation mode" value={draft.mode} onChange={(mode) => patch({ mode })} options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
          </div>
        </div>
        <div className="mt-4">
          {form.fields.some((f) => draft.mode === 'advanced' || !f.advanced) ? (
            <PersonalFields fields={form.fields} values={draft.personal} mode={draft.mode} onChange={(key, value) => patch({ personal: { ...draft.personal, [key]: value } })} />
          ) : (
            <p className="text-[13px] leading-relaxed text-faint">
              {form.fields.length > 0 ? (
                <>
                  Standard assumptions are used for: <span className="text-muted">{form.fields.map((f) => f.label).join(' · ')}</span>. Switch to Advanced to enter your own circumstances.
                </>
              ) : (
                'No personal circumstances change the calculation for this country.'
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onCalculate}>
          <ArrowDownToLine size={16} />
          Calculate
        </Button>
      </div>
    </div>
  );
}
