import type { Bracket } from './schema';

/** Tax on `income` under marginal brackets, plus the per-band amounts. */
export function progressiveTax(income: number, brackets: Bracket[]): { total: number; bands: { from: number; to: number | null; rate: number; amount: number }[] } {
  let lower = 0;
  let total = 0;
  const bands: { from: number; to: number | null; rate: number; amount: number }[] = [];
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    const slice = Math.max(0, Math.min(income, upper) - lower);
    const amount = slice * b.rate;
    bands.push({ from: lower, to: b.upTo, rate: b.rate, amount });
    total += amount;
    lower = upper;
    if (income <= upper) break;
  }
  return { total, bands };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const floorTo = (v: number, step: number): number => Math.floor(v / step) * step;
export const ceilTo = (v: number, step: number): number => Math.ceil(v / step) * step;
/** Round half away from zero to `dp` decimals without binary drift. */
export const round = (v: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
};

export const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
export const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

export const pct = (r: number, dp = 2): string => `${round(r * 100, dp)}%`;
export const amt = (v: number): string => Math.round(v).toLocaleString('en-US');
