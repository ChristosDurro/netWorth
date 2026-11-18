// Regenerates maintenance/config/catalog.json — official tax authorities used by "Add Country".
// Only government domains are listed. Social-security institutions are included where they are separate.
import fs from 'node:fs';

const c = (code, name, currency, authority, url, keywords, social = null) => ({ code, name, currency, authority, url, keywords, social });
const countries = [
  c('AT', 'Austria', 'EUR', 'Bundesministerium für Finanzen', 'https://www.bmf.gv.at/', ['lohnsteuer', 'einkommensteuer', 'tarif', 'steuersätze'], { authority: 'Dachverband der Sozialversicherungsträger', url: 'https://www.sozialversicherung.at/' }),
  c('BE', 'Belgium', 'EUR', 'SPF Finances / FOD Financiën', 'https://finances.belgium.be/', ['précompte', 'impôt des personnes physiques', 'barème', 'bedrijfsvoorheffing'], { authority: 'ONSS / RSZ', url: 'https://www.socialsecurity.be/' }),
  c('BG', 'Bulgaria', 'EUR', 'National Revenue Agency', 'https://nra.bg/', ['данък', 'доходи', 'осигурителни']),
  c('HR', 'Croatia', 'EUR', 'Porezna uprava', 'https://porezna-uprava.gov.hr/', ['porez na dohodak', 'stope', 'doprinosi']),
  c('CY', 'Cyprus', 'EUR', 'Tax Department', 'https://www.mof.gov.cy/mof/tax/taxdep.nsf/', ['income tax', 'rates', 'allowances']),
  c('CZ', 'Czechia', 'CZK', 'Finanční správa', 'https://www.financnisprava.cz/', ['daň z příjmů', 'sazby', 'sleva']),
  c('EE', 'Estonia', 'EUR', 'Maksu- ja Tolliamet', 'https://www.emta.ee/', ['tulumaks', 'maksuvaba', 'income tax']),
  c('FI', 'Finland', 'EUR', 'Verohallinto (Vero)', 'https://www.vero.fi/', ['tuloveroasteikko', 'veroprosentti', 'income tax scale']),
  c('FR', 'France', 'EUR', 'Direction générale des Finances publiques', 'https://www.impots.gouv.fr/', ['barème', 'impôt sur le revenu', 'prélèvement à la source'], { authority: 'URSSAF', url: 'https://www.urssaf.fr/' }),
  c('HU', 'Hungary', 'HUF', 'Nemzeti Adó- és Vámhivatal', 'https://nav.gov.hu/', ['személyi jövedelemadó', 'szja', 'járulék']),
  c('IS', 'Iceland', 'ISK', 'Skatturinn', 'https://www.skatturinn.is/', ['staðgreiðsla', 'skatthlutfall', 'persónuafsláttur']),
  c('IE', 'Ireland', 'EUR', 'Revenue Commissioners', 'https://www.revenue.ie/', ['tax rates', 'tax credits', 'usc', 'prsi']),
  c('IT', 'Italy', 'EUR', 'Agenzia delle Entrate', 'https://www.agenziaentrate.gov.it/', ['irpef', 'aliquote', 'detrazioni'], { authority: 'INPS', url: 'https://www.inps.it/' }),
  c('LV', 'Latvia', 'EUR', 'Valsts ieņēmumu dienests', 'https://www.vid.gov.lv/', ['iedzīvotāju ienākuma nodoklis', 'likmes']),
  c('LT', 'Lithuania', 'EUR', 'Valstybinė mokesčių inspekcija', 'https://www.vmi.lt/', ['gyventojų pajamų mokestis', 'tarifai']),
  c('LU', 'Luxembourg', 'EUR', 'Administration des contributions directes', 'https://impotsdirects.public.lu/', ['barème', 'impôt', 'retenue']),
  c('MT', 'Malta', 'EUR', 'Commissioner for Revenue', 'https://cfr.gov.mt/', ['tax rates', 'income tax', 'fss']),
  c('PL', 'Poland', 'PLN', 'Ministerstwo Finansów / Krajowa Administracja Skarbowa', 'https://www.podatki.gov.pl/', ['pit', 'skala podatkowa', 'kwota wolna'], { authority: 'ZUS', url: 'https://www.zus.pl/' }),
  c('PT', 'Portugal', 'EUR', 'Autoridade Tributária e Aduaneira', 'https://info.portaldasfinancas.gov.pt/', ['irs', 'taxas', 'tabelas de retenção'], { authority: 'Segurança Social', url: 'https://www.seg-social.pt/' }),
  c('RO', 'Romania', 'RON', 'Agenția Națională de Administrare Fiscală', 'https://www.anaf.ro/', ['impozit pe venit', 'contribuții', 'cas', 'cass']),
  c('SK', 'Slovakia', 'EUR', 'Finančná správa', 'https://www.financnasprava.sk/', ['daň z príjmov', 'sadzby', 'nezdaniteľná']),
  c('SI', 'Slovenia', 'EUR', 'Finančna uprava (FURS)', 'https://www.fu.gov.si/', ['dohodnina', 'lestvica', 'olajšava']),
  c('ES', 'Spain', 'EUR', 'Agencia Tributaria', 'https://sede.agenciatributaria.gob.es/', ['irpf', 'tipos de gravamen', 'retenciones'], { authority: 'Seguridad Social', url: 'https://www.seg-social.es/' }),
  c('CH', 'Switzerland', 'CHF', 'Eidgenössische Steuerverwaltung', 'https://www.estv.admin.ch/', ['quellensteuer', 'tarif', 'bundessteuer'], { authority: 'AHV/IV', url: 'https://www.ahv-iv.ch/' }),
  c('GB', 'United Kingdom', 'GBP', 'HM Revenue & Customs', 'https://www.gov.uk/government/organisations/hm-revenue-customs', ['income tax rates', 'personal allowance', 'national insurance']),
  c('US', 'United States', 'USD', 'Internal Revenue Service', 'https://www.irs.gov/', ['tax brackets', 'standard deduction', 'withholding'], { authority: 'Social Security Administration', url: 'https://www.ssa.gov/' }),
  c('CA', 'Canada', 'CAD', 'Canada Revenue Agency', 'https://www.canada.ca/en/revenue-agency.html', ['tax rates', 'basic personal amount', 'cpp', 'ei']),
  c('AU', 'Australia', 'AUD', 'Australian Taxation Office', 'https://www.ato.gov.au/', ['tax rates', 'medicare levy', 'withholding']),
  c('NZ', 'New Zealand', 'NZD', 'Inland Revenue (Te Tari Taake)', 'https://www.ird.govt.nz/', ['tax rates', 'paye', 'acc levy']),
  c('JP', 'Japan', 'JPY', 'National Tax Agency', 'https://www.nta.go.jp/', ['所得税', '税率', '源泉徴収']),
  c('SG', 'Singapore', 'SGD', 'Inland Revenue Authority of Singapore', 'https://www.iras.gov.sg/', ['income tax rates', 'resident', 'cpf']),
];
fs.writeFileSync(new URL('../maintenance/config/catalog.json', import.meta.url), JSON.stringify({ countries }, null, 2) + '\n');
console.log(`${countries.length} countries in the authority catalog`);
