// Regenerates maintenance/config/sources.json — the registry of official sources and value probes.
// Edit this file (not the JSON) when adding or changing monitored sources, then run: node scripts/make-sources.mjs
import fs from 'node:fs';

const p = (id, label, rulePath, pattern, format, scale = 1, category = 'income-tax') => ({ id, label, rulePath, pattern, format, scale, category });
const pct = (id, label, rulePath, pattern, category) => p(id, label, rulePath, pattern, 'decimal-comma', 0.01, category);

const sources = [
  // ---------------- Denmark ----------------
  {
    id: 'dk-statbank-pskat', country: 'DK', authority: 'Statistics Denmark', type: 'api', method: 'statbank-pskat', category: 'local-tax',
    url: 'https://api.statbank.dk/v1/data/PSKAT/CSV?lang=en&OMR%C3%85DE=*&SKATPCT=*&Tid={year}',
    description: "Official open-data API with municipal and church tax rates for all 98 municipalities. Compared value by value; also reports when next year's rates are published.",
  },
  {
    id: 'dk-skat-state-tax', country: 'DK', authority: 'Skattestyrelsen (skat.dk)', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://skat.dk/hjaelp/bundskat-mellemskat-topskat-og-toptopskat',
    description: 'Bottom, middle, top and top-top tax rates and thresholds.',
    keywords: ['bundskat', 'mellemskat', 'topskat', 'kr.', '%'],
    yearPattern: 'Procentsatser og beløbsgrænser i (?<value>\\d{4})',
    probes: [
      pct('bottom-rate', 'Bottom tax rate', 'bottomTaxRate', 'Bundskat: (?<value>\\d+(?:,\\d+)?) %'),
      pct('middle-rate', 'Middle tax rate', 'middleTax.rate', 'Mellemskat: (?<value>\\d+(?:,\\d+)?) %'),
      p('middle-threshold', 'Middle tax threshold', 'middleTax.threshold', 'personlig indkomst over (?<value>[\\d.]+) kr\\. efter am-bidrag, skal du betale [\\d,]+ % i mellemskat', 'dot-thousands'),
      pct('top-rate', 'Top tax rate', 'topTax.rate', 'Topskat: (?<value>\\d+(?:,\\d+)?) %'),
      p('top-threshold', 'Top tax threshold', 'topTax.threshold', 'over (?<value>[\\d.]+) kr\\. \\(\\d{4}\\) efter am-bidrag, skal du betale [\\d,]+ % i topskat', 'dot-thousands'),
      pct('toptop-rate', 'Top-top tax rate', 'topTopTax.rate', 'Toptopskat: (?<value>\\d+(?:,\\d+)?) %'),
      p('toptop-threshold', 'Top-top tax threshold', 'topTopTax.threshold', 'over (?<value>[\\d.]+) kr\\. \\(\\d{4}\\) efter am-bidrag, skal du betale [\\d,]+ % i toptopskat', 'dot-thousands'),
    ],
  },
  // ---------------- Germany ----------------
  {
    id: 'de-bmf-lohnsteuer', country: 'DE', authority: 'Bundesministerium der Finanzen', type: 'api', method: 'bmf-lohnsteuer', category: 'income-tax',
    url: 'https://www.bmf-steuerrechner.de/interface/{year}Version1.xhtml',
    description: "Official BMF wage-tax calculator interface. Reference salaries are recalculated by the BMF and compared with NetWorth; it also reports when next year's payroll algorithm (PAP) is published.",
  },
  {
    id: 'de-estg-32a', country: 'DE', authority: 'Bundesministerium der Justiz', type: 'legislation', method: 'html-text', category: 'income-tax',
    url: 'https://www.gesetze-im-internet.de/estg/__32a.html',
    description: '§ 32a EStG income-tax tariff (consolidated law text).',
    keywords: ['euro', 'veranlagungszeitraum', '•'],
    yearPattern: 'ab dem Veranlagungszeitraum (?<value>\\d{4})',
    probes: [
      p('basic-allowance', 'Basic allowance (Grundfreibetrag)', 'tariff.basicAllowance', 'bis (?<value>[\\d ]+?) Euro \\(Grundfreibetrag\\)', 'space-thousands'),
      p('zone2-end', 'End of first progression zone', 'tariff.zone2End', 'von [\\d ]+ Euro bis (?<value>[\\d ]+?) Euro:\\n\\(9', 'space-thousands'),
      p('zone3-end', 'End of second progression zone', 'tariff.zone3End', 'von [\\d ]+ Euro bis (?<value>[\\d ]+?) Euro:\\n\\(1', 'space-thousands'),
      p('zone4-end', 'End of 42% zone', 'tariff.zone4End', 'von [\\d ]+ Euro bis (?<value>[\\d ]+?) Euro:\\n0,42', 'space-thousands'),
    ],
  },
  // ---------------- Netherlands ----------------
  {
    id: 'nl-belastingdienst-tarieven', country: 'NL', authority: 'Belastingdienst', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen',
    description: 'Box 1 rates and tax credits used for the provisional assessment.',
    keywords: ['€', '%', 'schijf', 'korting'],
    yearPattern: 'Voorlopige aanslag (?<value>\\d{4}): gebruikte tarieven',
    probes: [
      p('b1-limit', 'Bracket 1 upper limit', 'brackets.0.upTo', 'nog niet de AOW-leeftijd hebt\\nSchijf\\nBelastbaar inkomen\\nPercentage\\n1\\ntot en met € (?<value>[\\d.]+)', 'dot-thousands'),
      pct('b1-rate', 'Bracket 1 rate', 'brackets.0.rate', 'nog niet de AOW-leeftijd hebt\\nSchijf\\nBelastbaar inkomen\\nPercentage\\n1\\ntot en met € [\\d.]+\\n(?<value>[\\d,]+)%'),
      p('b2-limit', 'Bracket 2 upper limit', 'brackets.1.upTo', 'meer dan € [\\d.]+ tot en met € (?<value>[\\d.]+)\\n', 'dot-thousands'),
      pct('b2-rate', 'Bracket 2 rate', 'brackets.1.rate', 'meer dan € [\\d.]+ tot en met € [\\d.]+\\n(?<value>[\\d,]+)%'),
      pct('b3-rate', 'Bracket 3 rate', 'brackets.2.rate', '\\nmeer dan € [\\d.]+\\n(?<value>[\\d,]+)%'),
      p('ahk-max', 'General tax credit (max)', 'generalCredit.max', 'Algemene heffingskorting\\ntot € [\\d.]+\\n€ (?<value>[\\d.]+)', 'dot-thousands'),
      p('ahk-start', 'General credit phase-out start', 'generalCredit.phaseOutStart', 'Algemene heffingskorting\\ntot € (?<value>[\\d.]+)', 'dot-thousands'),
      pct('ahk-rate', 'General credit phase-out rate', 'generalCredit.phaseOutRate', '€ [\\d.]+ - (?<value>[\\d,]+)% x \\(verzamelinkomen'),
      p('ak-max', 'Labour credit (max)', 'labourCredit.3.base', '€ (?<value>[\\d.]+) - [\\d,]+% x \\(arbeidsinkomen', 'dot-thousands'),
      p('ak-end', 'Labour credit end of phase-out', 'labourCredit.3.upTo', 'vanaf € (?<value>[\\d.]+)\\n€ 0\\nInkomensafhankelijke', 'dot-thousands'),
    ],
  },
  // ---------------- Sweden ----------------
  {
    id: 'se-skv-rowstore', country: 'SE', authority: 'Skatteverket', type: 'api', method: 'skv-rowstore', category: 'local-tax',
    url: 'https://skatteverket.entryscape.net/rowstore/dataset/c67b320b-ffee-4876-b073-dd9236cd2a99?%C3%A5r={year}',
    description: "Official open-data API with municipal, regional, burial and church rates for every parish. Compared value by value; reports when next year's rates appear.",
  },
  {
    id: 'se-skv-belopp', country: 'SE', authority: 'Skatteverket', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.skatteverket.se/privat/skatter/beloppochprocent/{year}',
    yearUrl: 'https://www.skatteverket.se/privat/skatter/beloppochprocent/{year}',
    description: 'Amounts and percentages for the income year (price base amount, state-tax threshold, average municipal rate…).',
    keywords: ['kronor', 'procent'],
    probes: [
      p('pbb', 'Price base amount', 'priceBaseAmount', 'Prisbasbeloppet inkomstår \\d{4}: (?<value>[\\d ]+?) kronor', 'space-thousands'),
      p('ibb', 'Income base amount', 'incomeBaseAmount', 'Inkomstbasbeloppet för år \\d{4} har fastställts till (?<value>[\\d ]+?) kronor', 'space-thousands'),
      p('skiktgrans', 'State-tax threshold', 'stateTax.threshold', 'Skiktgränsen för \\d{4} är (?<value>[\\d ]+?) kronor', 'space-thousands'),
      p('avg-municipal', 'Average municipal tax rate', 'average.municipalRate', 'genomsnittliga kommunala skattesatsen för \\d{4} är (?<value>[\\d,]+) procent', 'decimal-comma'),
      p('pension-fee', 'General pension fee rate', 'pensionFee.rate', '(?<value>\\d+(?:,\\d+)?) procent av förvärvsinkomsten men högst', 'decimal-comma', 0.01, 'social'),
    ],
  },
  // ---------------- Norway ----------------
  {
    id: 'no-skatteetaten-trinnskatt', country: 'NO', authority: 'Skatteetaten', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.skatteetaten.no/satser/trinnskatt/',
    description: 'Bracket tax (trinnskatt) steps and rates.',
    keywords: ['trinn', 'kroner', '%'],
    yearPattern: 'Velg år\\n(?<value>\\d{4})',
    probes: [
      p('t1-threshold', 'Step 1 threshold', 'bracketTax.0.threshold', 'For de første (?<value>[\\d ]+?) kronene', 'space-thousands'),
      ...[1, 2, 3, 4].map((i) => p(`t${i + 1}-threshold`, `Step ${i + 1} threshold`, `bracketTax.${i}.threshold`, `Trinn ${i}\\nInntekten mellom [\\d ]+ – (?<value>[\\d ]+?) kroner`, 'space-thousands')),
      ...[1, 2, 3, 4].map((i) => pct(`t${i}-rate`, `Step ${i} rate`, `bracketTax.${i - 1}.rate`, `Trinn ${i}\\nInntekten mellom [^\\n]+\\n(?<value>[\\d,]+) % trinnskatt`)),
      pct('t5-rate', 'Step 5 rate', 'bracketTax.4.rate', 'Trinn 5\\nInntekten fra og med [^\\n]+\\n(?<value>[\\d,]+) % trinnskatt'),
    ],
  },
  {
    id: 'no-skatteetaten-personfradrag', country: 'NO', authority: 'Skatteetaten', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.skatteetaten.no/satser/personfradrag/',
    description: 'Personal allowance (personfradrag).',
    keywords: ['kroner', 'klasse'],
    yearPattern: 'Velg år\\n(?<value>\\d{4})',
    probes: [p('personfradrag', 'Personal allowance', 'personalAllowance', 'Klasse 1\\n(?<value>[\\d ]+?) kroner', 'space-thousands')],
  },
  {
    id: 'no-skatteetaten-minstefradrag', country: 'NO', authority: 'Skatteetaten', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.skatteetaten.no/satser/minstefradrag/',
    description: 'Minimum standard deduction (minstefradrag).',
    keywords: ['sats', 'grense', 'kr', '%'],
    yearPattern: 'Velg år\\n(?<value>\\d{4})',
    probes: [
      pct('min-rate', 'Minimum deduction rate', 'minimumDeduction.rate', 'Lønnsinntekt\\nSats\\n(?<value>[\\d,]+) %'),
      p('min-max', 'Minimum deduction cap', 'minimumDeduction.max', 'Lønnsinntekt\\nSats\\n[\\d,]+ %\\nØvre grense \\*?\\n(?<value>[\\d ]+?) kr', 'space-thousands'),
    ],
  },
  {
    id: 'no-skatteetaten-trygdeavgift', country: 'NO', authority: 'Skatteetaten', type: 'html', method: 'html-text', category: 'social',
    url: 'https://www.skatteetaten.no/satser/trygdeavgift/',
    description: 'National insurance contribution (trygdeavgift).',
    keywords: ['%', 'kr', 'prosent'],
    yearPattern: 'Velg år\\n(?<value>\\d{4})',
    probes: [
      pct('ni-rate', 'National insurance rate (wages)', 'nationalInsurance.rate', '\\(personer i alderen 17 til 69 år i inntektsåret\\)\\n(?<value>[\\d,]+) %', 'social'),
      p('ni-limit', 'Lower income limit', 'nationalInsurance.lowerLimit', 'for å beregne trygdeavgift\\n(?<value>[\\d ]+?) kr', 'space-thousands', 1, 'social'),
      p('ni-cap', 'Phase-in cap', 'nationalInsurance.phaseInRate', 'aldri mer enn (?<value>\\d+) prosent', 'decimal-dot', 0.01, 'social'),
    ],
  },
  // ---------------- Greece ----------------
  {
    id: 'gr-aade-circulars', country: 'GR', authority: 'AADE', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.aade.gr/egkyklioi-kai-apofaseis',
    description: 'AADE circulars and decisions. No machine-readable rates are published, so changes in tax-related lines are reported for manual review.',
    keywords: ['φόρου εισοδήματος', 'κλίμακ', 'μισθωτ', 'παρακράτηση', 'ΚΦΕ'],
  },
  {
    id: 'gr-aade-press', country: 'GR', authority: 'AADE', type: 'html', method: 'html-text', category: 'income-tax',
    url: 'https://www.aade.gr/deltia-typoy-anakoinoseis',
    description: 'AADE press releases and announcements.',
    keywords: ['φόρου εισοδήματος', 'κλίμακ', 'μισθωτ', 'παρακράτηση'],
  },
  {
    id: 'gr-efka-announcements', country: 'GR', authority: 'e-EFKA', type: 'html', method: 'html-text', category: 'social',
    url: 'https://www.e-efka.gov.gr/el/anakoinoseis',
    description: 'e-EFKA announcements (contribution rates, insurable-earnings ceiling).',
    keywords: ['εισφορ', 'ανώτατο όριο', 'ασφαλιστέων', 'εγκύκλιο'],
  },
];

fs.writeFileSync(new URL('../maintenance/config/sources.json', import.meta.url), JSON.stringify({ sources }, null, 2) + '\n');
console.log(`${sources.length} sources, ${sources.reduce((s, x) => s + (x.probes?.length ?? 0), 0)} value probes`);
