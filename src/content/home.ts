import type { FaqItem } from './countries';

export const TAGLINE = 'Know what your salary is actually worth.';
export const SITE_NAME = 'NetWorth';

/** Shown on the homepage and emitted as FAQPage structured data — keep both identical. */
export const HOME_FAQ: FaqItem[] = [
  {
    q: 'How accurate is NetWorth?',
    a: 'Each country is calculated from that country’s official rules for the selected tax year, and the results are tested against official reference calculations where they exist (for example the German BMF payroll examples). Every result shows whether the rules are verified, estimated or incomplete. Real payroll can still differ because of bonuses, benefits or personal deductions.',
  },
  {
    q: 'Why does NetWorth convert after tax?',
    a: 'Tax is charged in the currency you are paid in. NetWorth calculates gross-to-net in the employment currency first and only converts the net amount, so exchange-rate movements never change how much tax is calculated.',
  },
  {
    q: 'Which exchange rate is used?',
    a: 'The European Central Bank reference rate, fetched from the free Frankfurter service, with its date shown next to every converted amount. Banks and transfer services usually give you a slightly worse rate.',
  },
  {
    q: 'Is my salary data stored anywhere?',
    a: 'No. There are no accounts and no server. Calculations run in your browser; saved calculations and settings stay in your browser’s local storage. The only network request is for exchange rates, and it contains no salary information.',
  },
  {
    q: 'Can I compare job offers in different countries?',
    a: 'Yes. The comparison page taxes each offer under its own country’s rules and currency, then converts all take-home amounts into one currency and ranks them.',
  },
  {
    q: 'Is NetWorth free?',
    a: 'Yes. NetWorth is free to use, has no ads and needs no account.',
  },
];
