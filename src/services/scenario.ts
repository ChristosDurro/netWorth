import { taxRegistry } from '../data/taxData';
import type { CalcResult, InputField, PersonalInputs } from '../engine/types';
import { CURRENCY_CODES } from './currency/currencies';
import type { CalcDraft, Frequency } from './storage/models';

/**
 * Shareable scenarios. A link carries only the *inputs* needed to reproduce a
 * calculation — never results, names or anything personal beyond what the user
 * typed into the form — and every parameter is validated before use. The result is
 * always recalculated by the tax engine when the link is opened.
 *
 *   /calculator?country=DK&salary=40000&frequency=monthly&year=2026&currency=EUR
 */

const MAX_SALARY = 100_000_000;
const FREQUENCIES: Frequency[] = ['monthly', 'annual', 'hourly'];

function personalDefaults(fields: InputField[]): PersonalInputs {
  return Object.fromEntries(fields.map((f) => [f.key, f.default]));
}

export function scenarioToQuery(draft: CalcDraft): string {
  const q = new URLSearchParams();
  q.set('country', draft.country);
  q.set('salary', String(Math.round(draft.amount * 100) / 100));
  q.set('frequency', draft.frequency);
  q.set('year', String(draft.taxYear));
  q.set('currency', draft.targetCurrency);
  if (draft.direction === 'net-to-gross') q.set('mode', 'net');
  if (draft.frequency === 'hourly') q.set('hours', String(draft.hoursPerWeek));
  if (draft.location) q.set('location', draft.location);
  if (draft.mode === 'advanced') q.set('details', 'advanced');
  if (!draft.autoConvert && draft.manualRate) q.set('rate', String(draft.manualRate));
  if (draft.autoConvert && draft.rateDate) q.set('rateDate', draft.rateDate);
  try {
    const fields = taxRegistry.getRequiredPersonalInputs(draft.country, draft.taxYear);
    const defaults = personalDefaults(fields);
    for (const f of fields) {
      const v = draft.personal[f.key];
      if (v !== undefined && v !== defaults[f.key] && (draft.mode === 'advanced' || !f.advanced)) q.set(`p.${f.key}`, String(v));
    }
  } catch {
    /* unknown country/year: share the basics only */
  }
  return q.toString();
}

export interface ParsedScenario {
  draft: CalcDraft;
  /** Parameters that were present but rejected. */
  rejected: string[];
}

