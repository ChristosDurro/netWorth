import type { Frequency } from '../services/storage/models';

/**
 * Paid weeks per year for hourly pay. Employees in all supported countries are
 * paid during statutory holidays and leave, so the full 52 weeks are counted.
 */
export const PAID_WEEKS_PER_YEAR = 52;

export function toAnnual(amount: number, frequency: Frequency, hoursPerWeek: number, paymentsPerYear: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (frequency === 'annual') return amount;
  if (frequency === 'monthly') return amount * paymentsPerYear;
  return amount * hoursPerWeek * PAID_WEEKS_PER_YEAR;
}

export function fromAnnual(annual: number, frequency: Frequency, hoursPerWeek: number, paymentsPerYear: number): number {
  if (frequency === 'annual') return annual;
  if (frequency === 'monthly') return annual / paymentsPerYear;
  return annual / (hoursPerWeek * PAID_WEEKS_PER_YEAR);
}

/** Parses user input such as "40,000", "40 000" or "40.000,50". */
export function parseAmount(text: string): number {
  let s = text.replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalAt = Math.max(lastComma, lastDot);
  if (decimalAt >= 0) {
    const decimals = s.length - decimalAt - 1;
    const bothKinds = lastComma >= 0 && lastDot >= 0;
    const repeated = (s.match(/[.,]/g) ?? []).length > 1 && !bothKinds;
    // A single separator followed by exactly three digits is a thousands separator.
    if (repeated || (!bothKinds && decimals === 3)) s = s.replace(/[.,]/g, '');
    else s = s.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + s.slice(decimalAt + 1);
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
