import { ArrowRight, Check, Columns3, FileText, Globe2, Landmark, ShieldCheck } from 'lucide-react';
import { useId, useMemo } from 'react';
import { AmountInput } from '../components/calculator/SalaryForm';
import { CountryPicker } from '../components/calculator/CountryPicker';
import { StatusBadge, STATUS_COPY } from '../components/calculator/Results';
import { Flag } from '../components/common/Flag';
import { ButtonLink, Card, Eyebrow, Segmented, Select, cx } from '../components/common/ui';
import { Container } from '../components/layout/Layout';
import { countryContent, publicCountries } from '../content/countries';
import { HOME_FAQ, TAGLINE } from '../content/home';
import { taxRegistry } from '../data/taxData';
import { calculateDraft, useCalculation } from '../hooks/useCalculation';
import { useRate } from '../hooks/useRate';
import { Link } from '../router';
import { scenarioToQuery } from '../services/scenario';
import { BUNDLED_RATES, CURRENCY_CODES } from '../services/currency/currencies';
import { crossRate } from '../services/currency/currencyService';
import { useApp, usePrefs, typicalSalary } from '../state/AppState';
import { formatDate, formatMoney, formatPercent } from '../utils/format';

function QuickCalculator() {
  const { draft, patchDraft } = useApp();
  const prefs = usePrefs();
  const ids = useId();
  const countries = taxRegistry.listCountries();
  const country = countries.find((c) => c.code === draft.country);
  const from = country?.currency ?? 'EUR';
  const quick = { ...draft, direction: 'gross-to-net' as const, frequency: draft.frequency === 'hourly' ? ('monthly' as const) : draft.frequency };
  const calc = useCalculation(quick);
  const rate = useRate(from, draft.targetCurrency, { auto: true, manualRate: null, date: null });
  const r = calc.result;
  const converted = r && rate.quote ? r.netMonthly * rate.quote.rate : null;
  const showConverted = converted !== null && draft.targetCurrency !== from;

  return (
    <Card className="p-5 shadow-pop sm:p-6" aria-labelledby="quick-heading">
      <h2 id="quick-heading" className="text-[15px] font-semibold text-ink">
        Calculate your take-home pay
      </h2>
      <div className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_104px]">
          <div>
            <label htmlFor={`${ids}-c`} className="mb-1.5 block text-[13px] font-medium text-ink">
              Country
            </label>
            <CountryPicker
              id={`${ids}-c`}
              countries={countries}
              value={draft.country}
              onChange={(code) => {
                const next = countries.find((c) => c.code === code);
                const years = next?.years ?? [];
                patchDraft({ country: code, location: '', personal: {}, taxYear: years.includes(draft.taxYear) ? draft.taxYear : years[years.length - 1], amount: next?.currency === from ? draft.amount : typicalSalary(next?.currency ?? 'EUR') * (quick.frequency === 'annual' ? 12 : 1) });
              }}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-y`} className="mb-1.5 block text-[13px] font-medium text-ink">
              Tax year
            </label>
            <Select id={`${ids}-y`} value={draft.taxYear} onChange={(e) => patchDraft({ taxYear: Number(e.target.value) })}>
              {(country?.years ?? []).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor={`${ids}-a`} className="text-[13px] font-medium text-ink">
              Gross salary
            </label>
            <div className="w-[160px]">
              <Segmented
                size="sm"
                label="Salary frequency"
                value={quick.frequency}
                onChange={(f) => patchDraft({ frequency: f, direction: 'gross-to-net', amount: Math.round(f === 'annual' ? draft.amount * calc.paymentsPerYear : draft.amount / calc.paymentsPerYear) })}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'annual', label: 'Annual' },
                ]}
              />
            </div>
          </div>
          <AmountInput id={`${ids}-a`} label={`Gross ${quick.frequency} salary in ${from}`} value={draft.amount} onChange={(amount) => patchDraft({ amount, direction: 'gross-to-net' })} currency={from} prefs={prefs} />
        </div>
        <div>
          <label htmlFor={`${ids}-cur`} className="mb-1.5 block text-[13px] font-medium text-ink">
            Show in
          </label>
          <Select id={`${ids}-cur`} value={draft.targetCurrency} onChange={(e) => patchDraft({ targetCurrency: e.target.value })}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-surface-2 p-4" aria-live="polite">
        {r ? (
          <>
            <p className="text-xs font-medium text-muted">Take-home pay</p>
            <p className="num mt-1 text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink" data-testid="quick-net">
              {formatMoney(showConverted ? (converted as number) : r.netMonthly, showConverted ? draft.targetCurrency : from, prefs)}
              <span className="ml-1.5 text-base font-medium tracking-normal text-muted">/ month</span>
            </p>
            <p className="num mt-2 text-[13px] text-muted">
              {showConverted && <>{formatMoney(r.netMonthly, from, prefs)} · </>}
              {formatPercent(r.effectiveTaxRate, prefs)} effective tax rate
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Enter a salary to see your take-home pay.</p>
        )}
      </div>
      <ButtonLink to={`/calculator?${scenarioToQuery(quick)}`} variant="primary" size="lg" className="mt-4 w-full">
        See the full breakdown <ArrowRight size={16} />
      </ButtonLink>
    </Card>
  );
}

const TRUST = [
  { icon: Landmark, text: 'Tax rules from official sources, versioned per tax year' },
  { icon: Globe2, text: 'European Central Bank reference rates, always dated' },
  { icon: ShieldCheck, text: 'No account and no tracking — calculations run in your browser' },
  { icon: Check, text: 'Free, with no ads' },
];

function Section({ id, eyebrow, title, intro, children, className }: { id: string; eyebrow?: string; title: string; intro?: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cx('py-16 sm:py-20', className)}>
      <Container>
        <div className="max-w-2xl">
          {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
          <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[32px] sm:leading-tight">
            {title}
          </h2>
          {intro && <p className="mt-3 text-base leading-relaxed text-muted">{intro}</p>}
        </div>
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}

/** The same gross salary in euro, taxed in each country — computed by the engine at the built-in ECB rates. */
function GrossVsNet() {
  const prefs = usePrefs();
  const grossEur = 60000;
  const rows = useMemo(
    () =>
      publicCountries()
        .map((c) => {
          const rate = c.currency === 'EUR' ? 1 : crossRate(BUNDLED_RATES, 'EUR', c.currency);
          if (!rate) return null;
          const calc = calculateDraft({ country: c.code, taxYear: c.year, amount: grossEur * rate, frequency: 'annual', hoursPerWeek: 40, location: '', mode: 'simple', personal: {} });
          if (!calc.result) return null;
          return { ...c, netEur: calc.result.netAnnual / rate, eff: calc.result.effectiveTaxRate, status: calc.result.status };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.netEur - a.netEur),
    [],
  );
  const max = Math.max(...rows.map((r) => r.netEur));
  return (
    <Card className="p-5 sm:p-7">
      <p className="text-sm text-muted">
        Take-home pay per month on a gross salary of <span className="font-medium text-ink">{formatMoney(grossEur, 'EUR', prefs)} a year</span>, standard assumptions:
      </p>
      <ul className="mt-6 space-y-4">
        {rows.map((r) => (
          <li key={r.code} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[160px_minmax(0,1fr)_200px]">
            <Link to={`/countries/${r.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-accent">
              <Flag code={r.code} /> {r.name}
            </Link>
            <div className="h-2 rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-2 rounded-full bg-[var(--chart-income)]" style={{ width: `${(r.netEur / max) * 100}%` }} />
            </div>
            <p className="num text-right text-sm">
              <span className="font-semibold text-ink">{formatMoney(r.netEur / 12, 'EUR', prefs)}</span>
              <span className="hidden text-muted sm:inline"> · {formatPercent(r.eff, prefs)} tax</span>
              {r.status !== 'verified' && <span className="ml-1 text-xs text-warn">est.</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-faint">
        Converted at the built-in ECB reference rates of {formatDate(BUNDLED_RATES.date)}; single employee, no children, default municipality or region. Your situation will differ — use the calculator for your own numbers.
      </p>
    </Card>
  );
}

export function HomePage() {
  const prefs = usePrefs();
  const countries = publicCountries();
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:py-20">
          <div>
            <h1 className="max-w-xl text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-[56px]">{TAGLINE}</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">Compare salaries across countries, after taxes and converted into the currency you use.</p>
            <ul className="mt-8 space-y-3">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-[15px] text-ink">
                  <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/compare" variant="secondary">
                <Columns3 size={16} /> Compare job offers
              </ButtonLink>
              <ButtonLink to="/methodology" variant="ghost">
                <FileText size={16} /> How it works
              </ButtonLink>
            </div>
          </div>
          <QuickCalculator />
        </Container>
      </section>

      <Section id="how" eyebrow="How it works" title="From gross salary to money in your account" intro="NetWorth follows the same order as a payslip, then converts only what you actually receive.">
        <ol className="grid gap-8 md:grid-cols-3">
          {[
            ['Enter the offer', 'Country, gross salary — monthly, annual or hourly — and, if you like, your municipality and personal circumstances.'],
            ['Taxed under local rules', 'Income tax and social contributions are calculated in the local currency with that country’s rules for the tax year.'],
            ['Converted after tax', 'Only the take-home pay is converted, at a dated European Central Bank reference rate.'],
          ].map(([title, text], i) => (
            <li key={title}>
              <span className="mono text-sm font-medium text-accent">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="gross" eyebrow="Why gross salary is misleading" title="The same salary is worth different amounts in different countries" intro="Income tax, social contributions and the number of salary payments vary widely. Comparing gross offers hides those differences." className="border-t border-line">
        <GrossVsNet />
      </Section>

      <Section id="countries" eyebrow="Countries" title="Salary calculators by country" intro="Each country has its own page explaining how employees are taxed, with worked examples from the calculator." className="border-t border-line">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => {
            const content = countryContent(c.code, c.year);
            const amount = content?.examples[1] ?? 0;
            const res = calculateDraft({ country: c.code, taxYear: c.year, amount, frequency: 'monthly', hoursPerWeek: 40, location: '', mode: 'simple', personal: {} }).result;
            return (
              <li key={c.code}>
                <Link to={`/countries/${c.slug}`} className="group block h-full rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2.5 font-semibold text-ink">
                      <Flag code={c.code} /> {c.name}
                    </span>
                    {res && <StatusBadge status={res.status} />}
                  </div>
                  {res && (
                    <p className="num mt-4 text-sm text-muted">
                      {formatMoney(amount, c.currency, prefs)} gross/month →{' '}
                      <span className="font-semibold text-ink">{formatMoney(res.netMonthly, c.currency, prefs)}</span> take-home
                    </p>
                  )}
                  <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                    {c.name} calculator <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="included" eyebrow="What’s in a result" title="What is included in take-home pay" className="border-t border-line">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold text-ink">Deducted from your gross salary</h3>
            <ul className="mt-4 space-y-3 text-[15px] text-muted">
              {['Income tax — national, and municipal or regional where it applies', 'Employee social contributions — pension, health, unemployment', 'Other compulsory levies, such as fees or surcharges', 'Your own pension contribution, if you enter one'].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check size={17} className="mt-0.5 shrink-0 text-pos" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-ink">Not included</h3>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-[15px] text-muted">
              <li>Employer contributions — they don’t reduce your pay</li>
              <li>Bonuses, equity, company cars and other benefits</li>
              <li>Other income, deductions for commuting or interest</li>
              <li>Child benefit and other payments from the state</li>
            </ul>
            <Link to="/methodology" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Full methodology <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      </Section>

      <Section id="compare" eyebrow="Compare" title="Weighing offers in different countries?" intro="Add each offer in its own currency. NetWorth taxes every one under its own rules, converts the take-home pay into one currency and ranks them." className="border-t border-line">
        <ButtonLink to="/compare" variant="primary" size="lg">
          Compare job offers <ArrowRight size={16} />
        </ButtonLink>
      </Section>

      <Section id="trust" eyebrow="Transparency" title="Every result tells you how far to trust it" intro="Each country’s rules live in a versioned dataset with its official sources. Results carry one of three labels." className="border-t border-line">
        <dl className="grid gap-6 md:grid-cols-3">
          {(['verified', 'estimated', 'incomplete'] as const).map((s) => (
            <div key={s}>
              <dt>
                <StatusBadge status={s} />
              </dt>
              <dd className="mt-3 text-[15px] leading-relaxed text-muted">{STATUS_COPY[s].text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Frequently asked questions" className="border-t border-line">
        <div className="max-w-3xl divide-y divide-line border-y border-line">
          {HOME_FAQ.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-ink">
                {f.q}
                <span className="text-xl font-light leading-none text-faint transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
