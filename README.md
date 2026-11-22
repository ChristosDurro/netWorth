# NetWorth — Know what your salary is actually worth

An international take-home pay calculator. Enter a gross salary in the country you would work in, and NetWorth applies that country's own tax rules **first**, in the employment currency, then converts only the take-home pay into your currency at a dated European Central Bank reference rate. Compare offers across countries, share a calculation by link, and keep scenarios in your browser — no account, no tracking, €0 to run.

Live: https://christosdurro.github.io/netWorth/

| | |
|---|---|
| Countries | Denmark, Germany, Netherlands, Sweden, Norway, Greece |
| Tax year | 2026 (versioned datasets; a year never falls back to another) |
| Exchange rates | [Frankfurter](https://frankfurter.dev/) — ECB data, free, no API key |
| Stack | React 19 · TypeScript · Vite · Tailwind CSS 4 · Zod · Lucide · Inter + IBM Plex Mono (self-hosted) · Vitest · Testing Library · Playwright · axe |
| Hosting | Static, pre-rendered pages (GitHub Pages or any static host) |
| Backend | None for the public site. A **local-only** tool maintains the tax data. |

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
| `npm run dev` | Public website with hot reload |
| `npm run admin` | Private tax-administration tool → http://127.0.0.1:5342 (plus its local service on 5341) |
| `npm run build` | Type-check, build and pre-render every page into `dist/` (set `BASE_PATH` and `SITE_URL` for a sub-folder deployment) |
| `npm run build:pages` | Build exactly as GitHub Pages serves it (under `/netWorth/`); preview with `npx vite preview --base /netWorth/` |
| `npm run test` | Unit, tax, maintenance, SEO and UI tests (Vitest) |
| `npm run test:e2e` | Journeys, accessibility (axe), no-JavaScript SEO checks and phone layouts on desktop and mobile (Playwright; first run: `npx playwright install chromium`) |
| `npm run images` | Re-render favicon, app icons and the social preview image |
| `npm run tax:check` · `tax:status` · `tax:golden` | Tax-source checks and regression results from the command line |

## Product

- **Homepage** — the headline promise, a compact calculator you can use immediately, trust signals, how it works, a live "same gross, different net" comparison, country entry points, what take-home pay includes, transparency levels and an FAQ.
- **Calculator** (`/calculator`) — gross → take-home or the **reverse** (which gross gives the take-home pay I want); monthly, annual or hourly; municipality/state/region where it matters; personal circumstances behind progressive disclosure. Results lead with net monthly pay in your currency, then annual net, gross, deductions and effective rate, a grouped tax breakdown with plain-language explanations, monthly-vs-annual table, conversion details, marginal rate, assumptions, sources and verification status.
- **Shareable links** — the address bar always holds the inputs (`/calculator?country=DK&salary=40000&frequency=monthly&year=2026&currency=EUR`). Links carry inputs only, are fully validated and always recalculated. Share uses the native share sheet on phones, copy-link elsewhere.
- **Compare** (`/compare`) — up to 8 named offers, each taxed in its own country and currency, ranked in one currency; difference from the best offer, sort by take-home or effective tax, expandable tax details, open any offer in the calculator. Table on desktop, cards on phones. Print / save as PDF.
- **Saved** (`/saved`) — save, open, edit-and-update, duplicate, rename, delete, add to comparison, export/import JSON. Each item records its tax-data version.
- **Country pages** (`/countries/<name>`) — how each country taxes employees, social contributions, municipality differences, what affects net pay, salary examples calculated live by the engine, FAQ, official sources and a country calculator.
- **Methodology**, **Privacy**, **Disclaimer**, **Settings** (preferences only; tax rules are never editable in the public app).
- **PWA** — installable, works offline from the second visit (exchange rates offline are always labelled as not current).

Design decisions are documented in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## Accuracy and transparency

Every result carries one status: **Verified** (rules reviewed against official sources for the tax year), **Estimate** (some parameters from secondary sources or simplified — currently Greece) or **Incomplete** (information missing, e.g. a new year built from last year's rules).

- **Germany** matches the official BMF wage-tax calculator to the cent for 12 cases across all six tax classes.
- **Sweden** reproduces every worked example in Skatteverket's technical description SKV 433 (2026).
- **Denmark, Netherlands, Norway, Greece** are checked against step-by-step statutory calculations from the official rate tables.
- Country pages quote rates directly from the active dataset, so they can never drift from the calculator.

> NetWorth provides estimates for informational purposes only. Actual take-home pay depends on individual tax circumstances, employment arrangements, deductions, benefits and applicable legislation. This calculator does not replace professional tax advice.

## Project structure

```
src/
  engine/          Country-independent contract, registry, schemas, math (no UI imports)
  countries/<cc>/  One module per country: rule schema + calculation
  data/            Loads tax-data/ (Vite glob in the browser, fs in Node)
  content/         Country-page and homepage copy (numbers read from datasets)
  seo/             Routes, page metadata, structured data
  services/        currency/ · storage/ · scenario.ts (share links, reverse calculation)
  router.tsx       Small path router aware of the deployment base path
  entry-server.tsx Build-time renderer used by scripts/prerender.mjs
  components/ pages/ hooks/ state/ calculations/
tools/tax-admin/   Private tax-administration UI (local only, never built or deployed)
maintenance/       Local service: source monitoring, change detection, validation, versioning, admin API
tax-data/          registry.json + immutable <CC>/<year>.<n>.json datasets
scripts/           prerender, service-worker template, image generation, admin launcher
tests/  e2e/  docs/
```

## Documentation

- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, typography, components and the reasoning behind them
- [docs/TAX_SOURCES.md](docs/TAX_SOURCES.md) — every rate used, with its official source and known limitations
- [docs/MAINTENANCE.md](docs/MAINTENANCE.md) — the private tax-administration tool and review workflow
- [docs/ADDING_A_COUNTRY.md](docs/ADDING_A_COUNTRY.md) — add a country with or without the admin tool
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — free hosting, pre-rendering and base paths

## Costs and privacy

None. No accounts, API keys, databases, analytics or paid services. Fonts are self-hosted; the only request the public site makes is to Frankfurter for exchange rates, carrying a currency code and nothing else.
