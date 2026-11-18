# NetWorth — International Salary & Take-Home Pay Calculator

Enter a gross salary → pick the country → pick your currency → see what you actually take home.

NetWorth applies each country's own 2026 tax rules **first**, in the employment currency, and only then converts the net salary into the currency you choose using European Central Bank reference rates. It runs entirely in the browser, stores everything on your device and costs €0 to run.

| | |
|---|---|
| Countries | Denmark, Germany, Netherlands, Sweden, Norway, Greece |
| Tax year | 2026 (versioned datasets; no year ever falls back to another) |
| Exchange rates | [Frankfurter](https://frankfurter.dev/) — ECB data, free, no API key |
| Stack | React 19 · TypeScript · Vite · Tailwind CSS 4 · Zod · Lucide · Vitest · Testing Library · Playwright |
| Backend | None for the public app. A **local-only** Node service powers the Tax Update Center. |

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5340.

| Command | What it does |
|---|---|
| `npm run dev` | Web app with hot reload |
| `npm run admin` | Web app **plus** the local Tax Maintenance service → http://localhost:5340/#/admin |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run test` | Unit, integration, maintenance and UI tests (Vitest) |
| `npm run test:e2e` | End-to-end journeys on desktop and mobile (Playwright; first run: `npx playwright install chromium`) |
| `npm run tax:check` | Check every official tax source from the command line |
| `npm run tax:status` | Dataset versions, pending reviews and failing sources |
| `npm run tax:golden` | Re-record golden regression results (only after a deliberate change) |

## Features

- **Calculator** — monthly, annual or hourly gross pay; country picker with flags; tax year; municipality / state / region where it matters; Simple and Advanced modes with only the personal inputs that matter for the selected country (church membership, tax class, children, age, pension contribution, 30% ruling, salary payments…).
- **Results** — take-home pay in your currency as the headline, the employment-currency equivalent, annual/monthly net, effective and marginal rate, total deductions, an expandable tax breakdown with the calculation steps, a gross-vs-deductions bar, currency-conversion details (rate, date, source) and a monthly/annual overview table.
- **Exchange rates** — latest ECB rate with its date, 6-hour local cache, last-known-rate fallback that is always labelled as not current, built-in reference table if the service was never reachable, manual rate, historical rates by date.
- **Country comparison** — up to 8 rows, each taxed in its own currency and then converted into one currency; monthly/annual, sorting, "highest net" highlight and visible tags whenever rows use different personal assumptions.
- **Saved calculations** — save, reopen, rename, duplicate, delete, export and import JSON. Stored only in this browser. A saved calculation remembers which dataset version it used.
- **Settings** — default currency, tax year, salary frequency, theme (dark/light/system), calculation mode, number format, decimals, exchange-rate cache status.
- **Methodology** — how the calculation works, what is not included, verification levels, and per-country official sources, dataset version and last-verified date.
- **Tax Regulation Update Center** (local admin) — see [docs/MAINTENANCE.md](docs/MAINTENANCE.md).

## Accuracy and transparency

Every result carries a status:

- **Verified rules** — the dataset was checked against official sources for that year.
- **Estimate** — some rules or circumstances are approximated (e.g. Greece, where part of the 2026 reform could only be confirmed through professional summaries).
- **Incomplete data** — important information is missing (e.g. a future year built from last year's rules).

Independent checks in the test suite:

- **Germany** matches the official BMF wage-tax calculator to the cent for 12 cases across all six tax classes.
- **Sweden** reproduces every worked example in Skatteverket's technical description SKV 433 (2026).
- **Denmark, Netherlands, Norway, Greece** are checked against step-by-step statutory calculations from the official rate tables.
- The live source check confirmed all 44 monitored values (rates, thresholds, allowances and two BMF reference calculations) against the official sources on 18 Nov 2026.

> NetWorth provides estimates for informational purposes only. Actual take-home pay depends on individual tax circumstances, employment arrangements, deductions, benefits and applicable legislation. This calculator does not replace professional tax advice.

## Project structure

```
src/
  engine/          Country-independent contract, registry, schemas, math (no UI imports)
  countries/<cc>/  One module per country: rule schema + calculation
  data/            Loads tax-data/ (Vite glob in the browser, fs in Node)
  services/        currency/ (Frankfurter client) · storage/ (localStorage + Zod)
  calculations/    Comparison logic
  hooks/ state/    React hooks and app context
  components/ pages/
tax-data/
  registry.json    Which dataset version is active per country and tax year
  <CC>/<year>.<n>.json   Immutable, versioned rule sets with source metadata
maintenance/
  engine/          Source monitoring, change detection, validation, versioning, scaffolding, admin API
  config/          sources.json (official sources + value probes) · catalog.json (tax authorities)
  data/            state, proposals, history reports, source snapshots
tests/             tax/ currency/ maintenance/ ui/  (+ golden.json regression lock)
e2e/               Playwright journeys
docs/              Sources, adding a country, deployment, maintenance
```

## Documentation

- [docs/TAX_SOURCES.md](docs/TAX_SOURCES.md) — every rate used, with its official source and known limitations
- [docs/ADDING_A_COUNTRY.md](docs/ADDING_A_COUNTRY.md) — add a country with or without the Update Center
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — free hosting on Cloudflare Pages or GitHub Pages
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — the Tax Regulation Update Center, local and production modes

## Costs

None. No accounts, API keys, databases or paid services. The only network request from the public site is to Frankfurter for exchange rates. Optional automation uses free GitHub Actions minutes.
