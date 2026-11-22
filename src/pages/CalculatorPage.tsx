import { Calculator as CalcIcon, Pencil, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PrintButton, SaveControl, ShareButton } from '../components/calculator/Actions';
import { OutputPanel } from '../components/calculator/OutputPanel';
import { AdvancedDetails, Breakdown, ConversionDetails, PeriodTable, ResultSummary, SourcesCard } from '../components/calculator/Results';
import { SalaryForm } from '../components/calculator/SalaryForm';
import { DISCLAIMER } from '../components/common/disclaimer';
import { Button, Card, EmptyState, Notice } from '../components/common/ui';
import { Container, PageHeader } from '../components/layout/Layout';
import { taxRegistry } from '../data/taxData';
import { useCalculation, useCountryForm } from '../hooks/useCalculation';
import { useRate } from '../hooks/useRate';
import { href, useRouter } from '../router';
import { queryToScenario, scenarioToQuery } from '../services/scenario';
import { savedOps } from '../services/storage/storage';
import type { CalcDraft } from '../services/storage/models';
import type { CalcResult } from '../engine/types';
import { useApp, usePrefs } from '../state/AppState';

export function defaultSaveName(countryName: string, amount: number, currency: string, frequency: string): string {
  const short = amount >= 10000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount));
  return `${countryName} — ${short} ${currency}${frequency === 'monthly' ? '/mo' : frequency === 'annual' ? '/yr' : '/h'}`;
}

export function snapshotOf(result: CalcResult, draft: CalcDraft, rate: number | null, rateDate: string | null) {
  return {
    currency: result.currency,
    grossAnnual: result.grossAnnual,
    netAnnual: result.netAnnual,
    effectiveTaxRate: result.effectiveTaxRate,
    datasetVersion: result.datasetVersion,
    targetCurrency: draft.targetCurrency,
    convertedNetMonthly: rate !== null ? result.netMonthly * rate : null,
    rateDate,
  };
}

export function CalculatorPage() {
  const { draft, patchDraft, loadDraft, saved, setSaved, editingId, setEditingId } = useApp();
  const { search } = useRouter();
  const prefs = usePrefs();
  const form = useCountryForm(draft.country, draft.taxYear);
  const calc = useCalculation(draft);
  const country = taxRegistry.listCountries().find((c) => c.code === draft.country);
  const from = country?.currency ?? 'EUR';
  const rate = useRate(from, draft.targetCurrency, { auto: draft.autoConvert, manualRate: draft.manualRate, date: draft.rateDate });
  const result = calc.result;
  const meta = result ? taxRegistry.getDataset(result.country, result.taxYear, result.datasetVersion).meta : null;
  const conversion = { quote: rate.quote, target: draft.targetCurrency };
  const editing = editingId ? saved.find((s) => s.id === editingId) : undefined;
  const query = scenarioToQuery(draft);
  const lastQuery = useRef<string | null>(null);
  const rejectedRef = useRef<string[]>([]);

  // Opening a shared link: validate every parameter, then recalculate with the real engine.
  useEffect(() => {
    const q = search.replace(/^\?/, '');
    if (!q || q === lastQuery.current) return;
    const parsed = queryToScenario(q, draft);
    if (parsed) {
      rejectedRef.current = parsed.rejected;
      loadDraft(parsed.draft, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Keep the address bar shareable as inputs change (no history entries per keystroke).
  useEffect(() => {
    lastQuery.current = query;
    const target = href(`/calculator?${query}`);
    if (window.location.pathname + window.location.search !== target) window.history.replaceState(null, '', target);
  }, [query]);

  const save = (name: string) => {
    if (!result) return;
    setSaved(savedOps.add(saved, name, draft, snapshotOf(result, draft, rate.quote?.rate ?? null, rate.quote?.date ?? null)));
  };
  const update = () => {
    if (!result || !editing) return;
    const now = new Date().toISOString();
    setSaved(saved.map((s) => (s.id === editing.id ? { ...s, draft, updatedAt: now, snapshot: snapshotOf(result, draft, rate.quote?.rate ?? null, rate.quote?.date ?? null) } : s)));
    setEditingId(null);
  };

  return (
    <>
      <PageHeader title="Salary calculator" description="Enter a salary to see what you take home after income tax and social contributions, and what that is worth in your currency." />
      <Container>
        {editing && (
          <div className="no-print mb-6 flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2 text-sm text-ink">
              <Pencil size={15} className="text-accent" /> Editing saved calculation <strong className="font-semibold">“{editing.name}”</strong>
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={update} disabled={!result}>
                Update saved
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Stop editing">
                <X size={14} /> Done
              </Button>
            </div>
          </div>
        )}
        {rejectedRef.current.length > 0 && (
          <div className="mb-6">
            <Notice tone="info">Some values in the link were not valid and were ignored: {rejectedRef.current.join(', ')}.</Notice>
          </div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-8">
          <div className="no-print space-y-6">
            <Card className="p-5 sm:p-6" aria-labelledby="inputs-heading">
              <h2 id="inputs-heading" className="sr-only">
                Salary details
              </h2>
              <SalaryForm draft={draft} patch={patchDraft} form={form} prefs={prefs} paymentsPerYear={calc.paymentsPerYear} />
            </Card>
            <Card className="p-5 sm:p-6" aria-labelledby="currency-heading">
              <h2 id="currency-heading" className="mb-4 text-[15px] font-semibold text-ink">
                Currency
              </h2>
              <OutputPanel draft={draft} patch={patchDraft} from={from} rate={rate} prefs={prefs} />
            </Card>
          </div>

          <div className="min-w-0 space-y-6" aria-live="polite" aria-atomic="false">
            {calc.error && <Notice tone="neg">{calc.error}</Notice>}
            {form.error && <Notice tone="neg">{form.error}</Notice>}
            {!result && !calc.error && (
              <Card>
                <EmptyState icon={<CalcIcon size={20} />} title={draft.direction === 'net-to-gross' ? 'Enter the take-home pay you want' : 'Enter a gross salary'}>
                  Your take-home pay, the tax breakdown and the converted amount appear here as you type.
                </EmptyState>
              </Card>
            )}
            {result && meta && (
              <>
                <ResultSummary
                  result={result}
                  conversion={conversion}
                  prefs={prefs}
                  draft={draft}
                  paymentsPerYear={calc.paymentsPerYear}
                  meta={meta}
                  actions={
                    <>
                      <ShareButton path={`/calculator?${query}`} title="NetWorth salary calculation" text={`Take-home pay in ${country?.name ?? draft.country}`} />
                      <SaveControl onSave={save} suggested={defaultSaveName(country?.name ?? draft.country, draft.amount, from, draft.frequency)} label={editing ? 'Save as new' : 'Save'} />
                      <PrintButton />
                    </>
                  }
                />
                <Breakdown result={result} prefs={prefs} />
                <div className="grid gap-6 2xl:grid-cols-2">
                  <PeriodTable result={result} conversion={conversion} prefs={prefs} />
                  <ConversionDetails result={result} conversion={conversion} prefs={prefs} />
                </div>
                <AdvancedDetails result={result} prefs={prefs} paymentsPerYear={calc.paymentsPerYear} />
                <SourcesCard result={result} meta={meta} />
                <p className="px-1 text-xs leading-relaxed text-faint">{DISCLAIMER}</p>
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
