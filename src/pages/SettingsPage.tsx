import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CountryPicker } from '../components/calculator/CountryPicker';
import { Button, Card, Field, Notice, Row, SectionTitle, Segmented, Select, Switch } from '../components/common/ui';
import { Container, PageHeader } from '../components/layout/Layout';
import { taxRegistry } from '../data/taxData';
import { CURRENCY_CODES, CURRENCY_NAMES } from '../services/currency/currencies';
import { currencyService } from '../services/currency/currencyService';
import type { Frequency, Settings } from '../services/storage/models';
import { useApp } from '../state/AppState';
import { formatDate, formatDateTime, formatMoney } from '../utils/format';

/** Personal preferences only. Tax rules, sources and datasets are not editable here — they are maintained offline and reviewed. */
export function SettingsPage() {
  const { settings, updateSettings, resetSettings, resetAllData } = useApp();
  const [cache, setCache] = useState(() => currencyService.getCachedTable());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const years = [...new Set(taxRegistry.listCountries().flatMap((c) => c.years))].sort((a, b) => b - a);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await currencyService.getLatestTable(true);
      setCache(currencyService.getCachedTable());
      setStatus(r.source === 'live' ? `Updated: ECB rates of ${formatDate(r.table.date)}.` : `The rate service could not be reached (${r.error ?? 'unknown error'}). Keeping the last known rates.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const wipe = () => {
    currencyService.clearCache();
    resetAllData();
    setCache(null);
    setConfirmWipe(false);
    setStatus('All NetWorth data has been removed from this browser.');
  };

  return (
    <>
      <PageHeader title="Settings" description="Preferences for new calculations and how numbers are shown. They are stored only in this browser." />
      <Container className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionTitle hint="Used whenever you start a new calculation.">Calculation defaults</SectionTitle>
          <div className="space-y-5">
            <Field label="Default country" htmlFor="set-country">
              <CountryPicker id="set-country" label="Default country" countries={taxRegistry.listCountries()} value={settings.country} onChange={(country) => updateSettings({ country })} />
            </Field>
            <Field label="Default currency" htmlFor="set-cur" help="Take-home pay is converted into this currency.">
              <Select id="set-cur" value={settings.outputCurrency} onChange={(e) => updateSettings({ outputCurrency: e.target.value })}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_NAMES[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default tax year" htmlFor="set-year">
              <Select id="set-year" value={settings.taxYear} onChange={(e) => updateSettings({ taxYear: Number(e.target.value) })}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default salary frequency">
              <Segmented<Frequency> label="Default salary frequency" value={settings.frequency} onChange={(frequency) => updateSettings({ frequency })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }, { value: 'hourly', label: 'Hourly' }]} />
            </Field>
            <Switch label="Show all circumstances by default" description="Open the personal-circumstances section in the calculator automatically." checked={settings.mode === 'advanced'} onChange={(v) => updateSettings({ mode: v ? 'advanced' : 'simple' })} />
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle hint="How NetWorth looks and how numbers are written.">Appearance</SectionTitle>
          <div className="space-y-5">
            <Field label="Theme">
              <Segmented<Settings['theme']> label="Theme" value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
            </Field>
            <Field label="Number format" htmlFor="set-locale" help={`Example: ${formatMoney(1234567.891, 'DKK', settings)}`}>
              <Select id="set-locale" value={settings.numberLocale} onChange={(e) => updateSettings({ numberLocale: e.target.value as Settings['numberLocale'] })}>
                <option value="en-US">1,234,567.89</option>
                <option value="de-DE">1.234.567,89</option>
                <option value="fr-FR">1 234 567,89</option>
                <option value="en-IN">12,34,567.89</option>
              </Select>
            </Field>
            <Switch label="Show decimals" description="Display amounts to the cent instead of whole units." checked={settings.showDecimals} onChange={(showDecimals) => updateSettings({ showDecimals })} />
            <div className="border-t border-line pt-4">
              <Button size="sm" variant="ghost" onClick={resetSettings}>
                <RotateCcw size={14} /> Reset settings
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle hint="Free European Central Bank reference rates, published on working days around 16:00 CET.">Exchange rates</SectionTitle>
          <dl className="divide-y divide-line">
            <Row label="Source">ECB via Frankfurter</Row>
            <Row label="Cached rates dated">{cache ? formatDate(cache.date) : 'Nothing cached'}</Row>
            <Row label="Last fetched">{cache ? formatDateTime(new Date(cache.fetchedAt).toISOString()) : '—'}</Row>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh now
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                currencyService.clearCache();
                setCache(null);
                setStatus('Cached rates cleared.');
              }}
            >
              Clear cached rates
            </Button>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle hint="NetWorth keeps your settings, saved calculations, comparison and cached exchange rates in this browser only.">Your data</SectionTitle>
          {confirmWipe ? (
            <div className="space-y-3">
              <Notice tone="neg">This permanently deletes every saved calculation, your comparison and your settings from this browser. Export a backup first if you want to keep them.</Notice>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={wipe}>
                  <Trash2 size={14} /> Delete everything
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmWipe(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirmWipe(true)}>
              <Trash2 size={14} /> Delete all data in this browser
            </Button>
          )}
        </Card>

        {status && (
          <div className="lg:col-span-2">
            <Notice tone="info">{status}</Notice>
          </div>
        )}
      </Container>
    </>
  );
}
