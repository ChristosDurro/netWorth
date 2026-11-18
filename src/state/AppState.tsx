import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { taxRegistry } from '../data/taxData';
import { compareRowSchema, DEFAULT_SETTINGS, type CalcDraft, type CompareRow, type SavedCalculation, type Settings } from '../services/storage/models';
import { loadSaved, loadSettings, newId, persistSaved, readJson, saveSettings, writeJson } from '../services/storage/storage';

export type Route = 'calculator' | 'compare' | 'saved' | 'settings' | 'methodology' | 'admin';
const ROUTES: Route[] = ['calculator', 'compare', 'saved', 'settings', 'methodology', 'admin'];

/** The admin Update Center only exists in development builds; it is compiled out of production bundles. */
export const ADMIN_ENABLED: boolean = import.meta.env.DEV;

function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (name === '') return 'calculator';
  if (name === 'admin' && !ADMIN_ENABLED) return 'calculator';
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'calculator';
}

export function defaultDraft(settings: Settings): CalcDraft {
  const countries = taxRegistry.listCountries();
  const country = countries.find((c) => c.code === 'DK') ?? countries[0];
  const years = country?.years ?? [settings.taxYear];
  return {
    country: country?.code ?? 'DK',
    taxYear: years.includes(settings.taxYear) ? settings.taxYear : years[0],
    amount: 40000,
    frequency: settings.frequency,
    hoursPerWeek: 37,
    location: '',
    mode: settings.mode,
    personal: {},
    targetCurrency: settings.outputCurrency,
    autoConvert: true,
    manualRate: null,
    rateDate: null,
  };
}

const COMPARE_KEY = 'networth.compare';
const defaultCompareRows = (): CompareRow[] => {
  const pick = (code: string, amount: number): CompareRow | null => (taxRegistry.hasModule(code) && taxRegistry.listCountries().some((c) => c.code === code) ? { id: newId(), country: code, amount, location: '', personal: {} } : null);
  return [pick('DK', 40000), pick('DE', 5000), pick('NL', 5000), pick('SE', 45000)].filter((r): r is CompareRow => r !== null);
};

interface AppState {
  route: Route;
  navigate: (r: Route) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  draft: CalcDraft;
  patchDraft: (patch: Partial<CalcDraft>) => void;
  loadDraft: (d: CalcDraft) => void;
  saved: SavedCalculation[];
  setSaved: (next: SavedCalculation[]) => void;
  compareRows: CompareRow[];
  setCompareRows: (rows: CompareRow[]) => void;
  effectiveTheme: 'dark' | 'light';
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [draft, setDraft] = useState<CalcDraft>(() => defaultDraft(loadSettings()));
  const [saved, setSavedState] = useState<SavedCalculation[]>(loadSaved);
  const [compareRows, setCompareState] = useState<CompareRow[]>(() => {
    const stored = readJson(COMPARE_KEY, compareRowSchema.array(), []).filter((r) => taxRegistry.listCountries().some((c) => c.code === r.country));
    return stored.length ? stored : defaultCompareRows();
  });
  const [systemDark, setSystemDark] = useState(() => (typeof matchMedia === 'function' ? !matchMedia('(prefers-color-scheme: light)').matches : true));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSystemDark(!mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effectiveTheme: 'dark' | 'light' = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveTheme === 'dark' ? '#090d14' : '#f5f6f8');
  }, [effectiveTheme]);

  const navigate = useCallback((r: Route) => {
    window.location.hash = r === 'calculator' ? '#/' : `#/${r}`;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    // The header currency selector is the "preferred output currency": keep the open calculation in step.
    if (patch.outputCurrency) setDraft((d) => ({ ...d, targetCurrency: patch.outputCurrency as string, manualRate: null }));
  }, []);

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const patchDraft = useCallback((patch: Partial<CalcDraft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const loadDraft = useCallback((d: CalcDraft) => setDraft(d), []);

  const setSaved = useCallback((next: SavedCalculation[]) => {
    setSavedState(next);
    persistSaved(next);
  }, []);

  const setCompareRows = useCallback((rows: CompareRow[]) => {
    setCompareState(rows);
    writeJson(COMPARE_KEY, rows);
  }, []);

  const value = useMemo<AppState>(
    () => ({ route, navigate, settings, updateSettings, resetSettings, draft, patchDraft, loadDraft, saved, setSaved, compareRows, setCompareRows, effectiveTheme }),
    [route, navigate, settings, updateSettings, resetSettings, draft, patchDraft, loadDraft, saved, setSaved, compareRows, setCompareRows, effectiveTheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppStateProvider>');
  return v;
}
