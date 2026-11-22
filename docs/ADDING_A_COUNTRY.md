# Adding a country

The calculator, comparison and methodology pages discover countries only through `src/countries/index.ts` and `tax-data/registry.json`. Adding a country never requires UI changes.

## Option A — with the Update Center (recommended)

1. `npm run admin`, open http://127.0.0.1:5342 → **Add country** → pick the country.
   If it is missing from the list, add its official tax authority to `scripts/make-catalog.mjs` and run `node scripts/make-catalog.mjs`.
2. The engine creates:
   - `src/countries/<cc>/index.ts` — a module built on the generic model (`src/engine/generic.ts`: progressive brackets, personal allowance, tax credit, flat contributions with ceilings)
   - `tax-data/<CC>/draft.json` — rules with **null** placeholders and a research checklist
   - source entries in `maintenance/config/sources.json` (authority homepage + candidate pages found on the same official domain, flagged as *discovered*)
   - `tests/tax/generated/<cc>.scaffold.test.ts` — guards that the country stays hidden + `it.todo` reference cases
   - `docs/countries/<CC>.md` — research report listing what is verified and what is missing
   - registry entry with status **under-development**
3. Research every item from official sources, fill `draft.json`, set each research item to `verified` (or `not-applicable`) with its `sourceUrl`.
4. Replace the `it.todo`s with official reference calculations.
5. **Create dataset from draft** — validates the schema and invariants, writes `<year>.1.json`, runs the tests. Missing items keep it *incomplete*.
6. **Publish country** — only possible when no active dataset is incomplete and tests pass. Rebuild/deploy to make it public.

## Option B — by hand (for countries that need custom logic)

1. Create `src/countries/<cc>/index.ts` exporting a `CountryModule<R>`:
   - `rulesSchema` (Zod) for the rule set — every number your calculation uses lives in the dataset, never in code
   - `getAvailableLocations(rules)` — municipalities/regions or `null`
   - `getRequiredPersonalInputs(rules)` — fields shown in the form (`advanced: true` hides them in Simple mode)
   - `paymentsPerYear(personal)` — 12, or e.g. 14 for Greece
   - `compute(rules, { grossAnnual, location, personal })` — returns breakdown lines (`incomeTax` / `social` / `mandatory` / `optional`) with explanations and parts; the engine derives totals, net, effective and marginal rate
   Use `src/countries/se/index.ts` or `no/index.ts` as examples.
2. Add it to `src/countries/index.ts` (between the marker comments).
3. Create `tax-data/<CC>/<year>.1.json` with full metadata (`sources`, `unverified`, `limitations`, `verificationStatus`).
4. Add it to `tax-data/registry.json`: `{ "name": "…", "status": "under-development", "active": { "2026": "2026.1" } }`.
5. Write `tests/tax/<country>.test.ts` with official reference values; run `npm run tax:golden` once to record regression results.
6. Register official sources and value probes in `scripts/make-sources.mjs`.
7. Set the status to `supported` when verified.

A country with status `under-development` is never shown in the public calculator.

To give the country a public page (`/countries/<name>`), add a builder for it in `src/content/countries.ts`: overview sections, FAQ and example salaries. Quote every rate through the dataset rules passed to the builder — never type numbers into the copy. The page, sitemap entry and navigation links appear automatically on the next build.
