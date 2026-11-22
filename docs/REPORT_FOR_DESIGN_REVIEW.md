# NetWorth — Project report & design brief

*Written for a design review. I'd like concrete, implementable design recommendations back (see "What I'd like from you" at the end). Status as of 22 Nov 2026.*

Live site: https://christosdurro.github.io/netWorth/
Repository: https://github.com/ChristosDurro/netWorth

---

## 1. What NetWorth is

An international **take-home pay calculator**. You enter a gross salary in the country where you'd work (monthly, annual or hourly). It calculates income tax and social contributions with that country's real 2026 rules **in the local currency first**, and only then converts the **net** amount into your preferred currency using the European Central Bank reference rate.

Target users: people weighing a job offer abroad, expats, remote workers, and anyone comparing "€60k in Germany vs 600k DKK in Denmark".

Product principles:
- **Trust over polish.** Every result says which data version produced it, whether the rules are *verified*, *estimated* or *incomplete*, the date of the exchange rate, and links to the official sources.
- **Private.** No accounts, no backend, no tracking. Saved calculations live only in the browser's localStorage.
- **€0 to run.** Static hosting (GitHub Pages), free ECB rates via the Frankfurter API with no key, and no paid services of any kind. This is a hard constraint.

---

## 2. What has been built

### Public website (static React app)
| Area | Status |
|---|---|
| **Calculator** (home screen): country picker with flags, tax year, gross salary with Monthly/Annual/Hourly toggle, municipality picker (DK 98 municipalities, SE 290), Simple/Advanced mode for personal circumstances (church tax, children, age, pension, etc. per country) | Done |
| **Results**: hero card with net pay in the chosen currency (large figure) plus the local-currency equivalent; verification badge; KPI row (annual net, monthly net, effective rate + marginal rate, annual and monthly deductions); tax breakdown with stacked bar and expandable lines; currency conversion card; salary overview table; assumptions & official sources card; disclaimer | Done |
| **Exchange rates**: live ECB rate (Frankfurter), 6 h local cache, stale-cache and built-in fallback clearly labelled as such, manual rate, historical rate by date | Done |
| **Country comparison**: up to 6 rows, each with its own salary in its own currency, all converted to one currency; sortable table that highlights the highest net | Done |
| **Saved calculations**: save/rename/duplicate/delete, reopen, JSON export/import; each saved item keeps the tax-data version it used | Done |
| **Settings**: default currency, tax year, frequency, mode, theme (dark/light/system), number format, decimals | Done |
| **About / Methodology**: gross-to-net explained, how brackets work, exchange rates, verification levels, what's not included, privacy, official sources per country, exact disclaimer | Done |
| **Countries**: Denmark, Germany, Netherlands, Sweden, Norway (verified against official sources); Greece (marked *estimated*: a few values only confirmed via secondary sources) | Done |
| Dark mode (default) + light mode, desktop sidebar + mobile bottom tab bar, keyboard focus styles, skip link, ARIA labels, reduced-motion support | Done |

### Tax engine
- One module per country behind a standard interface, so adding a country needs no UI changes.
- Every number lives in versioned JSON datasets (`tax-data/DK/2026.1.json` …) with source metadata. Nothing is hard-coded, and a tax year never silently borrows another year's data.
- Germany follows the official BMF wage-tax algorithm and matches 12 official reference calculations exactly. Sweden matches Skatteverket's worked examples.

### Tax Regulation Update Center (local admin tool, not public)
- One click checks all 14 official tax-authority sources, politely (respects robots.txt and crawl delays).
- Detects changes, reads specific values from the official pages, and compares the official German calculator's results with ours.
- Proposals go through review → approve/reject. Approval validates and runs every test before a new data version goes live, and rolls back automatically on failure.
- Supports version rollback, "Add country" scaffolding (with empty values, never invented), full history with JSON export, and a monthly automatic check via GitHub Actions that opens a pull request.

### Quality
- 207 unit/UI tests (Vitest + Testing Library), 16 end-to-end runs (Playwright, desktop + mobile), CI on every push, automatic deploy to GitHub Pages.
- Production JS: one bundle of about 145 kB gzipped, including all tax data and municipality lists.

---

## 3. How complete is it?

- **Against the original specification: ~95%.** Everything specified is built, tested and live. The remaining 5% is verification that can't be done from code: testing on a real phone (only emulated so far), upgrading Greece from *estimated* to *verified*, and confirming two Danish top-tax ceilings against a primary source.
- **As a polished public product people find and trust: ~70%.** The tool works, but discoverability (SEO), first impression/onboarding, social sharing and some visual polish are missing. See below.

---

## 4. What's still to do

### Functional / verification
1. Test on real iOS and Android phones (so far only emulators and automated mobile viewports).
2. Greece: confirm child-scale rates and the employee social-security rate from primary sources.
3. Denmark: confirm the top-tax ceilings from a primary source.
4. More countries (e.g. ES, IT, FR, PT, IE, UK, CH, PL, AT, BE, FI). The scaffolding exists, but each needs research.

