# Tax calculation sources (tax year 2026)

All values live in `tax-data/<CC>/2026.1.json` together with their sources, the last-verified date and any open points. This page summarises them. Retrieved and verified 16–18 November 2026.

Legend: ✅ confirmed against a primary (government) source · ☑️ confirmed through the live source check (`npm run tax:check`) · ⚠️ secondary source only.

## Denmark — verified

| Item | 2026 value | Status |
|---|---|---|
| AM-bidrag | 8% of pay after ATP and own pension | ✅ |
| ATP (employee, full-time) | 99 DKK / month | ✅ borger.dk |
| Personal allowance | 54,100 DKK | ⚠️ themis.dk table of Skatteministeriet figures |
| Bottom tax | 12.01% | ✅☑️ skat.dk |
| Middle tax | 7.5% above 641,200 DKK | ✅☑️ skat.dk |
| Top tax | 7.5% above 777,900 DKK | ✅☑️ skat.dk |
| Top-top tax | 5% above 2,592,700 DKK | ✅☑️ skat.dk |
| Tax ceiling (bottom+middle+municipal) | 44.57% | ⚠️ |
| Employment deduction | 12.75%, max 63,300 DKK | ⚠️ |
| Job deduction | 4.5% above 235,200 DKK, max 3,100 DKK | ⚠️ |
| Municipal and church tax, 98 municipalities | per municipality | ✅☑️ Statistics Denmark PSKAT API |

