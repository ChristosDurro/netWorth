import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import { Moon, ShieldCheck, Sun } from 'lucide-react';
import AdminApp from './AdminApp';
import './admin.css';

function Shell() {
  const [dark, setDark] = useState(true);
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <ShieldCheck size={18} className="text-accent" />
          <span className="text-[15px] font-semibold text-ink">NetWorth · Tax administration</span>
          <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">Local only</span>
          <button
            type="button"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Toggle theme"
            onClick={() => {
              document.documentElement.classList.toggle('dark', !dark);
              setDark(!dark);
            }}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold tracking-[-0.02em] text-ink">Tax Regulation Update Center</h1>
        <p className="mb-8 text-sm text-muted">Check official sources, review proposed changes, validate and test new dataset versions, and roll back. Nothing reaches the public site until you approve it, the tests pass and you commit and push.</p>
        <AdminApp />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