### SEO (currently weak — honest assessment)
- **Hash routing** (`/#/compare`): search engines see one single URL, so there are no indexable pages for "compare", "methodology" and so on.
- **Client-side rendering only**: the HTML is an empty `<div id="root">` until JavaScript runs. Google can render it, but social previews (WhatsApp, LinkedIn, X) and many crawlers see nothing.
- **Only basics exist**: `<title>`, meta description, `lang="en"` and theme-color.
- **Missing**: per-page titles and descriptions, canonical URLs, Open Graph/Twitter tags, a social preview image, `robots.txt`, `sitemap.xml`, structured data (`WebApplication`, `FAQPage`), a web-app manifest/PWA icons, and indexable text content (FAQ, per-country explanations).
- **Biggest opportunity**: per-country landing pages with real content, e.g. "Denmark salary calculator 2026 — take-home pay after tax", "Germany net salary calculator", plus country-vs-country pages. These are what people search for.
- **Fix path (still €0)**: switch to path-based routes and **pre-render** each page to static HTML at build time. GitHub Pages can serve them, using a `404.html` fallback for the app.

### Design / UX gaps I'm aware of
- **No landing page**: the site opens straight into the calculator. That's good for returning users, but first-time visitors get no "what is this / why trust it" moment, and there's nothing for SEO.
- **Webfont not loaded**: the font stack names *Inter*, but Inter isn't actually loaded, so users see their system font (Segoe UI, SF, Roboto or DejaVu). It can be self-hosted for free (OFL licence).
- **Contrast**: the "faint" text colour is about 3.9:1 on the dark background and about 2.9:1 in light mode, which is below WCAG AA (4.5:1) for small text. It's used for helper text and captions.
- **Visual identity**: the brand is a placeholder (simple "N" monogram, cyan accent), and there's no illustration, imagery or OG image.
- **Results section** is information-dense: hero, 5 KPIs, breakdown, conversion, table, notes. It is complete, but long on mobile.
- **No onboarding**: no example scenarios ("Software engineer in Copenhagen, 55k DKK"), and no shareable result link (state lives only in localStorage).
- **English-only UI**: country-specific terms are shown in English with local names in brackets.
- **Not yet done**: an accessibility audit with a screen reader and axe; privacy-friendly free analytics (e.g. Cloudflare Web Analytics or GoatCounter); a privacy/imprint page; a custom domain (the only possible cost, ~€10/yr, optional).

---

## 5. The current design in detail

### Overall direction
"Fintech dashboard" aesthetic inspired by **Wise, Revolut and Linear**: calm, dark-first, data-dense but quiet, with one accent colour and lots of hairline borders. The aim is trustworthy and precise, not playful.

### Technology constraints for any redesign
- React 19 + TypeScript + **Tailwind CSS 4**. Colours are CSS custom properties mapped to Tailwind tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent` …), with `.dark` on `<html>` switching the palette.
- Icons: **lucide-react** (outline, 1.5–2 px stroke). Flags are inline SVG.
- No commercial UI kits or paid fonts/assets. Free fonts/illustrations (OFL/MIT/CC0) are fine.
- Must stay a static site, with no server.

### Colour tokens
| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `bg` | `#090d14` | `#f5f6f8` | page background |
| `surface` | `#10161f` | `#ffffff` | cards, sidebar |
| `surface-2` | `#151c28` | `#f0f2f5` | inset areas, segmented controls, side panels |
| `line` / `line-strong` | `#1f2836` / `#2c3748` | `#e2e5eb` / `#cfd4dd` | 1 px borders, dividers |
| `ink` | `#f1f4f8` | `#0e131d` | primary text, figures |
| `muted` | `#8d97a8` | `#5a6373` | labels, secondary text |
| `faint` | `#667083` | `#8a93a3` | captions, hints (contrast too low) |
| `accent` | `#22d3ee` (cyan) | `#0e7490` (teal) | primary button, active nav, focus ring, links |
| `pos` / `neg` / `warn` | `#4ade80` / `#f87171` / `#fbbf24` | `#15803d` / `#b4232c` / `#a15c07` | net pay, deductions, "estimated" badges |
| shadow | soft, large-blur, low-opacity | same, lighter | `shadow-card` on cards |

Breakdown/chart colours: green = take-home, cyan = income tax, violet = social contributions.

### Typography
- System sans (Inter intended but not loaded). Weights 500/600, tight tracking on headings.
- Page title (H1) is 24 px on mobile and 28 px on desktop, semibold, with a 15 px muted subtitle underneath.
- Section labels are 13 px **uppercase**, letter-spaced 0.08 em, in the muted colour (e.g. "SALARY INFORMATION", "TAX BREAKDOWN").
- The hero figure is 40 px on mobile and 56 px on desktop, semibold and tight, followed by "/ month" in muted text.
- All numbers use **tabular figures** so columns line up and digits don't jump while typing.
- Body text is 14–15 px; helper text is 11–13 px.

