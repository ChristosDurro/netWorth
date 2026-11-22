import { ArrowRight, ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { AmountInput } from '../components/calculator/SalaryForm';
import { StatusBadge, STATUS_COPY } from '../components/calculator/Results';
import { Flag } from '../components/common/Flag';
import { ButtonLink, Card, Segmented, Select } from '../components/common/ui';
import { Breadcrumbs, Container, PageHeader } from '../components/layout/Layout';
import { countryContent, publicCountries, type CountryContent } from '../content/countries';
import { taxRegistry } from '../data/taxData';
import { calculateDraft, useCalculation, useCountryForm } from '../hooks/useCalculation';
import { useRate } from '../hooks/useRate';
import { Link } from '../router';
import { scenarioToQuery } from '../services/scenario';
import { defaultDraft, useApp, usePrefs } from '../state/AppState';
import type { CalcDraft } from '../services/storage/models';
import { formatDate, formatMoney, formatPercent } from '../utils/format';

/** A calculator locked to one country. Local state, so it never disturbs the main calculator until you open it there. */
function CountryCalculator({ code, year }: { code: string; year: number }) {
  const { settings } = useApp();
  const prefs = usePrefs();
  const ids = useId();
  const [draft, setDraft] = useState<CalcDraft>(() => ({ ...defaultDraft(settings, code), taxYear: year, frequency: 'monthly', mode: 'simple' }));
  const patch = (p: Partial<CalcDraft>) => setDraft((d) => ({ ...d, ...p }));
  const form = useCountryForm(code, year);
  const calc = useCalculation(draft);
  const currency = taxRegistry.listCountries().find((c) => c.code === code)?.currency ?? 'EUR';
  const target = settings.outputCurrency;
  const rate = useRate(currency, target, { auto: true, manualRate: null, date: null });
  const r = calc.result;
  const converted = r && rate.quote && target !== currency ? r.netMonthly * rate.quote.rate : null;
  return (
    <Card className="p-5 shadow-pop sm:p-6" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="text-[15px] font-semibold text-ink">
        Take-home pay calculator
      </h2>
      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor={`${ids}-a`} className="text-[13px] font-medium text-ink">
              Gross salary
            </label>
            <div className="w-[160px]">
              <Segmented
                size="sm"
                label="Salary frequency"
                value={draft.frequency === 'annual' ? 'annual' : 'monthly'}
                onChange={(f) => patch({ frequency: f, amount: Math.round(f === 'annual' ? draft.amount * calc.paymentsPerYear : draft.amount / calc.paymentsPerYear) })}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'annual', label: 'Annual' },
                ]}
              />
            </div>
          </div>
          <AmountInput id={`${ids}-a`} label={`Gross ${draft.frequency} salary in ${currency}`} value={draft.amount} onChange={(amount) => patch({ amount })} currency={currency} prefs={prefs} />
        </div>
        {form.locations && (
          <div>
            <label htmlFor={`${ids}-l`} className="mb-1.5 block text-[13px] font-medium text-ink">
              {form.locations.label}
            </label>
            <Select id={`${ids}-l`} value={draft.location || form.locations.defaultId} onChange={(e) => patch({ location: e.target.value })}>
              {form.locations.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.hint ? ` — ${o.hint}` : ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="mt-5 rounded-lg bg-surface-2 p-4" aria-live="polite">
        {r ? (
          <>
            <p className="text-xs font-medium text-muted">Take-home pay</p>
            <p className="num mt-1 text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">
              {formatMoney(r.netMonthly, currency, prefs)}
              <span className="ml-1.5 text-base font-medium tracking-normal text-muted">/ month</span>
            </p>
            <p className="num mt-2 text-[13px] text-muted">
              {converted !== null && <>≈ {formatMoney(converted, target, prefs)} · </>}
              {formatPercent(r.effectiveTaxRate, prefs)} effective tax rate
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Enter a salary to see your take-home pay.</p>
        )}
      </div>
      <ButtonLink to={`/calculator?${scenarioToQuery({ ...draft, targetCurrency: target })}`} variant="primary" className="mt-4 w-full">
        Full breakdown and circumstances <ArrowRight size={16} />
      </ButtonLink>
    </Card>
  );
}

function SalaryExamples({ content, year, currency }: { content: CountryContent; year: number; currency: string }) {
  const prefs = usePrefs();
  const rows = content.examples
    .map((amount) => ({ amount, r: calculateDraft({ country: content.code, taxYear: year, amount, frequency: 'monthly', hoursPerWeek: 40, location: '', mode: 'simple', personal: {} }).result }))
    .filter((x) => x.r);
  const payments = rows[0]?.r ? Math.round(rows[0].r.grossAnnual / rows[0].amount) : 12;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" tabIndex={0} role="region" aria-label="Salary examples table">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="px-5 pt-4 text-left text-xs leading-relaxed text-faint">
          Calculated by the NetWorth engine with the {year} rules: single employee, standard circumstances, default {content.code === 'DE' ? 'state' : 'location'}
          {payments !== 12 ? `, ${payments} salary payments a year` : ''}. Monthly figures = annual ÷ 12.
        </caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="px-5 py-3 font-medium">
              Gross / month
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Income tax
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Contributions
            </th>
            <th scope="col" className="px-3 py-3 text-right font-medium">
              Take-home / month
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Effective rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ amount, r }) =>
            r ? (
              <tr key={amount} className="border-t border-line">
                <th scope="row" className="mono px-5 py-3 text-left font-normal text-ink">
                  {formatMoney(amount, currency, prefs)}
                </th>
                <td className="mono px-3 py-3 text-right text-muted">−{formatMoney(r.incomeTax / 12, currency, prefs)}</td>
                <td className="mono px-3 py-3 text-right text-muted">−{formatMoney((r.socialContributions + r.otherMandatory) / 12, currency, prefs)}</td>
                <td className="mono px-3 py-3 text-right font-semibold text-ink">{formatMoney(r.netMonthly, currency, prefs)}</td>
                <td className="mono px-5 py-3 text-right text-ink">{formatPercent(r.effectiveTaxRate, prefs)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CountryPage({ code }: { code: string }) {
  const info = publicCountries().find((c) => c.code === code);
  const content = info ? countryContent(code, info.year) : null;
  if (!info || !content) return null;
  const { meta } = taxRegistry.getDataset(code, info.year);
  const related = content.related.map((c) => publicCountries().find((p) => p.code === c)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Countries', path: '/countries' }, { name: info.name, path: `/countries/${info.slug}` }]} />}
        title={`${info.name} salary calculator ${info.year}`}
        description={content.intro}
      >
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
          <StatusBadge status={meta.verificationStatus} />
          <span>Tax year {info.year}</span>
          <span>Dataset v{meta.version}</span>
          <span>Last checked {formatDate(meta.lastVerified)}</span>
          <span>Paid in {info.currency}</span>
        </div>
      </PageHeader>
      <Container>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 lg:order-2">
            <CountryCalculator code={code} year={info.year} />
          </div>
          <article className="prose-nw min-w-0 lg:order-1">
            <h2 className="!mt-0">Salary examples</h2>
            <div className="not-prose">
              <SalaryExamples content={content} year={info.year} currency={info.currency} />
            </div>
            {content.sections.map((s) => (
              <section key={s.id} aria-labelledby={`s-${s.id}`}>
                <h2 id={`s-${s.id}`}>{s.title}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {s.bullets && (
                  <ul>
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <h2 id="faq">Frequently asked questions</h2>
            <div className="not-prose divide-y divide-line border-y border-line">
              {content.faq.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink">
                    {f.q}
                    <span className="text-xl font-light leading-none text-faint transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 pr-8 text-[15px] leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>

            <h2 id="sources">Official sources and methodology</h2>
            <p>
              {STATUS_COPY[meta.verificationStatus].text} The {info.year} dataset (v{meta.version}) applies from {formatDate(meta.effectiveDate)}.
            </p>
            <ul className="not-prose mt-3 space-y-2">
              {meta.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-sm text-accent hover:underline">
                    <ExternalLink size={13} className="mt-1 shrink-0" aria-hidden="true" />
                    <span>
                      {s.title} <span className="text-faint">— {s.authority}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {meta.unverified.length > 0 && (
              <>
                <h3>Not yet confirmed against a primary source</h3>
                <ul>
                  {meta.unverified.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </>
            )}
            <p>
              Read how every country is calculated in the <Link to="/methodology">methodology</Link>.
            </p>
          </article>
        </div>

        <section aria-labelledby="related-heading" className="mt-16 border-t border-line pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="related-heading" className="text-xl font-semibold tracking-[-0.01em] text-ink">
                Compare {info.name} with other countries
              </h2>
              <p className="mt-1 text-sm text-muted">See what the same job is worth after tax elsewhere.</p>
            </div>
            <ButtonLink to="/compare" variant="secondary">
              Compare offers <ArrowRight size={15} />
            </ButtonLink>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {related.map((c) => (
              <li key={c.code}>
                <Link to={`/countries/${c.slug}`} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:border-line-strong">
                  <span className="inline-flex items-center gap-2.5">
                    <Flag code={c.code} /> {c.name} salary calculator
                  </span>
                  <ArrowRight size={15} className="text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}

export function CountriesPage() {
  const countries = publicCountries();
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Countries', path: '/countries' }]} />}
        title="Salary calculators by country"
        description="How employees are taxed in each country NetWorth supports, with a calculator, worked examples and the official sources behind the numbers."
      />
      <Container>
        <ul className="grid gap-4 md:grid-cols-2">
          {countries.map((c) => {
            const content = countryContent(c.code, c.year);
            const { meta } = taxRegistry.getDataset(c.code, c.year);
            return (
              <li key={c.code}>
                <Link to={`/countries/${c.slug}`} className="group block h-full rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="inline-flex items-center gap-2.5 text-lg font-semibold text-ink">
                      <Flag code={c.code} /> {c.name}
                    </h2>
                    <StatusBadge status={meta.verificationStatus} />
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{content?.intro}</p>
                  <p className="mt-4 flex items-center justify-between text-sm">
                    <span className="mono text-faint">
                      {c.currency} · {c.year} · v{meta.version}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-accent">
                      Open <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </>
  );
}