Sources: [skat.dk — bundskat … toptopskat](https://skat.dk/hjaelp/bundskat-mellemskat-topskat-og-toptopskat) · [Statistics Denmark PSKAT](https://www.statbank.dk/PSKAT) · [ATP rates](https://www.borger.dk/pension-og-efterloen/atp-livslang-pension-oversigt/atp-bidraget/atp-satser-for-privat-virksomhed) · [Skatteministeriet](https://skm.dk/tal-og-metode/satser/satser-og-beloebsgraenser-i-lovgivningen)

Not modelled: capital income, researcher scheme, commuting/union/interest deductions, single-parent extra deduction, part-time ATP.

## Germany — verified

Wage tax follows the BMF *Programmablaufplan 2026* (final, 12 Nov 2025): tariff §32a EStG (basic allowance €12,348; zones to €17,799, €69,878, €277,825; 42% and 45%), lump sums (€1,230 employee, €36 special expenses, €4,260 single parent), child allowance €9,756 (for Soli/church tax only), Vorsorgepauschale incl. the €1,900 cap, class V/VI thresholds €14,071 / €34,939 / €222,260, solidarity surcharge exemption €20,350 (×2 class III) with 11.9% phase-in. ✅ ☑️ — **12 BMF calculator cases match to the cent** (`tests/tax/germany.test.ts`).

Social insurance (employee share): pension 9.3% and unemployment 1.3% up to €101,400; health 7.3% + half the additional rate (average 2.9%) up to €69,750; care 1.8% (Saxony 2.3%), +0.6% childless from 23, −0.25% per child from the 2nd (max 4). ✅ Bundesregierung / PAP.

Church tax 8% (Bavaria, Baden-Württemberg) or 9% of wage tax.

Sources: [BMF PAP 2026](https://www.bundesfinanzministerium.de/) · [§32a EStG](https://www.gesetze-im-internet.de/estg/__32a.html) · [BMF calculator](https://www.bmf-steuerrechner.de/) · [Rechengrößen 2026](https://www.bundesregierung.de/breg-de/aktuelles/beitragsgemessungsgrenzen-2386514)

Not modelled: private health insurance, Midijob contribution relief (a warning is shown), factor method, personal tax-free amounts, benefits in kind.

## Netherlands — verified

Box 1 (under AOW age): 35.75% to €38,883 · 37.56% to €78,426 · 49.50% above. General credit €3,115, reduced by 6.398% from €29,736 to zero at €78,426. Labour credit: 8.324% to €11,965; €996 + 31.009%; €5,300 + 1.950% from €25,845; €5,685 − 6.510% from €45,592 to zero at €132,920. ✅☑️ Belastingdienst.

National-insurance share of bracket 1 (27.65%) is used only to split the total between "wage tax" and "national insurance" (⚠️; does not change net pay). 30% ruling norms ⚠️.

Source: [Belastingdienst — voorlopige aanslag 2026](https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen)

Not modelled: AOW-age rates, IACK, mortgage interest, box 2/3.

## Sweden — verified

Implements Skatteverket's technical description **SKV 433 (2026, edition 36)**: price base amount 59,200, income base amount 83,400, basic allowance formula (rounded up to 100), job tax credit for under-66s (0.91/3.24/8.08 PBB, 38.74% / 25.10%), general pension fee 7% up to 8.07 IBB (max 47,100, fully credited), tax credit on earned income (0.75% of 40,000–240,000, max 1,500), public service fee 1% up to 1.42 IBB (max 1,184), state tax 20% above 643,000. ✅☑️ — all published worked examples are reproduced in `tests/tax/sweden.test.ts`.

Municipal + regional rate, burial fee and church fee for all 290 municipalities from Skatteverket's open-data API ✅☑️.

Sources: [SKV 433 (PDF)](https://skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf) · [Belopp och procent 2026](https://www.skatteverket.se/privat/skatter/beloppochprocent/2026) · [Skattesatser open data](https://skatteverket.entryscape.net/rowstore/dataset/c67b320b-ffee-4876-b073-dd9236cd2a99)

Not modelled: 66+, SINK, deductions.

## Norway — verified

General income 22% after minimum deduction (46%, max 95,700) and personal allowance 114,540. Bracket tax 1.7% / 4.0% / 13.7% / 16.8% / 17.8% from 226,100 / 318,300 / 725,050 / 980,100 / 1,467,200. National insurance 7.6%, none below 99,650, max 25% of the excess. Finnmark & Nord-Troms: 18.5%, 45,000 special deduction, step-3 rate 11.7% (⚠️). ✅☑️ Skatteetaten.

Sources: [trinnskatt](https://www.skatteetaten.no/satser/trinnskatt/) · [personfradrag](https://www.skatteetaten.no/satser/personfradrag/) · [minstefradrag](https://www.skatteetaten.no/satser/minstefradrag/) · [trygdeavgift](https://www.skatteetaten.no/satser/trygdeavgift/) · [Finnmarksfradraget](https://www.skatteetaten.no/satser/finnmarksfradraget/)

Not modelled: PAYE scheme for foreign workers, under-17/over-69 rate, deductions.

## Greece — estimate

Law 5246/2025 scale for employment income from 2026: 9% / 20% / 26% / 34% / 39% / 44% (bands of €10,000 to €40,000, then €60,000) ⚠️ (consistent across several professional summaries). Reduced rates by number of children (1: 18/24%, 2: 16/22%, 3: 9/20%, 4+: 0/0/18%) ⚠️. Youth: 0% on the first €20,000 up to age 25, 9% on €10,000–20,000 for ages 26–30 ⚠️. Art. 16 tax reduction €777 / 900 / 1,120 / 1,340 / 1,580 (+€220 per further child), −€20 per €1,000 above €12,000 ⚠️. Employee e-EFKA 13.37% ⚠️ up to €7,761.94 per salary payment ✅ (Circular 4/2026). 14 salary payments by default.

The dataset is therefore marked **estimate** until the gazette text and the e-EFKA rate are confirmed. Greek authorities publish no machine-readable rates; the Update Center monitors AADE circulars, AADE announcements and e-EFKA announcements for relevant changes.

Not modelled: 5+ children extra relief, e-spending requirement, art. 5C new-resident regime.

## Exchange rates

[Frankfurter](https://frankfurter.dev/) `https://api.frankfurter.dev/v1/latest?base=EUR` and `/v1/<date>` — ECB reference rates, ~30 currencies, no key.
