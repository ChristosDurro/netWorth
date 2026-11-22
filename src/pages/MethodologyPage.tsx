import { ExternalLink } from 'lucide-react';
import { StatusBadge, STATUS_COPY } from '../components/calculator/Results';
import { DISCLAIMER } from '../components/common/disclaimer';
import { Flag } from '../components/common/Flag';
import { Card, Notice } from '../components/common/ui';
import { Breadcrumbs, Container, PageHeader } from '../components/layout/Layout';
import { publicCountries } from '../content/countries';
import { taxRegistry } from '../data/taxData';
import { Link } from '../router';
import { PAID_WEEKS_PER_YEAR } from '../utils/salary';
import { formatDate, formatMoney } from '../utils/format';

const COUNTRY_SCOPE: Record<string, string> = {
  DK: 'AM-bidrag (8%), ATP, bottom/middle/top/top-top state tax, municipal tax for all 98 municipalities, optional church tax, employment and job deductions, personal allowance and the tax ceiling.',
  DE: 'Wage tax by the BMF payroll algorithm (PAP) for tax classes I–VI, solidarity surcharge, church tax by state, pension, health (with insurer additional rate), long-term care (children/age/Saxony) and unemployment insurance up to their ceilings.',
  NL: 'Box 1 rates including national insurance, general tax credit, labour tax credit, optional 30% ruling and holiday allowance, employee pension contribution.',
  SE: 'Municipal + regional tax for all 290 municipalities, state tax, basic allowance, earned-income tax credit, general pension fee and its credit, tax credit on earned income, public service fee, burial fee and optional church fee.',
  NO: 'Tax on general income (22%), minimum deduction, personal allowance, five-step bracket tax, national insurance with its low-income limit, Finnmark/Nord-Troms zone.',
  GR: 'Employee e-EFKA contributions up to the insurable ceiling, the 2026 employment-income scale by number of children, youth rates (≤25 and 26–30) and the art. 16 tax reduction; 12 or 14 salary payments.',
};

const TOC: [string, string][] = [
  ['overview', 'From gross to net'],
  ['frequency', 'Monthly, annual and hourly pay'],
  ['income-tax', 'Income tax and brackets'],
  ['credits', 'Deductions, allowances and credits'],
  ['social', 'Social contributions'],
  ['local', 'Municipalities and regions'],
  ['currency', 'Currency conversion'],
  ['verification', 'How tax data is verified'],
  ['differences', 'Why payroll may differ'],
  ['limitations', 'Assumptions and limitations'],
  ['sources', 'Countries and sources'],
];

/** Worked example from the live Dutch dataset, so the numbers on this page are never invented. */
function BracketExample() {
  const nl = publicCountries().find((c) => c.code === 'NL');
  if (!nl) return null;
  const rules = taxRegistry.getDataset('NL', nl.year).rules as { brackets: { upTo: number | null; rate: number }[] };
  const income = 60000;
  let prev = 0;
  const rows = rules.brackets
    .map((b) => {
      const top = b.upTo ?? Infinity;
      const part = Math.max(0, Math.min(income, top) - prev);
      const row = { from: prev, to: b.upTo, rate: b.rate, part, tax: part * b.rate };
      prev = top;
      return row;
    })
    .filter((r) => r.part > 0);
  const p = { numberLocale: 'en-US', showDecimals: false };
  return (
    <figure className="not-prose my-5 overflow-x-auto rounded-lg border border-line" tabIndex={0} aria-label="Worked example: progressive tax brackets">
      <table className="w-full text-sm">
        <caption className="px-4 pt-3 text-left text-xs text-faint">Dutch Box 1 rates for {nl.year}, applied to €60,000 of taxable income (before tax credits).</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-medium">
              Income band
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Rate
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Income in band
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Tax
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.from} className="border-t border-line">
              <td className="mono px-4 py-2 text-ink">
                {formatMoney(r.from, 'EUR', p)} – {r.to ? formatMoney(r.to, 'EUR', p) : '…'}
              </td>
              <td className="mono px-4 py-2 text-right text-ink">{(r.rate * 100).toFixed(2)}%</td>
              <td className="mono px-4 py-2 text-right text-ink">{formatMoney(r.part, 'EUR', p)}</td>
              <td className="mono px-4 py-2 text-right text-ink">{formatMoney(r.tax, 'EUR', p)}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold">
            <td className="px-4 py-2 text-ink" colSpan={3}>
              Total before credits
            </td>
            <td className="mono px-4 py-2 text-right text-ink">{formatMoney(rows.reduce((s, r) => s + r.tax, 0), 'EUR', p)}</td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
}

