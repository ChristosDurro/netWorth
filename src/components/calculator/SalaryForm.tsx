import { useEffect, useId, useState } from 'react';
import { taxRegistry } from '../../data/taxData';
import { describeCustomAssumptions } from '../../calculations/compare';
import type { CountryForm } from '../../hooks/useCalculation';
import type { CalcDraft, Frequency } from '../../services/storage/models';
import { typicalSalary } from '../../state/AppState';
import { formatNumber, type FormatPrefs } from '../../utils/format';
import { fromAnnual, parseAmount, PAID_WEEKS_PER_YEAR, toAnnual } from '../../utils/salary';
import { Field, Segmented, Select, TextInput, cx } from '../common/ui';
import { CountryPicker } from './CountryPicker';
import { PersonalFields } from './PersonalFields';

export const MAX_AMOUNT = 100_000_000;

/** Text field that formats thousands while keeping exactly what the user types. */
export function AmountInput({ id, value, onChange, currency, prefs, label, size = 'lg', invalid, describedBy }: { id: string; value: number; onChange: (n: number) => void; currency: string; prefs: FormatPrefs; label: string; size?: 'lg' | 'md'; invalid?: boolean; describedBy?: string }) {
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
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        placeholder="0"
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          setText(display(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseAmount(e.target.value));
        }}
        className={cx('num pr-16 font-semibold tracking-[-0.01em]', size === 'lg' ? 'h-14 text-2xl sm:h-14 sm:text-2xl' : 'text-base')}
      />
      <span className="mono pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-faint">{currency}</span>
    </div>
  );
}

const FREQ_LABEL: Record<Frequency, string> = { monthly: 'Monthly', annual: 'Annual', hourly: 'Hourly' };

export function amountError(amount: number): string | null {
  if (!(amount > 0)) return 'Enter an amount greater than zero.';
  if (amount > MAX_AMOUNT) return 'That amount is too large to calculate.';
  return null;
}

