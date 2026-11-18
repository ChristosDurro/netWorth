import { BookOpen, Bookmark, Calculator, Columns3, Moon, Settings as SettingsIcon, ShieldCheck, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { CURRENCY_CODES } from '../../services/currency/currencies';
import { ADMIN_ENABLED, useApp, type Route } from '../../state/AppState';
import { cx } from '../common/ui';

interface NavItem {
  route: Route;
  label: string;
  short: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { route: 'calculator', label: 'Calculator', short: 'Calculate', icon: <Calculator size={18} /> },
  { route: 'compare', label: 'Country Comparison', short: 'Compare', icon: <Columns3 size={18} /> },
  { route: 'saved', label: 'Saved Calculations', short: 'Saved', icon: <Bookmark size={18} /> },
  { route: 'settings', label: 'Settings', short: 'Settings', icon: <SettingsIcon size={18} /> },
  { route: 'methodology', label: 'About / Methodology', short: 'About', icon: <BookOpen size={18} /> },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-accent-soft" />
        <path d="M9 22V10l8 9V10m5 12V10" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-ink">NetWorth</div>
          <div className="text-[11px] text-faint">Take-home pay, anywhere</div>
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <a
      href={item.route === 'calculator' ? '#/' : `#/${item.route}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-surface-2 text-ink ring-1 ring-line' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      <span className={active ? 'text-accent' : ''}>{item.icon}</span>
      {item.label}
    </a>
  );
}

export function ThemeToggle() {
  const { effectiveTheme, updateSettings } = useApp();
  const next = effectiveTheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => updateSettings({ theme: next })}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {effectiveTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function Header() {
  const { route, settings, updateSettings, navigate } = useApp();
  const titles: Record<Route, [string, string]> = {
    calculator: ['Understand what you actually earn.', 'Calculate your take-home salary anywhere in the world.'],
    compare: ['Compare countries side by side.', 'The same job, taxed in different places, converted into one currency.'],
    saved: ['Saved calculations', 'Stored only on this device. Nothing is uploaded.'],
    settings: ['Settings', 'Defaults for new calculations and how numbers are shown.'],
    methodology: ['How NetWorth calculates', 'Methodology, sources and limitations.'],
    admin: ['Tax Regulation Update Center', 'Local maintenance: check official sources, review and publish tax data.'],
  };
  const [title, subtitle] = titles[route];
  return (
    <header className="flex flex-col gap-4 pb-6 pt-2 sm:flex-row sm:items-end sm:justify-between lg:pt-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="sr-only" htmlFor="header-currency">
          Preferred output currency
        </label>
        <select
          id="header-currency"
          value={settings.outputCurrency}
          onChange={(e) => updateSettings({ outputCurrency: e.target.value })}
          className="h-9 cursor-pointer rounded-lg border border-line bg-surface pl-3 pr-8 text-sm font-medium text-ink hover:border-line-strong"
          title="Preferred output currency"
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => navigate('settings')}
          aria-label="Open settings"
          title="Settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { route, navigate } = useApp();
  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface px-4 py-6 lg:flex" aria-label="Sidebar">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.route} item={item} active={route === item.route} onClick={() => navigate(item.route)} />
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {ADMIN_ENABLED && (
            <div className="border-t border-line pt-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Admin · local only</p>
              <NavLink item={{ route: 'admin', label: 'Tax Update Center', short: 'Admin', icon: <ShieldCheck size={18} /> }} active={route === 'admin'} onClick={() => navigate('admin')} />
            </div>
          )}
          <p className="px-3 text-[11px] leading-relaxed text-faint">Estimates only — not tax advice. Your data stays on this device.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur lg:hidden">
        <Logo />
        {ADMIN_ENABLED && (
          <button type="button" onClick={() => navigate('admin')} className="text-xs font-medium text-muted hover:text-ink">
            Admin
          </button>
        )}
      </div>

      <main id="main" className="px-4 pb-28 sm:px-6 lg:ml-64 lg:px-10 lg:pb-16">
        <div className="mx-auto max-w-[1180px]">
          <Header />
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Mobile"
      >
        {NAV.map((item) => (
          <a
            key={item.route}
            href={item.route === 'calculator' ? '#/' : `#/${item.route}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(item.route);
            }}
            aria-current={route === item.route ? 'page' : undefined}
            className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', route === item.route ? 'text-accent' : 'text-muted')}
          >
            {item.icon}
            {item.short}
          </a>
        ))}
      </nav>
    </div>
  );
}
