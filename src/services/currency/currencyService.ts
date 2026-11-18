import { z } from 'zod';
import { BUNDLED_RATES } from './currencies';

/**
 * Exchange rates from Frankfurter (https://frankfurter.dev) — free, no API
 * key, based on European Central Bank reference rates.
 *
 * This module knows nothing about tax. It always works from a full EUR-based
 * table so a single request serves every currency pair.
 */

export const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1';

export type RateSource =
  | 'live' // fetched from the provider just now
  | 'cache' // provider answered earlier and the copy is still fresh
  | 'stale-cache' // provider unreachable, last successful response reused
  | 'bundled' // provider never reachable on this device; build-time reference rates
  | 'manual' // entered by the user
  | 'identity'; // same currency on both sides

export interface RateQuote {
  base: string;
  quote: string;
  /** Units of `quote` per one unit of `base`. */
  rate: number;
  /** The date the rate was published for (ECB working day), or null for manual rates. */
  date: string | null;
  source: RateSource;
  /** True when the rate is not the latest available and must be labelled as such. */
  outdated: boolean;
  /** Set when a specific historical date was requested. */
  historical: boolean;
  /** Human-readable reason when the provider could not be reached. */
  error?: string;
}

export interface RateTable {
  base: 'EUR';
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class RateUnavailableError extends Error {}

const responseSchema = z.object({
  base: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.record(z.string(), z.number().positive()),
});
const tableSchema = z.object({ base: z.literal('EUR'), date: z.string(), rates: z.record(z.string(), z.number().positive()), fetchedAt: z.number() });

const LATEST_KEY = 'networth.rates.latest';
const HIST_PREFIX = 'networth.rates.hist.';
/** ECB publishes once per working day, so a few hours of caching loses nothing. */
export const FRESH_MS = 6 * 60 * 60 * 1000;
/** A latest rate older than this many days (weekend + holidays) is flagged as outdated. */
export const OUTDATED_AFTER_DAYS = 5;

const daysBetween = (isoDate: string, now: number): number => (now - Date.parse(`${isoDate}T00:00:00Z`)) / 86_400_000;

/** Cross rate from a EUR-based table. Returns null when either currency is missing. */
export function crossRate(table: Pick<RateTable, 'rates'>, base: string, quote: string): number | null {
  if (base === quote) return 1;
  const b = base === 'EUR' ? 1 : table.rates[base];
  const q = quote === 'EUR' ? 1 : table.rates[quote];
  if (!b || !q) return null;
  return q / b;
}

export function convert(amount: number, quote: Pick<RateQuote, 'rate'>): number {
  return amount * quote.rate;
}

export function manualQuote(base: string, quote: string, rate: number): RateQuote {
  if (!Number.isFinite(rate) || rate <= 0) throw new RateUnavailableError('A manual exchange rate must be a positive number.');
  return { base, quote, rate, date: null, source: 'manual', outdated: false, historical: false };
}

export interface CurrencyServiceOptions {
  fetch?: typeof fetch;
  storage?: StorageLike | null;
  now?: () => number;
  baseUrl?: string;
  /** Disable the build-time fallback table (used in tests). */
  bundled?: { date: string; rates: Record<string, number> } | null;
}

export class CurrencyService {
  private fetchFn: typeof fetch;
  private storage: StorageLike | null;
  private now: () => number;
  private baseUrl: string;
  private bundled: { date: string; rates: Record<string, number> } | null;
  private inflight = new Map<string, Promise<RateTable>>();

  constructor(opts: CurrencyServiceOptions = {}) {
    this.fetchFn = opts.fetch ?? ((...a) => globalThis.fetch(...a));
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
    this.now = opts.now ?? Date.now;
    this.baseUrl = opts.baseUrl ?? FRANKFURTER_BASE_URL;
    this.bundled = opts.bundled === undefined ? BUNDLED_RATES : opts.bundled;
  }

  /** Last successful "latest" response stored on this device, if any. */
  getCachedTable(): RateTable | null {
    return this.read(LATEST_KEY);
  }

