import { BookmarkPlus, Check, Calculator as CalcIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { DISCLAIMER } from '../components/common/disclaimer';
import { Button, Card, EmptyState, Notice, TextInput } from '../components/common/ui';
import { OutputPanel } from '../components/calculator/OutputPanel';
import { Breakdown, ConversionDetails, KpiRow, NotesCard, OverviewTable, ResultHero } from '../components/calculator/Results';
import { SalaryForm } from '../components/calculator/SalaryForm';
import { taxRegistry } from '../data/taxData';
import { useCalculation, useCountryForm } from '../hooks/useCalculation';
import { useRate } from '../hooks/useRate';
import { savedOps } from '../services/storage/storage';
import { useApp } from '../state/AppState';
import { formatNumber } from '../utils/format';

export function defaultSaveName(countryName: string, amount: number, currency: string, frequency: string): string {
  const short = amount >= 10000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount));
  return `${countryName} — ${short} ${currency}${frequency === 'monthly' ? '/mo' : frequency === 'annual' ? '/yr' : '/h'}`;
}

function SaveControl({ onSave, suggested }: { onSave: (name: string) => void; suggested: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => {
          setName(suggested);
          setOpen(true);
          setDone(false);
        }}
      >
        {done ? <Check size={14} className="text-pos" /> : <BookmarkPlus size={14} />}
        {done ? 'Saved' : 'Save calculation'}
      </Button>
    );
  }
  return (
    <form
      className="flex w-full max-w-xs items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
        setOpen(false);
        setDone(true);
      }}
    >
      <label htmlFor="save-name" className="sr-only">
        Name for this calculation
      </label>
      <TextInput id="save-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[13px]" maxLength={120} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
      <Button size="sm" variant="primary" type="submit">
        Save
      </Button>
    </form>
  );
}

export function CalculatorPage() {
  const { draft, patchDraft, settings, saved, setSaved, navigate } = useApp();
  const form = useCountryForm(draft.country, draft.taxYear);
  const calc = useCalculation(draft);
  const country = taxRegistry.listCountries().find((c) => c.code === draft.country);
  const from = country?.currency ?? 'EUR';
  const rate = useRate(from, draft.targetCurrency, { auto: draft.autoConvert, manualRate: draft.manualRate, date: draft.rateDate });
  const prefs = { numberLocale: settings.numberLocale, showDecimals: settings.showDecimals };
  const resultsRef = useRef<HTMLDivElement>(null);
  const result = calc.result;
  const meta = result ? taxRegistry.getDataset(result.country, result.taxYear, result.datasetVersion).meta : null;
  const conversion = { quote: rate.quote, target: draft.targetCurrency };

  const save = (name: string) => {
    if (!result) return;
    setSaved(
      savedOps.add(saved, name, draft, {
        currency: result.currency,
        grossAnnual: result.grossAnnual,
        netAnnual: result.netAnnual,
        effectiveTaxRate: result.effectiveTaxRate,
        datasetVersion: result.datasetVersion,
        targetCurrency: draft.targetCurrency,
        convertedNetMonthly: rate.quote ? result.netMonthly * rate.quote.rate : null,
        rateDate: rate.quote?.date ?? null,
      }),
    );
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="salary-heading" className="p-5 sm:p-7">
            <h2 id="salary-heading" className="mb-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
              Salary information
            </h2>
            <SalaryForm draft={draft} patch={patchDraft} form={form} prefs={prefs} paymentsPerYear={calc.paymentsPerYear} onCalculate={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
          </section>
          <section aria-labelledby="output-heading" className="border-t border-line bg-surface-2/50 p-5 sm:p-7 lg:border-l lg:border-t-0">
            <h2 id="output-heading" className="mb-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
              Output preferences
            </h2>
            <OutputPanel draft={draft} patch={patchDraft} from={from} rate={rate} prefs={prefs} />
          </section>
        </div>
      </Card>

      <div ref={resultsRef} className="scroll-mt-20 space-y-6" aria-live="polite">
        {calc.error && <Notice tone="neg">{calc.error}</Notice>}
        {!result && !calc.error && (
          <EmptyState icon={<CalcIcon size={20} />} title="Enter a gross salary">
            Your take-home pay, tax breakdown and converted amount will appear here.
          </EmptyState>
        )}
        {result && meta && (
          <>
            <ResultHero
              result={result}
              conversion={conversion}
              prefs={prefs}
              amount={draft.amount}
              frequency={draft.frequency}
              meta={meta}
              paymentsPerYear={calc.paymentsPerYear}
              actions={<SaveControl onSave={save} suggested={defaultSaveName(country?.name ?? draft.country, draft.amount, from, draft.frequency)} />}
            />
            <KpiRow result={result} conversion={conversion} prefs={prefs} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <Breakdown result={result} prefs={prefs} />
              <div className="space-y-6">
                <ConversionDetails result={result} conversion={conversion} prefs={prefs} />
                <OverviewTable result={result} conversion={conversion} prefs={prefs} />
              </div>
            </div>
            <NotesCard result={result} meta={meta} onMethodology={() => navigate('methodology')} />
            <p className="px-1 text-xs leading-relaxed text-faint">
              {DISCLAIMER} Marginal rate: share of the next {formatNumber(Math.max(result.grossAnnual * 0.01, 100), prefs)} {result.currency} of gross pay lost to tax and contributions.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