export function MethodologyPage() {
  const countries = taxRegistry.listCountries();
  return (
    <>
      <PageHeader title="How NetWorth calculates" description="The method behind every number, in plain language — and how far you can rely on it." eyebrow={<Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Methodology', path: '/methodology' }]} />} />
      <Container>
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="On this page" className="no-print hidden lg:block">
            <ol className="sticky top-24 space-y-1.5 border-l border-line pl-4 text-[13px]">
              {TOC.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-muted hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="prose-nw max-w-3xl">
            <Notice tone="info">{DISCLAIMER}</Notice>

            <h2 id="overview">From gross to net</h2>
            <p>NetWorth follows the order of a payslip. Your gross salary is turned into an annual amount in the currency you are paid in. That country’s rules for the selected tax year are applied — social contributions, allowances and deductions, the income-tax scale, tax credits and any local taxes — and what is left is your take-home pay.</p>
            <p>
              <strong>Take-home pay = gross salary − income tax − social contributions − other mandatory levies − any pension contribution you choose to enter.</strong>
            </p>
            <p>Amounts are not rounded along the way, except where the official payroll method rounds (for example the German wage-tax algorithm or the Swedish tax tables).</p>

            <h2 id="frequency">Monthly, annual and hourly pay</h2>
            <ul>
              <li>
                <strong>Monthly</strong> salaries are multiplied by the number of salary payments a year: 12 in most countries, 14 for Greek private-sector employees (Christmas, Easter and holiday bonuses).
              </li>
              <li>
                <strong>Annual</strong> salaries are used as they are.
              </li>
              <li>
                <strong>Hourly</strong> pay is multiplied by your weekly hours and {PAID_WEEKS_PER_YEAR} paid weeks — employees in every supported country are paid during holidays.
              </li>
            </ul>
            <p>Results always show take-home pay per month as the annual amount divided by 12, so countries with 12 and 14 payments compare fairly. Where pay comes in more instalments, the amount per payment is shown under advanced details.</p>

            <h2 id="income-tax">Income tax and progressive brackets</h2>
            <p>Most income taxes are progressive: income is divided into bands and each band has its own rate. A higher rate only applies to the part of your income inside that band, so a raise never lowers your take-home pay.</p>
            <BracketExample />
            <p>
              The <strong>effective tax rate</strong> is everything deducted (income tax plus contributions) divided by gross pay. The <strong>marginal rate</strong> is the share of a small raise — 1% of gross — that you would lose. The marginal rate is usually much higher than the effective rate.
            </p>

            <h2 id="credits">Deductions, allowances and credits</h2>
            <p>Countries reduce tax in different ways. A <strong>tax-free allowance</strong> removes the first part of income from tax (Denmark, Germany, Norway). A <strong>deduction</strong> lowers the income that is taxed (the Danish employment deduction, the Norwegian minimum deduction). A <strong>tax credit</strong> is subtracted from the tax itself (the Dutch general and labour tax credits, the Swedish earned-income tax credit, the Greek tax reduction). NetWorth applies the ones every employee receives automatically; personal deductions such as interest or commuting are not included.</p>

            <h2 id="social">Social contributions</h2>
            <p>Employees pay contributions for pensions, health care and unemployment insurance. Some are a flat percentage of pay up to an annual ceiling (Germany, Greece), some are part of the income-tax rate (the Netherlands), and some are small because welfare is funded through general taxes (Denmark). Employer contributions are not deducted from your pay and are not shown.</p>

            <h2 id="local">Municipalities and regions</h2>
            <p>In Denmark and Sweden the largest part of income tax is set by your municipality, so NetWorth includes every municipality with its official rate for the tax year. In Germany your state only affects church tax and, in Saxony, care insurance. In Norway the Finnmark and Nord-Troms zone has lower rates. Elsewhere location does not change the result.</p>

            <h2 id="currency">Currency conversion</h2>
            <p>Tax is always calculated in the currency you are paid in. Only the take-home pay is converted, so exchange rates never affect how much tax is calculated.</p>
            <ul>
              <li>Rates are European Central Bank reference rates from the free Frankfurter service, published on working days. The rate date is always shown.</li>
              <li>Rates are cached in your browser for six hours. If the service cannot be reached, the last known rate — or a built-in fallback — is used and clearly labelled as not current.</li>
              <li>You can choose a historical date or enter your own rate.</li>
              <li>ECB rates are mid-market reference rates. Banks and transfer services add a margin, so the amount you receive is usually slightly lower.</li>
            </ul>

            <h2 id="verification">How tax data is verified</h2>
            <p>Each country’s rules for each tax year live in a versioned dataset (for example <span className="mono text-ink">DK 2026.1</span>) with its official sources, effective date and the date it was last checked. Every result carries one of three labels:</p>
            <dl className="not-prose my-4 space-y-3">
              {(['verified', 'estimated', 'incomplete'] as const).map((s) => (
                <div key={s} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <dt className="w-28 shrink-0">
                    <StatusBadge status={s} />
                  </dt>
                  <dd className="text-[15px] leading-relaxed text-muted">{STATUS_COPY[s].text}</dd>
                </div>
              ))}
            </dl>
            <p>Datasets are maintained with a local review tool that checks official sources, shows detected changes side by side and requires manual approval. Before a new version goes live it is validated, every regression test and official reference calculation is run, and it can be rolled back. Tax changes are never published automatically, and a calculation for a tax year only ever uses that year’s rules.</p>

            <h2 id="differences">Why payroll may differ</h2>
            <ul>
              <li>Bonuses, overtime, benefits in kind (company car, housing) and equity are not included.</li>
              <li>Personal deductions registered with your tax office, or your employer’s pension scheme rules, change monthly withholding.</li>
              <li>Payroll withholds tax month by month; the final tax for the year is settled in your tax return.</li>
              <li>Split-year residency, double-taxation treaties and special regimes for incoming workers are not modelled (except the Dutch 30% ruling).</li>
            </ul>

            <h2 id="limitations">Assumptions and limitations</h2>
            <ul>
              <li>A full-year tax resident employee with no other income.</li>
              <li>Standard personal circumstances unless you change them in the calculator.</li>
              <li>Not included: capital, rental or self-employment income; wealth and property taxes; employer-paid contributions; family benefits paid by the state.</li>
            </ul>
            <p>
              Each country’s dataset lists its own limitations and anything not yet confirmed against a primary source — see below and in every result. Read the full <Link to="/disclaimer">disclaimer</Link>.
            </p>

            <h2 id="sources">Countries and sources</h2>
          </article>
        </div>
        <div className="mt-6 grid gap-4 lg:ml-[260px] lg:grid-cols-2">
          {countries.map((c) =>
            c.years.map((y) => {
              const { meta } = taxRegistry.getDataset(c.code, y);
              const pub = publicCountries().find((p) => p.code === c.code);
              return (
                <Card key={`${c.code}-${y}`} as="article" className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 text-base font-semibold text-ink">
                      <Flag code={c.code} /> {pub ? <Link to={`/countries/${pub.slug}`}>{c.name}</Link> : c.name} · {y}
                    </h3>
                    <StatusBadge status={meta.verificationStatus} />
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    Dataset v{meta.version} · effective {formatDate(meta.effectiveDate)} · last checked {formatDate(meta.lastVerified)}
                  </p>
                  {COUNTRY_SCOPE[c.code] && <p className="mt-3 text-[13px] leading-relaxed text-muted">{COUNTRY_SCOPE[c.code]}</p>}
                  <h4 className="mb-1.5 mt-4 text-xs font-semibold text-muted">Official sources</h4>
                  <ul className="space-y-1.5">
                    {meta.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-[13px] text-accent hover:underline">
                          <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden="true" />
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
      </Container>
    </>
  );
}