/** Returns null when the query contains no scenario at all. */
export function queryToScenario(search: string, base: CalcDraft, today = new Date().toISOString().slice(0, 10)): ParsedScenario | null {
  const q = new URLSearchParams(search);
  if (!q.has('country') && !q.has('salary')) return null;
  const rejected: string[] = [];
  const draft: CalcDraft = { ...base, personal: {}, location: '', manualRate: null, rateDate: null, autoConvert: true };

  const country = (q.get('country') ?? '').toUpperCase();
  const info = taxRegistry.listCountries().find((c) => c.code === country);
  if (info) draft.country = info.code;
  else if (q.has('country')) rejected.push('country');
  const years = taxRegistry.getSupportedTaxYears(draft.country);

  const year = Number(q.get('year'));
  if (q.has('year')) {
    if (Number.isInteger(year) && years.includes(year)) draft.taxYear = year;
    else rejected.push('year');
  }
  if (!years.includes(draft.taxYear)) draft.taxYear = years[years.length - 1];

  const freq = q.get('frequency') as Frequency | null;
  if (freq) {
    if (FREQUENCIES.includes(freq)) draft.frequency = freq;
    else rejected.push('frequency');
  }

  const salary = Number(q.get('salary'));
  if (q.has('salary')) {
    if (Number.isFinite(salary) && salary > 0 && salary <= MAX_SALARY) draft.amount = Math.round(salary * 100) / 100;
    else rejected.push('salary');
  }

  const hours = Number(q.get('hours'));
  if (q.has('hours')) {
    if (Number.isFinite(hours) && hours >= 1 && hours <= 80) draft.hoursPerWeek = hours;
    else rejected.push('hours');
  }

  const currency = (q.get('currency') ?? '').toUpperCase();
  if (q.has('currency')) {
    if (CURRENCY_CODES.includes(currency)) draft.targetCurrency = currency;
    else rejected.push('currency');
  }

  const mode = q.get('mode');
  if (mode === 'net') draft.direction = 'net-to-gross';
  else if (mode === null || mode === 'gross') draft.direction = 'gross-to-net';
  else rejected.push('mode');
  if (draft.direction === 'net-to-gross' && draft.frequency === 'hourly') draft.frequency = 'monthly';

  const details = q.get('details');
  if (details === 'advanced') draft.mode = 'advanced';
  else if (details !== null) rejected.push('details');

  const rate = Number(q.get('rate'));
  if (q.has('rate')) {
    if (Number.isFinite(rate) && rate > 0 && rate < 1e6) {
      draft.autoConvert = false;
      draft.manualRate = rate;
    } else rejected.push('rate');
  }
  const rateDate = q.get('rateDate');
  if (rateDate !== null) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rateDate) && rateDate >= '1999-01-04' && rateDate <= today && !Number.isNaN(Date.parse(rateDate))) draft.rateDate = rateDate;
    else rejected.push('rateDate');
  }

  try {
    const locations = taxRegistry.getAvailableLocations(draft.country, draft.taxYear);
    const loc = q.get('location');
    if (loc !== null) {
      if (locations?.options.some((o) => o.id === loc)) draft.location = loc;
      else rejected.push('location');
    }
    const fields = taxRegistry.getRequiredPersonalInputs(draft.country, draft.taxYear);
    for (const [key, raw] of q.entries()) {
      if (!key.startsWith('p.')) continue;
      const f = fields.find((x) => x.key === key.slice(2));
      const v = f ? parsePersonal(f, raw) : undefined;
      if (f && v !== undefined) {
        draft.personal[f.key] = v;
        if (f.advanced) draft.mode = 'advanced';
      } else rejected.push(key);
    }
  } catch {
    rejected.push('country');
  }
  return { draft, rejected };
}

function parsePersonal(f: InputField, raw: string): string | number | boolean | undefined {
  if (f.type === 'boolean') return raw === 'true' || raw === '1' ? true : raw === 'false' || raw === '0' ? false : undefined;
  if (f.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= f.min && n <= f.max ? n : undefined;
  }
  return f.options.some((o) => o.value === raw) ? raw : undefined;
}

/* ── Reverse calculation: which gross gives a desired net? ───────────── */

export interface ReverseResult {
  grossAnnual: number;
  result: CalcResult;
}

/**
 * Finds the gross annual salary whose net equals `netAnnual`, by bisection on the
 * real tax engine (net pay never falls as gross rises — an invariant tested for every
 * dataset). Accurate to within one currency unit.
 */
export function grossForNet(input: { country: string; taxYear: number; netAnnual: number; location?: string; personal?: PersonalInputs }): ReverseResult | null {
  const { netAnnual } = input;
  if (!Number.isFinite(netAnnual) || netAnnual <= 0) return null;
  const calc = (gross: number) => taxRegistry.calculateNetSalary({ country: input.country, taxYear: input.taxYear, grossAnnual: gross, location: input.location, personal: input.personal });
  let lo = netAnnual;
  let hi = netAnnual * 2 + 1000;
  let guard = 0;
  while (calc(hi).netAnnual < netAnnual && guard++ < 40) hi *= 2;
  if (calc(hi).netAnnual < netAnnual) return null;
  for (let i = 0; i < 80 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    if (calc(mid).netAnnual < netAnnual) lo = mid;
    else hi = mid;
  }
  const grossAnnual = Math.ceil(hi * 100) / 100;
  return { grossAnnual, result: calc(grossAnnual) };
}
