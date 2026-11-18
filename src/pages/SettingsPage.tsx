import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Field, Notice, SectionTitle, Segmented, Select, Switch } from '../components/common/ui';
import { taxRegistry } from '../data/taxData';
import { CURRENCY_CODES, CURRENCY_NAMES } from '../services/currency/currencies';
import { currencyService, FRANKFURTER_BASE_URL } from '../services/currency/currencyService';
import type { Frequency, Settings } from '../services/storage/models';
import { useApp } from '../state/AppState';
import { formatDate, formatDateTime, formatMoney } from '../utils/format';

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useApp();
  const [cache, setCache] = useState(() => currencyService.getCachedTable());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const years = [...new Set(taxRegistry.listCountries().flatMap((c) => c.years))].sort((a, b) => b - a);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await currencyService.getLatestTable(true);
      setCache(currencyService.getCachedTable());
      setStatus(r.source === 'live' ? `Updated: rates of ${formatDate(r.table.date)}.` : `The service could not be reached (${r.error ?? 'unknown error'}). Keeping the last known rates.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <SectionTitle hint="Used for every new calculation.">Calculation defaults</SectionTitle>
        <div className="space-y-5">
          <Field label="Default output currency" htmlFor="set-cur">
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
          <Field label="Default calculation mode">
            <Segmented label="Default calculation mode" value={settings.mode} onChange={(mode) => updateSettings({ mode })} options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle hint="How NetWorth looks and how numbers are written.">Appearance & formatting</SectionTitle>
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
              <RotateCcw size={14} /> Reset all settings
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6 xl:col-span-2">
        <SectionTitle hint="Free, no API key. European Central Bank reference rates, published on working days around 16:00 CET.">Exchange rates</SectionTitle>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Source</dt>
            <dd className="text-right font-medium text-ink">
              <a className="text-accent hover:underline" href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">
                Frankfurter
              </a>{' '}
              (ECB data)
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Endpoint</dt>
            <dd className="truncate text-right font-mono text-xs text-ink">{FRANKFURTER_BASE_URL}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Cached rates dated</dt>
            <dd className="text-right font-medium text-ink">{cache ? formatDate(cache.date) : 'Nothing cached yet'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-2">
            <dt className="text-muted">Last successful update</dt>
            <dd className="text-right font-medium text-ink">{cache ? formatDateTime(new Date(cache.fetchedAt).toISOString()) : '—'}</dd>
          </div>
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
            <Trash2 size={14} /> Clear cache
          </Button>
        </div>
        {status && (
          <div className="mt-3">
            <Notice tone="info">{status}</Notice>
          </div>
        )}
      </Card>
    </div>
  );
}