  clearCache(): void {
    this.storage?.removeItem(LATEST_KEY);
  }

  private read(key: string): RateTable | null {
    try {
      const raw = this.storage?.getItem(key);
      if (!raw) return null;
      const parsed = tableSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private write(key: string, table: RateTable): void {
    try {
      this.storage?.setItem(key, JSON.stringify(table));
    } catch {
      /* storage full or blocked: the app keeps working without a cache */
    }
  }

  private async fetchTable(path: string): Promise<RateTable> {
    const existing = this.inflight.get(path);
    if (existing) return existing;
    const p = (async () => {
      const res = await this.fetchFn(`${this.baseUrl}/${path}?base=EUR`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Exchange-rate service answered HTTP ${res.status}`);
      const body = responseSchema.parse(await res.json());
      if (body.base !== 'EUR') throw new Error('Unexpected base currency in response');
      return { base: 'EUR' as const, date: body.date, rates: body.rates, fetchedAt: this.now() };
    })();
    this.inflight.set(path, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(path);
    }
  }

  /**
   * Latest table with the documented fallback chain:
   * fresh cache → live → stale cache (flagged) → bundled table (flagged).
   */
  async getLatestTable(forceRefresh = false): Promise<{ table: RateTable; source: RateSource; error?: string }> {
    const cached = this.read(LATEST_KEY);
    if (!forceRefresh && cached && this.now() - cached.fetchedAt < FRESH_MS) return { table: cached, source: 'cache' };
    try {
      const table = await this.fetchTable('latest');
      this.write(LATEST_KEY, table);
      return { table, source: 'live' };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Exchange-rate service unreachable';
      if (cached) return { table: cached, source: 'stale-cache', error };
      if (this.bundled) return { table: { base: 'EUR', date: this.bundled.date, rates: this.bundled.rates, fetchedAt: 0 }, source: 'bundled', error };
      throw new RateUnavailableError(`${error}. Enter an exchange rate manually to continue.`);
    }
  }

  /** Historical table for a given date (the provider returns the closest earlier working day). */
  async getHistoricalTable(date: string): Promise<{ table: RateTable; source: RateSource }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RateUnavailableError('Historical dates must use the format YYYY-MM-DD.');
    if (Date.parse(`${date}T00:00:00Z`) > this.now()) throw new RateUnavailableError('Exchange rates are not available for future dates.');
    const key = HIST_PREFIX + date;
    const cached = this.read(key);
    if (cached) return { table: cached, source: 'cache' };
    try {
      const table = await this.fetchTable(date);
      this.write(key, table);
      return { table, source: 'live' };
    } catch (e) {
      throw new RateUnavailableError(`No exchange rate could be retrieved for ${date}: ${e instanceof Error ? e.message : 'service unreachable'}.`);
    }
  }

  /** Rate for converting `base` into `quote`, latest or for a historical date. */
  async getRate(base: string, quote: string, opts: { date?: string | null; forceRefresh?: boolean } = {}): Promise<RateQuote> {
    if (base === quote) return { base, quote, rate: 1, date: null, source: 'identity', outdated: false, historical: false };
    if (opts.date) {
      const { table, source } = await this.getHistoricalTable(opts.date);
      const rate = crossRate(table, base, quote);
      if (rate === null) throw new RateUnavailableError(`No ${base}/${quote} exchange rate is published for ${table.date}.`);
      return { base, quote, rate, date: table.date, source, outdated: false, historical: true };
    }
    const { table, source, error } = await this.getLatestTable(opts.forceRefresh);
    const rate = crossRate(table, base, quote);
    if (rate === null) throw new RateUnavailableError(`No ${base}/${quote} exchange rate is available. Enter a rate manually to continue.`);
    const outdated = source === 'stale-cache' || source === 'bundled' || daysBetween(table.date, this.now()) > OUTDATED_AFTER_DAYS;
    return { base, quote, rate, date: table.date, source, outdated, historical: false, ...(error ? { error } : {}) };
  }
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const currencyService = new CurrencyService();