### Layout & navigation
- **Desktop (≥1024 px)**: fixed 256 px left **sidebar** (logo + tagline, 5 nav items with icons, footer note "Estimates only — not tax advice. Your data stays on this device."). Content column max-width 1180 px with generous padding. Each page header has the H1 and subtitle on the left and a currency dropdown, theme toggle and settings button on the right.
- **Mobile**: sticky translucent top bar (logo) and a fixed **bottom tab bar** with 5 items (Calculate, Compare, Saved, Settings, About), using a blurred translucent background and safe-area padding.
- **Shapes**: 1 px borders everywhere, rounded-2xl (16 px) cards, rounded-xl/lg for inner controls, and 36 px-high header controls.
- **Segmented controls** (pill groups) are used for Monthly/Annual/Hourly, Simple/Advanced and Latest/Historical. Custom select styling uses a chevron icon.

### Page-by-page
1. **Calculator (home)**
   - A big card split in two: left is "Salary information" (country, year, salary + frequency, municipality, personal-info sub-card, Calculate button); right is "Output preferences" on a slightly darker panel (output currency, auto-conversion switch, latest/historical rate, a rate card with a status badge such as "LATEST · CACHED").
   - Below it, the results: the **hero card** (soft cyan glow blob in the corner, net pay, local equivalent, "Converted after tax using the ECB rate of …", a verification badge such as "VERIFIED RULES", data version, Save button).
   - Then a **row of 5 KPI tiles**, then a 2-column grid: tax breakdown (stacked bar + itemised lines with red minus amounts) | currency conversion (flow chips "Gross pay → Taxes → Net pay → Exchange rate → Converted net" + detail list) and the salary overview table. After that come the "Assumptions & sources" card and the disclaimer.
   - Results update live as you type. The Calculate button mainly scrolls to the results.
2. **Compare**: a settings strip (tax year, currency, Monthly/Annual), editable rows (country picker, salary in that country's currency, per-row "Assumptions" popover, remove), "Add country", then a comparison table (gross, net in the chosen currency, net local, effective tax) with a "Highest net" sort and highlight.
3. **Saved**: list of cards with name, country, salary, net, date and actions (Open, Rename, Duplicate, Delete), plus Export JSON / Import, and an empty state.
4. **Settings**: two-column form of defaults, theme and number formatting.
5. **About / Methodology**: explanatory cards (gross-to-net, brackets, exchange rates, verification levels, not included, privacy), per-country official sources, disclaimer.

### Interaction & states
- Empty state ("Enter a gross salary"), inline error notices, warning notices for estimated/incomplete data or offline rates.
- Toggling the theme is instant (no flash on load, because the theme is applied before first paint).
- Focus ring is a 2 px accent outline. Motion is limited to colour transitions and a smooth bar-width transition, and is disabled under reduced-motion.

---

## 6. Open design questions

1. **Landing page or not?** Options:
   - (a) keep the calculator as home, with a compact intro and trust strip above it;
   - (b) a separate landing page ("/") with hero, example calculation, how it works, countries, FAQ, and the tool at "/calculator";
   - (c) calculator-first home plus SEO landing pages per country ("/denmark-salary-calculator").

   My current leaning is (c) with a light version of (a). Do you agree?
2. How should the **results** be structured so the key answer (net per month in my currency) is instant, while the detail stays available but less overwhelming, especially on mobile? Progressive disclosure, tabs, or a sticky summary?
3. A stronger **visual identity**: logo idea, accent colour (is cyan right for "money/trust"?), font pairing (free), and whether to add illustration, gradients or imagery without looking generic or "crypto".
4. **Light mode**: should it get equal design love, or is dark-first right for this audience?
5. **Comparison page**: is a table the best format on mobile? Would cards or a ranked bar chart work better?
6. **Shareable results**: encode inputs in the URL (no backend) and generate an OG preview?
7. Which **trust signals** matter most visually (verification badge, source links, "last checked" date, open-source link)?
8. What **SEO content** should each page carry without cluttering the tool?

## 7. What I'd like from you

Concrete, implementable recommendations rather than general advice:
- A revised **information architecture / sitemap** (pages and URL paths), including whether there should be a landing page.
- **Wireframe-level descriptions** of the home/landing page, the calculator results (desktop + mobile) and the compare page: section order, what's above the fold, and component choices.
- A **design-token proposal**: colours for both themes with WCAG AA contrast, font family (free), type scale, radii, spacing and shadows. Please express it as CSS variables so it drops into the existing token system.
- **Microcopy** suggestions for the hero, empty states and trust messaging.
- An **SEO plan**: page titles and meta descriptions for each page type, structured-data types, the content blocks per country page, and internal linking.
- Anything that would make it feel more premium **without** adding cost, accounts, tracking or a backend.