export function SalaryForm({ draft, patch, form, prefs, paymentsPerYear }: { draft: CalcDraft; patch: (p: Partial<CalcDraft>) => void; form: CountryForm; prefs: FormatPrefs; paymentsPerYear: number }) {
  const ids = useId();
  const countries = taxRegistry.listCountries();
  const country = countries.find((c) => c.code === draft.country);
  const currency = country?.currency ?? '';
  const reverse = draft.direction === 'net-to-gross';
  const [touched, setTouched] = useState(false);
  const error = touched || draft.amount > 0 ? amountError(draft.amount) : null;

  const changeCountry = (code: string) => {
    const years = taxRegistry.getSupportedTaxYears(code);
    const next = countries.find((c) => c.code === code);
    const sameCurrency = next?.currency === currency;
    patch({
      country: code,
      location: '',
      personal: {},
      taxYear: years.includes(draft.taxYear) ? draft.taxYear : years[years.length - 1],
      // Keep the amount when the currency stays the same; otherwise start from a sensible figure in the new currency.
      amount: sameCurrency ? draft.amount : draft.frequency === 'annual' ? typicalSalary(next?.currency ?? 'EUR') * 12 : draft.frequency === 'hourly' ? Math.round(typicalSalary(next?.currency ?? 'EUR') / 160) : typicalSalary(next?.currency ?? 'EUR'),
    });
  };

  const changeFrequency = (f: Frequency) => {
    if (f === draft.frequency) return;
    if (reverse) {
      patch({ frequency: f, amount: Math.round(f === 'annual' ? draft.amount * 12 : draft.amount / 12) });
      return;
    }
    const annual = toAnnual(draft.amount, draft.frequency, draft.hoursPerWeek, paymentsPerYear);
    const next = fromAnnual(annual, f, draft.hoursPerWeek, paymentsPerYear);
    patch({ frequency: f, amount: f === 'hourly' ? Math.round(next * 100) / 100 : Math.round(next) });
  };

  const annual = reverse ? (draft.frequency === 'annual' ? draft.amount : draft.amount * 12) : toAnnual(draft.amount, draft.frequency, draft.hoursPerWeek, paymentsPerYear);
  const equivalence =
    annual > 0 && !error
      ? reverse
        ? draft.frequency === 'annual'
          ? `≈ ${formatNumber(annual / 12, prefs)} ${currency} take-home per month`
          : `= ${formatNumber(annual, prefs)} ${currency} take-home per year`
        : draft.frequency === 'annual'
          ? `≈ ${formatNumber(annual / 12, prefs)} ${currency} per month before tax`
          : draft.frequency === 'monthly'
            ? `= ${formatNumber(annual, prefs)} ${currency} per year (${paymentsPerYear} payments)`
            : `= ${formatNumber(annual, prefs)} ${currency} per year (${draft.hoursPerWeek} h × ${PAID_WEEKS_PER_YEAR} paid weeks)`
      : null;

  const frequencies: Frequency[] = reverse ? ['monthly', 'annual'] : ['monthly', 'annual', 'hourly'];
  const amountLabel = `${reverse ? 'Desired take-home' : 'Gross'} ${draft.frequency} ${reverse ? 'pay' : 'salary'} in ${currency}`;
  const basicFields = form.fields.filter((f) => !f.advanced);
  const advancedFields = form.fields.filter((f) => f.advanced);
  const custom = describeCustomAssumptions(advancedFields, draft.personal);
  const setPersonal = (key: string, value: string | number | boolean) => patch({ personal: { ...draft.personal, [key]: value } });

  return (
    <div className="space-y-6">
      <Segmented
        label="What do you know?"
        value={draft.direction}
        onChange={(direction) => patch({ direction, frequency: direction === 'net-to-gross' && draft.frequency === 'hourly' ? 'monthly' : draft.frequency })}
        options={[
          { value: 'gross-to-net', label: 'Gross → take-home' },
          { value: 'net-to-gross', label: 'Take-home → gross' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="Country of employment" htmlFor={`${ids}-country`}>
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
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${ids}-amount`} className="text-[13px] font-medium text-ink">
            {reverse ? 'Take-home pay you want' : 'Gross salary'}
          </label>
          <div className={reverse ? 'w-[168px]' : 'w-[228px]'}>
            <Segmented size="sm" label="Salary frequency" value={draft.frequency} onChange={changeFrequency} options={frequencies.map((f) => ({ value: f, label: FREQ_LABEL[f] }))} />
          </div>
        </div>
        <div onBlur={() => setTouched(true)}>
          <AmountInput id={`${ids}-amount`} label={amountLabel} value={draft.amount} onChange={(amount) => patch({ amount })} currency={currency} prefs={prefs} invalid={!!error} describedBy={`${ids}-amount-help`} />
        </div>
        <p id={`${ids}-amount-help`} className={cx('num mt-1.5 text-xs', error ? 'font-medium text-neg' : 'text-faint')} role={error ? 'alert' : undefined}>
          {error ?? equivalence ?? ' '}
        </p>
      </div>

      {draft.frequency === 'hourly' && !reverse && (
        <Field label="Working hours per week" htmlFor={`${ids}-hours`} help={`Annual pay = hourly rate × hours × ${PAID_WEEKS_PER_YEAR} paid weeks (paid holidays included).`}>
          <TextInput
            id={`${ids}-hours`}
            type="number"
            inputMode="decimal"
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
        <Field label={form.locations.label} htmlFor={`${ids}-loc`} tip={form.locations.options.length > 3 ? 'Local income tax differs between municipalities, so where you live changes your take-home pay.' : undefined}>
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

      {basicFields.length > 0 && <PersonalFields fields={basicFields} values={draft.personal} mode="advanced" onChange={setPersonal} />}

      {advancedFields.length > 0 && (
        <details className="group rounded-lg border border-line" open={draft.mode === 'advanced'} onToggle={(e) => patch({ mode: (e.currentTarget as HTMLDetailsElement).open ? 'advanced' : 'simple' })}>
          <summary className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-4 py-3.5 hover:bg-surface-2/60">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{basicFields.length ? 'More circumstances' : 'Your circumstances'}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                {draft.mode === 'advanced'
                  ? 'Closing this section returns these options to the standard assumptions.'
                  : `Using standard assumptions for: ${advancedFields.map((f) => f.label).join(' · ')}.`}
              </span>
            </span>
            <span className="mt-0.5 shrink-0 text-xs font-medium text-accent group-open:hidden">Adjust</span>
            <span className="mt-0.5 hidden shrink-0 text-xs font-medium text-muted group-open:inline">Close</span>
          </summary>
          <div className="border-t border-line px-4 py-4">
            <PersonalFields fields={advancedFields} values={draft.personal} mode="advanced" onChange={setPersonal} />
            {custom.length > 0 && <p className="mt-4 text-xs text-faint">Changed from standard: {custom.join(' · ')}</p>}
          </div>
        </details>
      )}
    </div>
  );
}
