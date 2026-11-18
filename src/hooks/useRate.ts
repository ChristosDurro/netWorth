import { useCallback, useEffect, useRef, useState } from 'react';
import { currencyService, manualQuote, type RateQuote } from '../services/currency/currencyService';

export interface RateState {
  quote: RateQuote | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Resolves the exchange rate for a currency pair.
 * - `manualRate` set → that rate is used and nothing is fetched.
 * - `auto` off and no manual rate → no conversion at all (quote stays null).
 */
export function useRate(base: string, quote: string, opts: { auto: boolean; manualRate: number | null; date: string | null }): RateState {
  const { auto, manualRate, date } = opts;
  const [state, setState] = useState<{ quote: RateQuote | null; loading: boolean; error: string | null }>({ quote: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const force = useRef(false);

  useEffect(() => {
    if (base === quote) {
      setState({ quote: { base, quote, rate: 1, date: null, source: 'identity', outdated: false, historical: false }, loading: false, error: null });
      return;
    }
    if (!auto) {
      if (manualRate && manualRate > 0) setState({ quote: manualQuote(base, quote, manualRate), loading: false, error: null });
      else setState({ quote: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const forceRefresh = force.current;
    force.current = false;
    currencyService
      .getRate(base, quote, { date, forceRefresh })
      .then((q) => !cancelled && setState({ quote: q, loading: false, error: null }))
      .catch((e: unknown) => !cancelled && setState({ quote: null, loading: false, error: e instanceof Error ? e.message : 'Exchange rate unavailable.' }));
    return () => {
      cancelled = true;
    };
  }, [base, quote, auto, manualRate, date, tick]);

  const refresh = useCallback(() => {
    force.current = true;
    setTick((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
