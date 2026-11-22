# NetWorth design system

The goal: a calm, precise fintech product — closer to Wise, Linear or Stripe than to a tax form. Every visual element has to help someone understand money; nothing is decorative.

## Principles

1. **One answer first.** Each screen leads with the number that matters (net take-home pay per month in your currency). Everything else is supporting detail, visibly smaller.
2. **Trust is visible.** Status (Verified / Estimate / Incomplete), dataset version, rate date and sources are always one glance or one click away.
3. **Progressive disclosure.** Country, salary and frequency are always visible; personal circumstances, rate options and advanced figures open on demand.
4. **Quiet surfaces.** Hairline borders, few cards, one accent colour used sparingly; green only for positive outcomes and verified states.
5. **Mobile is designed, not shrunk.** Bottom tab bar, stacked comparison cards, no horizontal page scroll (tested with wide fallback fonts).

## Tokens (`src/index.css`)

Components use semantic Tailwind tokens only (`bg-surface`, `text-muted`, `border-line` …), defined as CSS variables for `:root` (light) and `.dark`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#090d14` | `#f5f7fa` | page |
| `surface` / `surface-2` / `elevated` | `#10161f` / `#151c28` / `#1b2431` | `#fff` / `#eef2f7` / `#e5eaf1` | cards / insets / menus, tooltips |
| `line` / `line-strong` | `#222c3b` / `#3a485c` | `#dde3eb` / `#b8c4d2` | dividers / emphasis borders |
| `control` | `#5e6e85` | `#7d8a9c` | input borders (≥3:1, WCAG 1.4.11) |
| `ink` / `muted` / `faint` | `#f1f5f9` / `#a5b0c0` / `#8b97a8` | `#111827` / `#4b5567` / `#5f6b7e` | text levels |
| `accent` | `#22d3ee` | `#0c6b85` | primary action, focus, links |
| `pos` / `neg` / `warn` | `#4ade80` / `#f87171` / `#fbbf24` | `#12703a` / `#b91c1c` / `#92400e` | outcomes and status only |
| `chart-*` | net, income tax, social, other, optional | | breakdown bar |

Every text colour is tested against `bg`, `surface` and `surface-2` for WCAG AA (4.5:1) in `tests/app/seo.test.ts`; button text on accent and input borders are tested too. The light accent, positive and secondary-text colours were darkened slightly from the brief to pass on every surface.

## Typography

- **Inter Variable** (self-hosted via Fontsource) for interface text, with `cv11`/`ss01` for clearer numerals.
- **IBM Plex Mono** for data: breakdown amounts, tables, exchange rates (`.mono`). The large hero figure stays in Inter with tabular numerals (`.num`) — mono at 60px reads as "terminal", not "finance".
- Scale: hero figure 44/60px, page title 28/36px, section title 15px semibold, body 15px, captions 12–13px. Headings use slight negative tracking.

## Components (`src/components/common/ui.tsx`)

Card (12px radius, hairline border), SectionTitle (sentence case), Button / ButtonLink (primary, secondary, ghost, danger; sm/md/lg), Field (label, help, error, optional tooltip), Select, TextInput (44px on touch, 40px on desktop), Switch, Segmented (WAI-ARIA radio group with arrow keys), Badge, Notice, EmptyState, InfoTip (toggle tip), Disclosure (native `<details>`, works without JavaScript), Row.

## Layout

- Desktop: sticky top navigation (Calculator, Compare, Countries menu, Methodology, Saved) with currency, theme and settings on the right; content width 1152px; calculator in a 400px input column + results column.
- Mobile: top bar (logo, currency, theme) + bottom tab bar (Calculate, Compare, Countries, Saved, More sheet).
- Footer on every page: product links, every country, methodology, privacy, disclaimer.

## Motion

Short (150–320ms), ease-out, never blocking: result card entrance, the hero figure tweening to its new value, disclosure fades, tab/segment transitions. All disabled under `prefers-reduced-motion`.

## Accessibility

Semantic landmarks and one h1 per page, skip link, visible focus ring, labelled controls, keyboard-operable country picker and segmented controls, `aria-live` results, focusable scroll regions, underlined in-text links. Axe (WCAG 2.1 AA rules) runs on eight page types in the end-to-end suite.

## Print

`@media print` switches to a white, ink-only palette and hides navigation and controls, so "Print / PDF" on the calculator and comparison produces a clean document.
