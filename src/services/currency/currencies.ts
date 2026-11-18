/** Currencies published by Frankfurter (ECB reference rates). Used when the list endpoint is unreachable. */
export const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro',
  USD: 'United States Dollar',
  GBP: 'British Pound',
  CHF: 'Swiss Franc',
  DKK: 'Danish Krone',
  SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone',
  ISK: 'Icelandic Króna',
  PLN: 'Polish Złoty',
  CZK: 'Czech Koruna',
  HUF: 'Hungarian Forint',
  RON: 'Romanian Leu',
  TRY: 'Turkish Lira',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  CAD: 'Canadian Dollar',
  JPY: 'Japanese Yen',
  CNY: 'Chinese Renminbi Yuan',
  HKD: 'Hong Kong Dollar',
  SGD: 'Singapore Dollar',
  INR: 'Indian Rupee',
  KRW: 'South Korean Won',
  THB: 'Thai Baht',
  MYR: 'Malaysian Ringgit',
  IDR: 'Indonesian Rupiah',
  PHP: 'Philippine Peso',
  ILS: 'Israeli New Shekel',
  ZAR: 'South African Rand',
  BRL: 'Brazilian Real',
  MXN: 'Mexican Peso',
};

export const CURRENCY_CODES = Object.keys(CURRENCY_NAMES);

/**
 * ECB reference rates bundled at build time. They are only used when the
 * service has never been reachable on this device, and are always labelled
 * with their date so they can never pass for current rates.
 */
export const BUNDLED_RATES: { date: string; base: 'EUR'; rates: Record<string, number> } = {
  date: '2026-11-16',
  base: 'EUR',
  rates: {
    AUD: 1.6301, BRL: 6.2838, CAD: 1.5734, CHF: 0.9244, CNY: 7.3425, CZK: 24.428, DKK: 7.4752, GBP: 0.8345,
    HKD: 8.6427, HUF: 364.35, IDR: 20110.0, ILS: 3.5509, INR: 103.452, ISK: 136.8, JPY: 175.78, KRW: 1470.23,
    MXN: 20.4429, MYR: 4.5102, NOK: 10.574, NZD: 1.9971, PHP: 70.439, PLN: 4.403, RON: 5.3493, SEK: 11.095,
    SGD: 1.4195, THB: 37.326, TRY: 55.502, USD: 1.1014, ZAR: 18.661,
  },
};
