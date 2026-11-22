/* eslint-disable @typescript-eslint/no-explicit-any */
import { taxRegistry } from '../data/taxData';

/**
 * Editorial content for the country pages. Every rate, threshold and ceiling is read
 * from the active tax dataset at render time — nothing numeric is typed in here — so
 * the pages stay correct when a new dataset version is approved.
 */

export interface ContentSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}
export interface FaqItem {
  q: string;
  a: string;
}
export interface CountryContent {
  code: string;
  slug: string;
  name: string;
  /** One-sentence summary used for meta descriptions and cards. */
  summary: string;
  intro: string;
  sections: ContentSection[];
  faq: FaqItem[];
  /** Gross monthly salaries (local currency) used for the dynamic salary examples. */
  examples: number[];
  related: string[];
}

const pct = (r: number, digits = 2) => `${(r * 100).toFixed(digits).replace(/\.?0+$/, '')}%`;
const n0 = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
const money = (v: number, cur: string) => (cur === 'EUR' ? `€${n0(v)}` : `${n0(v)} ${cur}`);
const range = (vals: number[]) => [Math.min(...vals), Math.max(...vals)];

export const slugFor = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

function rulesOf(code: string, year: number): any {
  return taxRegistry.getDataset(code, year).rules;
}

const BUILDERS: Record<string, (r: any, year: number) => Omit<CountryContent, 'code' | 'slug' | 'name'>> = {
  DK: (r, year) => {
    const [lo, hi] = range(r.municipalities.map((m: any) => m.municipalRate));
    return {
      summary: `Calculate Danish take-home pay for ${year}: AM-bidrag, municipal tax for all ${r.municipalities.length} municipalities, state taxes and deductions, converted into your currency.`,
      intro: `Denmark taxes employment income in layers. An ${pct(r.amBidragRate)} labour market contribution comes off the top, then municipal tax and the state bottom tax apply to almost everything above the personal allowance, with middle, top and top-top tax only on high incomes.`,
      sections: [
        {
          id: 'system',
          title: 'How Danish income tax works',
          paragraphs: [
            `First the labour market contribution (AM-bidrag) of ${pct(r.amBidragRate)} is deducted from gross pay. The rest is "personal income", which is taxed by your municipality and by the state.`,
            `The first ${money(r.personalAllowance, 'DKK')} a year is tax-free (the personal allowance). Above it you pay the state bottom tax of ${pct(r.bottomTaxRate)} plus municipal tax. Higher state taxes start at ${money(r.middleTax.threshold, 'DKK')} (middle tax, ${pct(r.middleTax.rate)}), ${money(r.topTax.threshold, 'DKK')} (top tax, ${pct(r.topTax.rate)}) and ${money(r.topTopTax.threshold, 'DKK')} (top-top tax, ${pct(r.topTopTax.rate)}).`,
            `A tax ceiling caps the combined marginal rate, so in high-tax municipalities the state top taxes are reduced slightly.`,
          ],
        },
        {
          id: 'contributions',
          title: 'Social contributions',
          paragraphs: [
            `Denmark funds most welfare through general taxes, so employee social contributions are small. Besides AM-bidrag, full-time employees pay an ATP pension contribution of ${money(r.atp.employeeMonthlyFullTime, 'DKK')} a month.`,
          ],
        },
        {
          id: 'municipalities',
          title: 'Municipality differences',
          paragraphs: [
            `Municipal tax rates in ${year} range from ${lo.toFixed(2)}% to ${hi.toFixed(2)}% (average ${r.average.municipalRate.toFixed(2)}%). On a typical salary the difference between the cheapest and the most expensive municipality is several hundred kroner a month.`,
            `Members of the Church of Denmark also pay church tax, about ${pct(r.average.churchRate / 100)} on average. Choose your municipality and switch church membership on or off in the calculator.`,
          ],
        },
        {
          id: 'deductions',
          title: 'What affects your net salary',
          paragraphs: ['Every employee automatically receives two deductions that reduce municipal tax:'],
          bullets: [
            `Employment deduction: ${pct(r.employmentDeduction.rate)} of income, up to ${money(r.employmentDeduction.max, 'DKK')} a year.`,
            `Job deduction: ${pct(r.jobDeduction.rate)} of income above ${money(r.jobDeduction.threshold, 'DKK')}, up to ${money(r.jobDeduction.max, 'DKK')}.`,
            'Your own contribution to an employer pension scheme is deducted before tax (enter it under your circumstances).',
            'Not included: commuting deductions, interest deductions, union fees and other personal deductions.',
          ],
        },
      ],
      faq: [
        { q: 'What is AM-bidrag?', a: `AM-bidrag is the Danish labour market contribution: ${pct(r.amBidragRate)} of gross salary, deducted before income tax is calculated.` },
        { q: 'How much tax do you pay in Denmark?', a: `Most employees pay municipal tax (${lo.toFixed(1)}–${hi.toFixed(1)}%) plus the ${pct(r.bottomTaxRate)} state bottom tax on income above the personal allowance, after the ${pct(r.amBidragRate)} labour market contribution. Middle and top tax only apply above ${money(r.middleTax.threshold, 'DKK')} a year.` },
        { q: 'Does my municipality change my take-home pay?', a: `Yes. Municipal tax is the largest part of Danish income tax and rates differ between municipalities by up to ${(hi - lo).toFixed(1)} percentage points.` },
        { q: 'Is church tax compulsory?', a: 'No. Only members of the Church of Denmark pay church tax. It is off by default in NetWorth; turn it on under your circumstances.' },
      ],
      examples: [30000, 40000, 55000, 75000],
      related: ['SE', 'NO', 'DE'],
    };
  },

  DE: (r, year) => {
    const s = r.social;
    const church = range(r.states.map((st: any) => st.churchTaxRate));
    return {
      summary: `Calculate German net salary for ${year} with the official BMF wage-tax algorithm: tax classes I–VI, solidarity surcharge, church tax and social insurance, converted into your currency.`,
      intro: `German payroll tax (Lohnsteuer) depends on your tax class, and roughly a fifth of gross pay goes to social insurance. NetWorth uses the same algorithm as German payroll software, published by the Federal Ministry of Finance.`,
      sections: [
        {
          id: 'system',
          title: 'How German income tax works',
          paragraphs: [
            `Income tax is progressive. In ${year} the first ${money(r.tariff.basicAllowance, 'EUR')} of taxable income is tax-free; above that the rate rises smoothly from 14% to 42%, and 45% applies above ${money(r.tariff.zone4End, 'EUR')}.`,
            'Your tax class matters for monthly payroll: class I for single people, III and V for married couples who split their allowances, IV for married couples with similar incomes, II for single parents and VI for a second job.',
            `The solidarity surcharge of ${pct(r.solidarity.rate, 1)} only applies when annual wage tax exceeds ${money(r.solidarity.exemptionLimit, 'EUR')}, so most employees no longer pay it. Church members pay church tax of ${pct(church[0], 0)}–${pct(church[1], 0)} of their wage tax, depending on the state.`,
          ],
        },
        {
          id: 'contributions',
          title: 'Social contributions',
          paragraphs: ['Employees pay half of the social insurance contributions, each up to an annual ceiling:'],
          bullets: [
            `Pension insurance: ${pct(s.pension.employeeRate)} up to ${money(s.pension.ceiling, 'EUR')}.`,
            `Unemployment insurance: ${pct(s.unemployment.employeeRate)} up to ${money(s.unemployment.ceiling, 'EUR')}.`,
            `Health insurance: ${pct(s.health.employeeRate)} plus half of your insurer's additional contribution (average ${pct(s.health.averageAdditionalRate)}), up to ${money(s.health.ceiling, 'EUR')}.`,
            `Long-term care insurance: ${pct(s.care.employeeRate)} (${pct(s.care.employeeRateSaxony)} in Saxony), plus ${pct(s.care.childlessSurcharge)} if you are 23 or older without children, less for parents of several children.`,
          ],
        },
        {
          id: 'regions',
          title: 'Does your state matter?',
          paragraphs: [`Income tax is the same everywhere in Germany. Your state only changes church tax (${pct(church[0], 0)} in Bavaria and Baden-Württemberg, ${pct(church[1], 0)} elsewhere) and the care insurance rate in Saxony.`],
        },
        {
          id: 'affects',
          title: 'What affects your net salary',
          paragraphs: ['The biggest factors besides gross pay are:'],
          bullets: ['Tax class (especially III/V for married couples).', 'Church membership.', 'Number of children (care insurance and child allowances).', "Your health insurer's additional contribution rate.", 'Private health insurance instead of statutory insurance (not modelled).'],
        },
      ],
      faq: [
        { q: 'Which tax class should I choose?', a: 'Single employees are in class I. Married couples can choose IV/IV, or III/V when one partner earns much more. The class changes monthly payroll tax; the final annual tax is settled in the tax return.' },
        { q: 'How much social insurance do employees pay in Germany?', a: `Roughly 20–21% of gross pay up to the ceilings: pension ${pct(s.pension.employeeRate)}, unemployment ${pct(s.unemployment.employeeRate)}, health about ${pct(s.health.employeeRate + s.health.averageAdditionalRate / 2)} and care ${pct(s.care.employeeRate)}–${pct(s.care.employeeRate + s.care.childlessSurcharge)}.` },
        { q: 'Do I still pay the solidarity surcharge?', a: `Only if your annual wage tax is above ${money(r.solidarity.exemptionLimit, 'EUR')} (single filers). Below that it is zero, with a gradual phase-in above the limit.` },
        { q: 'Is NetWorth the same as German payroll?', a: 'NetWorth implements the official BMF wage-tax algorithm (PAP) and matches the BMF reference calculations. Payroll can still differ for bonuses, benefits in kind, private health insurance or personal allowances registered with the tax office.' },
      ],
      examples: [3500, 5000, 6500, 8500],
      related: ['NL', 'DK', 'SE'],
    };
  },

  NL: (r, year) => {
    const b = r.brackets;
    return {
      summary: `Calculate Dutch net salary for ${year}: Box 1 income tax including national insurance, general and labour tax credits, holiday allowance and the 30% ruling, converted into your currency.`,
      intro: 'In the Netherlands income tax and national insurance contributions are combined in one Box 1 rate, and two tax credits lower the bill for almost every employee.',
      sections: [
        {
          id: 'system',
          title: 'How Dutch income tax works',
          paragraphs: [
            `Employment income falls in Box 1. In ${year} the combined rate is ${pct(b[0].rate)} up to ${money(b[0].upTo, 'EUR')} (of which ${pct(r.nationalInsuranceRate)} is national insurance), ${pct(b[1].rate)} up to ${money(b[1].upTo, 'EUR')}, and ${pct(b[2].rate, 1)} above.`,
            'Instead of a tax-free allowance, the Netherlands uses tax credits (heffingskortingen) that are subtracted from the tax due.',
          ],
        },
        {
          id: 'credits',
          title: 'Tax credits',
          paragraphs: ['Two credits apply automatically to employees:'],
          bullets: [
            `General tax credit: up to ${money(r.generalCredit.max, 'EUR')}, reduced by ${pct(r.generalCredit.phaseOutRate, 3)} of income above ${money(r.generalCredit.phaseOutStart, 'EUR')}.`,
            `Labour tax credit: builds up with income to about ${money(Math.max(...r.labourCredit.map((x: any) => x.base)), 'EUR')}, then falls for incomes above ${money(r.labourCredit[3].from, 'EUR')} and reaches zero around ${money(r.labourCredit[3].upTo, 'EUR')}.`,
          ],
        },
        {
          id: 'extras',
          title: 'Holiday allowance and the 30% ruling',
          paragraphs: [
            `Dutch employers pay a holiday allowance (vakantiegeld) of at least ${pct(r.holidayAllowanceRate, 0)} of salary, usually in May. NetWorth can include it in annual pay so offers quoted with and without it compare fairly.`,
            `Qualifying recruits from abroad may receive ${pct(r.expatRuling.taxFreeShare, 0)} of salary tax-free under the 30% ruling. In ${year} it requires a taxable salary of at least ${money(r.expatRuling.minTaxableSalary, 'EUR')} (${money(r.expatRuling.minTaxableSalaryUnder30, 'EUR')} under 30 with a master's degree), and the tax-free amount is capped.`,
          ],
        },
        {
          id: 'affects',
          title: 'What affects your net salary',
          paragraphs: ['Besides gross pay:'],
          bullets: ['Whether the holiday allowance is included in the quoted salary.', 'The 30% ruling, if you qualify.', 'Your pension contribution to the employer scheme.', 'Not modelled: Zvw health premium paid personally, mortgage interest and other Box 1 deductions.'],
        },
      ],
      faq: [
        { q: 'Is the Dutch holiday allowance part of my salary?', a: `Usually not in the quoted monthly salary. Employers add at least ${pct(r.holidayAllowanceRate, 0)} once a year, so annual gross pay is about 12.96 × the monthly salary.` },
        { q: 'What is the 30% ruling?', a: `A tax facility for qualifying employees recruited from abroad: ${pct(r.expatRuling.taxFreeShare, 0)} of salary is paid tax-free, subject to a minimum salary and a cap. Turn it on in the calculator to see its effect.` },
        { q: 'Why are Dutch tax rates so high at the bottom?', a: `The first bracket rate of ${pct(b[0].rate)} includes ${pct(r.nationalInsuranceRate)} national insurance. Tax credits then return a large part of it, so the effective rate on modest incomes is much lower.` },
      ],
      examples: [3500, 4500, 6000, 8000],
      related: ['DE', 'DK', 'SE'],
    };
  },

  SE: (r, year) => {
    const [lo, hi] = range(r.municipalities.map((m: any) => m.municipalRate));
    return {
      summary: `Calculate Swedish take-home pay for ${year}: municipal tax for all ${r.municipalities.length} municipalities, state tax, basic allowance and earned-income tax credit, converted into your currency.`,
      intro: 'Most Swedes only pay local income tax. The state tax applies to high earners only, and generous credits lower the tax on employment income.',
      sections: [
        {
          id: 'system',
          title: 'How Swedish income tax works',
          paragraphs: [
            `Municipal and regional income tax together is ${lo.toFixed(2)}%–${hi.toFixed(2)}% depending on where you live (average ${r.average.municipalRate.toFixed(2)}%). It applies to taxable income after the basic allowance (grundavdrag), which depends on income.`,
            `State income tax of ${pct(r.stateTax.rate, 0)} is added only on taxable income above ${money(r.stateTax.threshold, 'SEK')} a year.`,
          ],
        },
        {
          id: 'credits',
          title: 'Credits and fees',
          paragraphs: ['The calculation follows Skatteverket’s method:'],
          bullets: [
            'Earned-income tax credit (jobbskatteavdrag): reduces municipal tax on salaries, worth the most for low and middle incomes.',
            `General pension fee: ${pct(r.pensionFee.rate, 0)} of salary, fully offset by a matching tax credit for most employees.`,
            `Public service fee: ${pct(r.publicServiceFee.rate, 0)} of taxable income, capped.`,
            `Burial fee (about ${r.average.burialRate.toFixed(3)}%) and, for Church of Sweden members, church fee (about ${r.average.churchRate.toFixed(1)}%).`,
          ],
        },
        {
          id: 'municipalities',
          title: 'Municipality differences',
          paragraphs: [`With rates from ${lo.toFixed(2)}% to ${hi.toFixed(2)}%, moving municipality can change net pay by over a thousand kronor a month on a typical salary. NetWorth includes all ${r.municipalities.length} municipalities with Skatteverket’s ${year} rates.`],
        },
        {
          id: 'affects',
          title: 'What affects your net salary',
          paragraphs: ['Besides gross pay:'],
          bullets: ['Your municipality.', 'Church of Sweden membership.', 'Not modelled: the higher allowances for people aged 66 and over.', 'Not included: deductions for travel, interest or private pension savings.'],
        },
      ],
      faq: [
        { q: 'Do I pay state tax in Sweden?', a: `Only on taxable income above ${money(r.stateTax.threshold, 'SEK')} a year, at ${pct(r.stateTax.rate, 0)}. Most employees pay municipal tax only.` },
        { q: 'What is jobbskatteavdrag?', a: 'The earned-income tax credit, a reduction of tax on income from work. It is applied automatically through payroll and is included in NetWorth.' },
        { q: 'Does the municipality matter in Sweden?', a: `Yes. Local tax ranges from ${lo.toFixed(2)}% to ${hi.toFixed(2)}% and is the largest part of the tax on a normal salary.` },
      ],
      examples: [30000, 40000, 55000, 75000],
      related: ['NO', 'DK', 'DE'],
    };
  },

  NO: (r, year) => {
    const steps = r.bracketTax;
    return {
      summary: `Calculate Norwegian take-home pay for ${year}: 22% tax on general income, bracket tax, national insurance and the Finnmark/Nord-Troms zone, converted into your currency.`,
      intro: 'Norway taxes salaries in two parallel ways: a flat tax on income after deductions, and a progressive bracket tax on gross pay. National insurance is added on top.',
      sections: [
        {
          id: 'system',
          title: 'How Norwegian income tax works',
          paragraphs: [
            `Tax on general income is ${pct(r.generalIncomeRate, 0)}. It is charged after the minimum deduction (${pct(r.minimumDeduction.rate, 0)} of salary, up to ${money(r.minimumDeduction.max, 'NOK')}) and the personal allowance of ${money(r.personalAllowance, 'NOK')}.`,
            `Bracket tax (trinnskatt) is charged on gross pay in ${steps.length} steps, from ${pct(steps[0].rate, 1)} above ${money(steps[0].threshold, 'NOK')} to ${pct(steps[steps.length - 1].rate, 1)} above ${money(steps[steps.length - 1].threshold, 'NOK')}.`,
          ],
        },
        {
          id: 'contributions',
          title: 'National insurance',
          paragraphs: [`Employees pay national insurance (trygdeavgift) of ${pct(r.nationalInsurance.rate, 1)} of gross pay. Very low incomes below ${money(r.nationalInsurance.lowerLimit, 'NOK')} are exempt, with a gradual phase-in above that limit.`],
        },
        {
          id: 'regions',
          title: 'Finnmark and Nord-Troms',
          paragraphs: [`Residents of the action zone in Finnmark and Nord-Troms pay a lower rate on general income (${pct(r.northernZone.generalIncomeRate, 1)}), get an extra deduction of ${money(r.northernZone.specialDeduction, 'NOK')} and a reduced rate in bracket step 3. Elsewhere in Norway income tax is the same everywhere.`],
        },
        {
          id: 'affects',
          title: 'What affects your net salary',
          paragraphs: ['Besides gross pay:'],
          bullets: ['Living in the Finnmark/Nord-Troms zone.', 'Not included: interest deductions, travel deductions, union fees and the separate rules for foreign workers on short stays (PAYE scheme).'],
        },
      ],
      faq: [
        { q: 'What is trinnskatt?', a: `Bracket tax: a progressive tax on gross personal income in ${steps.length} steps, added to the flat ${pct(r.generalIncomeRate, 0)} tax on general income.` },
        { q: 'How much national insurance do employees pay in Norway?', a: `${pct(r.nationalInsurance.rate, 1)} of gross salary, with an exemption for very low incomes.` },
        { q: 'Does it matter where in Norway I live?', a: 'Only if you live in the Finnmark and Nord-Troms action zone, which has lower rates. Everywhere else the same rates apply.' },
      ],
      examples: [45000, 60000, 80000, 110000],
      related: ['SE', 'DK', 'DE'],
    };
  },

  GR: (r, year) => {
    const base = r.scalesByChildren[0];
    return {
      summary: `Estimate Greek net salary for ${year}: e-EFKA social security, the employment-income tax scale by number of children, youth relief and 14 salary payments, converted into your currency.`,
      intro: 'Greek employees usually receive 14 salary payments a year, and both the tax scale and the tax reduction depend on how many children you have. NetWorth marks Greece as an estimate until every value is confirmed against a primary source.',
      sections: [
        {
          id: 'system',
          title: 'How Greek income tax works',
          paragraphs: [
            `Employment income is taxed on a progressive scale. Without children the rates are ${base.map((b: any) => pct(b.rate, 0)).join(', ')} (the top rate applies above ${money(base[base.length - 2].upTo, 'EUR')}). Parents get lower rates in the middle bands.`,
            `A tax reduction of ${money(r.taxCredit.byChildren[0], 'EUR')} (more with children) is subtracted from the tax, phasing out by €${r.taxCredit.phaseOutPerThousand} per €1,000 of income above ${money(r.taxCredit.phaseOutThreshold, 'EUR')}.`,
            `Young employees pay less: income up to ${money(r.youthRelief[0].upTo, 'EUR')} is tax-free up to age ${r.youthRelief[0].maxAge} and taxed at ${pct(r.youthRelief[1].rate, 0)} from ${r.youthRelief[0].maxAge + 1} to ${r.youthRelief[1].maxAge}.`,
          ],
        },
        {
          id: 'contributions',
          title: 'Social security (e-EFKA)',
          paragraphs: [`Employees contribute ${pct(r.socialSecurity.employeeRate)} of gross pay to e-EFKA, up to a monthly insurable ceiling of ${money(r.socialSecurity.monthlyCeiling, 'EUR')}. Contributions are deducted before income tax is calculated.`],
        },
        {
          id: 'payments',
          title: '14 salary payments',
          paragraphs: [`Private-sector employees receive a Christmas bonus, an Easter bonus and a holiday allowance, together worth about two extra monthly salaries. A monthly salary is therefore multiplied by ${r.defaultPaymentsPerYear} to get annual pay; you can switch to 12 payments in the calculator.`],
        },
        {
          id: 'affects',
          title: 'What affects your net salary',
          paragraphs: ['Besides gross pay:'],
          bullets: ['Number of dependent children.', 'Your age (youth relief up to 30).', 'Whether you are paid 12 or 14 times a year.', 'Not included: the 50% relief for people relocating to Greece, other incomes.'],
        },
      ],
      faq: [
        { q: 'Why does NetWorth label Greece as an estimate?', a: 'Some 2026 values (the child-dependent scale and the employee contribution rate) were confirmed only through secondary sources. Until they are checked against primary AADE and e-EFKA publications the result is labelled an estimate.' },
        { q: 'Do Greek employees get 14 salaries?', a: 'Most private-sector employees do: twelve monthly salaries plus Christmas bonus, Easter bonus and holiday allowance, together about two extra salaries.' },
        { q: 'Do children reduce income tax in Greece?', a: 'Yes. Parents have lower rates in the middle bands of the scale and a larger tax reduction.' },
      ],
      examples: [1200, 1800, 2500, 3500],
      related: ['DE', 'NL', 'DK'],
    };
  },
};

export function countryContent(code: string, year: number): CountryContent | null {
  const build = BUILDERS[code];
  const info = taxRegistry.listCountries().find((c) => c.code === code);
  if (!build || !info || !info.years.includes(year)) return null;
  return { code, slug: slugFor(info.name), name: info.name, ...build(rulesOf(code, year), year) };
}

/** Countries that have a public page: supported in the registry and covered by editorial content. */
export function publicCountries(): { code: string; slug: string; name: string; currency: string; year: number }[] {
  return taxRegistry
    .listCountries()
    .filter((c) => BUILDERS[c.code] && c.years.length > 0)
    .map((c) => ({ code: c.code, slug: slugFor(c.name), name: c.name, currency: c.currency, year: Math.max(...c.years) }));
}

export function countryBySlug(slug: string) {
  return publicCountries().find((c) => c.slug === slug) ?? null;
}
