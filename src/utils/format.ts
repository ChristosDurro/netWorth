export interface FormatPrefs {
  numberLocale: string;
  showDecimals: boolean;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/** "€3,674" / "26,114 DKK" — code display keeps every currency unambiguous. */
export function formatMoney(value: number, currency: string, prefs: FormatPrefs, opts: { decimals?: boolean } = {}): string {
  const digits = (opts.decimals ?? prefs.showDecimals) ? 2 : 0;
  const rounded = Object.is(Math.round(value * 10 ** digits) / 10 ** digits, -0) ? 0 : value;
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : null;
  const n = nf(prefs.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rounded);
  if (symbol) return n.startsWith('-') ? `-${symbol}${n.slice(1)}` : `${symbol}${n}`;
  return `${n} ${currency}`;
}

export function formatNumber(value: number, prefs: FormatPrefs, digits = 0): string {
  return nf(prefs.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(ratio: number, prefs: FormatPrefs, digits = 1): string {
  return `${nf(prefs.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio * 100)}%`;
}

export function formatRate(rate: number, prefs: FormatPrefs): string {
  const digits = rate >= 100 ? 2 : rate >= 1 ? 4 : 5;
  return nf(prefs.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(rate);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
