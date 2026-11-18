import { describe, expect, it, vi } from 'vitest';
import { convert, crossRate, CurrencyService, FRESH_MS, manualQuote, RateUnavailableError, type StorageLike } from '../../src/services/currency/currencyService';

const TABLE = { amount: 1, base: 'EUR', date: '2026-11-16', rates: { DKK: 7.4752, SEK: 11.095, GBP: 0.8345, USD: 1.1014, NOK: 10.574 } };
const HIST = { amount: 1, base: 'EUR', date: '2026-01-02', rates: { DKK: 7.4694, SEK: 10.8085 } };

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function service(opts: { fetch?: typeof fetch; now?: number; storage?: StorageLike; bundled?: null | { date: string; rates: Record<string, number> } } = {}) {
  let now = opts.now ?? Date.parse('2026-11-17T10:00:00Z');
  const fetchFn = vi.fn(opts.fetch ?? (async (url: RequestInfo | URL) => (String(url).includes('/2026-01-02') ? json(HIST) : json(TABLE))));
  const svc = new CurrencyService({ fetch: fetchFn as unknown as typeof fetch, storage: opts.storage ?? memoryStorage(), now: () => now, bundled: opts.bundled === undefined ? null : opts.bundled });
  return { svc, fetchFn, advance: (ms: number) => (now += ms) };
}

describe('cross rates', () => {
  it('DKK → EUR', async () => {
    const q = await service().svc.getRate('DKK', 'EUR');
    expect(q.rate).toBeCloseTo(1 / 7.4752, 10);
    expect(convert(26114, q)).toBeCloseTo(26114 / 7.4752, 6);
    expect(q.date).toBe('2026-11-16');
    expect(q.source).toBe('live');
  });
  it('EUR → DKK', async () => expect((await service().svc.getRate('EUR', 'DKK')).rate).toBe(7.4752));
  it('SEK → EUR', async () => expect((await service().svc.getRate('SEK', 'EUR')).rate).toBeCloseTo(1 / 11.095, 10));
  it('GBP → EUR', async () => expect((await service().svc.getRate('GBP', 'EUR')).rate).toBeCloseTo(1 / 0.8345, 10));
  it('non-EUR pair via EUR (SEK → DKK)', async () => expect((await service().svc.getRate('SEK', 'DKK')).rate).toBeCloseTo(7.4752 / 11.095, 10));
  it('same currency needs no request', async () => {
    const { svc, fetchFn } = service();
    const q = await svc.getRate('NOK', 'NOK');
    expect(q.rate).toBe(1);
    expect(q.source).toBe('identity');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('missing currency in the table is reported, not guessed', async () => {
    await expect(service().svc.getRate('DKK', 'XAU')).rejects.toThrow(RateUnavailableError);
    expect(crossRate({ rates: {} }, 'DKK', 'EUR')).toBeNull();
  });
});

describe('caching and failures', () => {
  it('reuses a fresh cached table without a new request', async () => {
    const { svc, fetchFn } = service();
    await svc.getRate('DKK', 'EUR');
    const q = await svc.getRate('SEK', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(q.source).toBe('cache');
  });
  it('refetches once the cache is older than the freshness window', async () => {
    const { svc, fetchFn, advance } = service();
    await svc.getRate('DKK', 'EUR');
    advance(FRESH_MS + 1);
    await svc.getRate('DKK', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('falls back to the last successful response and flags it as outdated', async () => {
    const storage = memoryStorage();
    await service({ storage }).svc.getRate('DKK', 'EUR');
    const failing = service({ storage, now: Date.parse('2026-11-20T10:00:00Z'), fetch: async () => json({ error: 'down' }, 503) });
    const q = await failing.svc.getRate('DKK', 'EUR');
    expect(q.source).toBe('stale-cache');
    expect(q.outdated).toBe(true);
    expect(q.date).toBe('2026-11-16');
    expect(q.error).toMatch(/HTTP 503/);
  });
  it('network failure with no cache uses the clearly labelled built-in table', async () => {
    const q = await service({ fetch: async () => Promise.reject(new TypeError('Failed to fetch')), bundled: { date: '2026-11-16', rates: { DKK: 7.47 } } }).svc.getRate('DKK', 'EUR');
    expect(q.source).toBe('bundled');
    expect(q.outdated).toBe(true);
  });
  it('without cache or fallback the error asks for a manual rate', async () => {
    await expect(service({ fetch: async () => Promise.reject(new TypeError('Failed to fetch')) }).svc.getRate('DKK', 'EUR')).rejects.toThrow(/manually/);
  });
  it('rejects malformed responses', async () => {
    await expect(service({ fetch: async () => json({ nope: true }) }).svc.getRate('DKK', 'EUR')).rejects.toThrow(RateUnavailableError);
  });
  it('flags a "latest" rate that is many days old', async () => {
    const q = await service({ now: Date.parse('2026-12-10T10:00:00Z') }).svc.getRate('DKK', 'EUR');
    expect(q.outdated).toBe(true);
  });
  it('deduplicates concurrent requests', async () => {
    const { svc, fetchFn } = service();
    await Promise.all([svc.getRate('DKK', 'EUR'), svc.getRate('SEK', 'EUR'), svc.getRate('NOK', 'EUR')]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('manual and historical rates', () => {
  it('manual rate is used as given', () => {
    const q = manualQuote('DKK', 'EUR', 0.134);
    expect(convert(1000, q)).toBeCloseTo(134, 9);
    expect(q.source).toBe('manual');
    expect(() => manualQuote('DKK', 'EUR', 0)).toThrow();
  });
  it('historical rate uses the dated endpoint and is cached', async () => {
    const { svc, fetchFn } = service();
    const q = await svc.getRate('DKK', 'SEK', { date: '2026-01-02' });
    expect(q.historical).toBe(true);
    expect(q.date).toBe('2026-01-02');
    expect(q.rate).toBeCloseTo(10.8085 / 7.4694, 10);
    expect(String(fetchFn.mock.calls[0][0])).toContain('/2026-01-02?base=EUR');
    await svc.getRate('DKK', 'SEK', { date: '2026-01-02' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('refuses future or malformed dates', async () => {
    await expect(service().svc.getRate('DKK', 'EUR', { date: '2030-01-01' })).rejects.toThrow(/future/);
    await expect(service().svc.getRate('DKK', 'EUR', { date: '01/02/2026' })).rejects.toThrow(/YYYY-MM-DD/);
  });
  it('uses Frankfurter without any API key', async () => {
    const { svc, fetchFn } = service();
    await svc.getRate('DKK', 'EUR');
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toBe('https://api.frankfurter.dev/v1/latest?base=EUR');
    expect(url).not.toMatch(/key|token/i);
  });
});
