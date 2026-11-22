import { Bookmark, Calculator, ChevronDown, Columns3, Globe2, Menu, Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { publicCountries } from '../../content/countries';
import { TAGLINE } from '../../content/home';
import { Link, useRouter } from '../../router';
import { CURRENCY_CODES } from '../../services/currency/currencies';
import { useApp } from '../../state/AppState';
import { Flag } from '../common/Flag';
import { cx } from '../common/ui';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="NetWorth home">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <path d="M10.5 22V10l11 12V10" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent-ink" />
      </svg>
      {!compact && <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">NetWorth</span>}
    </Link>
  );
}

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  const { path } = useRouter();
  const active = isActive(path, to);
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={cx('rounded-md px-3 py-2 text-sm font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}>
      {children}
      <span className={cx('mt-0.5 block h-0.5 rounded-full transition-colors', active ? 'bg-accent' : 'bg-transparent')} aria-hidden="true" />
    </Link>
  );
}

function CountriesMenu() {
  const [open, setOpen] = useState(false);
  const { path } = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const active = isActive(path, '/countries');
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" aria-expanded={open} aria-controls="countries-menu" onClick={() => setOpen((o) => !o)} className={cx('rounded-md px-3 py-2 text-sm font-medium transition-colors', active ? 'text-ink' : 'text-muted hover:text-ink')}>
        <span className="inline-flex items-center gap-1">
          Countries <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
        </span>
        <span className={cx('mt-0.5 block h-0.5 rounded-full', active ? 'bg-accent' : 'bg-transparent')} aria-hidden="true" />
      </button>
      {open && (
        <div id="countries-menu" className="absolute left-0 top-full z-50 mt-1 w-64 animate-enter rounded-xl border border-line bg-elevated p-1.5 shadow-pop">
          <ul>
            {publicCountries().map((c) => (
              <li key={c.code}>
                <Link to={`/countries/${c.slug}`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-surface-2">
                  <Flag code={c.code} />
                  <span className="flex-1">{c.name}</span>
                  <span className="mono text-xs text-faint">{c.currency}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link to="/countries" className="block rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
              All countries
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { effectiveTheme, updateSettings } = useApp();
  const next = effectiveTheme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={() => updateSettings({ theme: next })} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink">
      {effectiveTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function CurrencySelect({ id }: { id: string }) {
  const { settings, updateSettings } = useApp();
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        Preferred currency
      </label>
      <select
        id={id}
        value={settings.outputCurrency}
        onChange={(e) => updateSettings({ outputCurrency: e.target.value })}
        title="Preferred currency for converted amounts"
        className="mono h-9 cursor-pointer rounded-lg border border-line bg-transparent pl-2.5 pr-7 text-[13px] font-medium text-ink hover:border-line-strong"
      >
        {CURRENCY_CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </>
  );
}

const TABS = [
  { to: '/calculator', label: 'Calculate', icon: Calculator },
  { to: '/compare', label: 'Compare', icon: Columns3 },
  { to: '/countries', label: 'Countries', icon: Globe2 },
  { to: '/saved', label: 'Saved', icon: Bookmark },
];

function MobileTabs() {
  const { path } = useRouter();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    if (!more) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [more]);
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close menu" className="absolute inset-0 animate-fade bg-black/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 animate-enter rounded-t-2xl border-t border-line bg-elevated px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-3 shadow-pop">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
            <nav aria-label="More pages" className="grid grid-cols-2 gap-1">
              {[
                ['/', 'Home'],
                ['/methodology', 'Methodology'],
                ['/settings', 'Settings'],
                ['/privacy', 'Privacy'],
                ['/disclaimer', 'Disclaimer'],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-surface-2">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
      <nav className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Mobile">
        <div className="grid grid-cols-5">
          {TABS.map(({ to, label, icon: Icon }) => {
            const active = isActive(path, to);
            return (
              <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', more ? 'text-accent' : 'text-muted')}>
            {more ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            More
          </button>
        </div>
      </nav>
    </>
  );
}

function Footer() {
  const countries = publicCountries();
  const col = (title: string, links: [string, string][]) => (
    <div>
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-muted hover:text-ink">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{TAGLINE} Free, private and transparent about every number.</p>
        </div>
        {col('Product', [
          ['/calculator', 'Salary calculator'],
          ['/compare', 'Compare countries'],
          ['/saved', 'Saved calculations'],
          ['/settings', 'Settings'],
        ])}
        {col(
          'Countries',
          countries.map((c) => [`/countries/${c.slug}`, c.name]),
        )}
        {col('About', [
          ['/methodology', 'Methodology & sources'],
          ['/privacy', 'Privacy'],
          ['/disclaimer', 'Disclaimer'],
        ])}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-faint sm:px-6">
          Estimates for information only — not tax advice. Exchange rates: European Central Bank reference rates via Frankfurter. No accounts, no tracking: your data stays in this browser.
        </p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center md:flex">
            <NavItem to="/calculator">Calculator</NavItem>
            <NavItem to="/compare">Compare</NavItem>
            <CountriesMenu />
            <NavItem to="/methodology">Methodology</NavItem>
            <NavItem to="/saved">Saved</NavItem>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <CurrencySelect id="header-currency" />
            <ThemeToggle />
            <Link to="/settings" aria-label="Settings" title="Settings" className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink md:inline-flex">
              <SettingsIcon size={17} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 pb-24 md:pb-0">
        {children}
      </main>
      <Footer />
      <MobileTabs />
    </div>
  );
}

/** Standard page header: one h1 per page. */
export function PageHeader({ title, description, eyebrow, actions, children }: { title: string; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      {eyebrow}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-4xl">{title}</h1>
          {description && <p className="mt-3 text-base leading-relaxed text-muted sm:text-[17px]">{description}</p>}
        </div>
        {actions && <div className="no-print flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Container({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cx('mx-auto px-4 sm:px-6', narrow ? 'max-w-3xl' : 'max-w-6xl', className)}>{children}</div>;
}

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-faint">
        {items.map((c, i) => (
          <li key={c.path} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-muted">
                {c.name}
              </span>
            ) : (
              <Link to={c.path} className="hover:text-ink">
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
