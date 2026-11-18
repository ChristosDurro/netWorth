import { useEffect, useState } from 'react';
import { currencyService, type RateSource, type RateTable } from '../services/currency/currencyService';

/** Full EUR-based rate table for views that convert many currencies at once. */
export function useRateTable(): { table: RateTable | null; source: RateSource | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ table: RateTable | null; source: RateSource | null; error: string | null; loading: boolean }>({ table: null, source: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    currencyService
      .getLatestTable()
      .then(({ table, source, error }) => !cancelled && setState({ table, source, error: error ?? null, loading: false }))
      .catch((e: unknown) => !cancelled && setState({ table: null, source: null, error: e instanceof Error ? e.message : 'Exchange rates unavailable.', loading: false }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
