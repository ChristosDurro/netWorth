import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { STATUS_COPY } from '../components/calculator/Results';
import { DISCLAIMER } from '../components/common/disclaimer';
import { Flag } from '../components/common/Flag';
import { Badge, Card, Notice, SectionTitle } from '../components/common/ui';
import { taxRegistry } from '../data/taxData';
import { formatDate } from '../utils/format';

function Prose({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-base font-semibold text-ink">{title}</h3>
      <div className="space-y-2.5 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

const COUNTRY_SCOPE: Record<string, string> = {
  DK: 'AM-bidrag (8%), ATP, bottom/middle/top/top-top state tax, municipal tax for all 98 municipalities, optional church tax, employment and job deductions, personal allowance and the tax ceiling.',
  DE: 'Wage tax by the BMF payroll algorithm (PAP) for tax classes I–VI, solidarity surcharge, church tax by state, pension, health (with insurer additional rate), long-term care (children/age/Saxony) and unemployment insurance up to their ceilings.',
  NL: 'Box 1 rates including national insurance, general tax credit, labour tax credit, optional 30% ruling and holiday allowance, employee pension contribution.',
  SE: 'Municipal + regional tax for all 290 municipalities, state tax, basic allowance, earned-income tax credit, general pension fee and its credit, tax credit on earned income, public service fee, burial fee and optional church fee.',
  NO: 'Tax on general income (22%), minimum deduction, personal allowance, five-step bracket tax, national insurance with its low-income limit, Finnmark/Nord-Troms zone.',
  GR: 'Employee e-EFKA contributions up to the insurable ceiling, the 2026 employment-income scale by number of children, youth rates (≤25 and 26–30) and the art. 16 tax reduction; 12 or 14 salary payments.',
};

export function MethodologyPage() {
  const countries = taxRegistry.listCountries();
  return (
    <div className="space-y-6">
      <Notice tone="warn">{DISCLAIMER}</Notice>

      <Card className="p-5 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-2">
          <Prose title="From gross to net">
            <p>
              Your salary is first converted to an annual gross amount in the employment country's currency: monthly salaries are multiplied by the number of salary payments (12, or 14 for Greek private-sector pay), hourly pay by weekly hours × 52 paid weeks.
            </p>
            <p>
              The country module then applies that country's rules for the selected tax year in the order its tax authority prescribes: social contributions, deductions and allowances, the income-tax scale, tax credits and local taxes. Amounts are not rounded in between, except where the official payroll rules round (for example the German PAP or the Swedish tax tables).
            </p>
            <p>Net pay = gross pay − income tax − social contributions − other mandatory levies − optional pension contributions you choose to enter.</p>
          </Prose>
          <Prose title="How tax brackets work">
            <p>
              Progressive brackets are marginal: each rate applies only to the part of income inside its band. Moving into a higher bracket never lowers your net pay; only the extra income is taxed at the higher rate.
            </p>
            <p>
              The <strong className="text-ink">effective tax rate</strong> is total income tax and mandatory contributions divided by gross pay. The <strong className="text-ink">marginal rate</strong> is how much of a small raise (1% of gross) you would lose to tax and contributions.
            </p>
          </Prose>
          <Prose title="Exchange rates">
            <p>
              Taxes are always calculated in the employment currency. Only the resulting net salary is converted, using European Central Bank reference rates from{' '}
              <a href="https://frankfurter.dev/" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
                Frankfurter
              </a>{' '}
              (free, no account). The rate date is always shown.
            </p>
            <p>
              Rates are cached on your device for six hours. If the service is unreachable the last known rate is used and clearly labelled as not current; you can also enter your own rate or pick a historical date.
            </p>
          </Prose>
          <Prose title="Verification levels">
            {(['verified', 'estimated', 'incomplete'] as const).map((s) => (
              <p key={s}>
                <Badge tone={STATUS_COPY[s].tone}>{STATUS_COPY[s].label}</Badge> <span className="ml-1">{STATUS_COPY[s].text}</span>
              </p>
            ))}
            <p>Each tax year has its own versioned dataset. A calculation for 2026 always uses 2026 rules, and announced future changes are never applied early.</p>
          </Prose>
          <Prose title="Not included">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Other income (capital gains, rental, self-employment) and wealth or property taxes.</li>
              <li>Itemised deductions such as commuting, interest, union fees or private pension savings, unless offered as an input.</li>
              <li>Benefits in kind (company car, housing), bonuses and equity, double-taxation treaties and split-year residency.</li>
              <li>Employer-paid contributions — they do not affect take-home pay.</li>
              <li>Family benefits paid out by the state (child benefit etc.).</li>
            </ul>
          </Prose>
          <Prose title="Privacy">
            <p>NetWorth runs entirely in your browser. Salaries, settings and saved calculations are stored only in this browser's local storage; the only network request is for exchange rates.</p>
          </Prose>
        </div>
      </Card>

      <div>
        <SectionTitle hint="What each country module covers, its data status and the official documents it is based on.">Countries & sources</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          {countries.map((c) =>
            c.years.map((y) => {
              const { meta } = taxRegistry.getDataset(c.code, y);
              return (
                <Card key={`${c.code}-${y}`} as="article" className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 text-base font-semibold text-ink">
                      <Flag code={c.code} /> {c.name} · {y}
                    </h3>
                    <Badge tone={STATUS_COPY[meta.verificationStatus].tone}>{STATUS_COPY[meta.verificationStatus].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    Dataset v{meta.version} · effective {formatDate(meta.effectiveDate)} · last verified {formatDate(meta.lastVerified)}
                  </p>
                  {COUNTRY_SCOPE[c.code] && <p className="mt-3 text-[13px] leading-relaxed text-muted">{COUNTRY_SCOPE[c.code]}</p>}
                  <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Official sources</h4>
                  <ul className="space-y-1.5">
                    {meta.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-[13px] text-accent hover:underline">
                          <ExternalLink size={12} className="mt-1 shrink-0" />
                          <span>
                            {s.title} <span className="text-faint">— {s.authority}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  {(meta.limitations.length > 0 || meta.unverified.length > 0) && (
                    <details className="mt-4 text-[13px] text-muted">
                      <summary className="cursor-pointer font-medium text-ink">Limitations and open points</summary>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                        {[...meta.limitations, ...meta.unverified.map((u) => `Unconfirmed: ${u}`)].map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
