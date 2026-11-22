import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * A deliberately small path router. The site is pre-rendered to one folder per page
 * (dist/compare/index.html …), so every URL is a real file on static hosting and
 * client-side navigation only swaps the React tree.
 *
 * Paths inside the app never contain the deployment base ("/netWorth/" on GitHub
 * Pages): `href()` adds it, `stripBase()` removes it.
 */
export const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

/** "/compare/" → "/compare"; "" → "/". */
export function normalisePath(p: string): string {
  const clean = ('/' + p.replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
  return clean.length > 1 ? clean.replace(/\/+$/, '') : '/';
}

export function stripBase(pathname: string): string {
  const base = BASE.replace(/\/$/, '');
  const rest = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return normalisePath(rest);
}

/** App path (optionally with ?query or #hash) → URL on the deployed site, with the trailing slash GitHub Pages serves. */
export function href(to: string): string {
  const m = /^([^?#]*)(.*)$/.exec(to) as RegExpExecArray;
  const path = normalisePath(m[1] || '/');
  return path === '/' ? `${BASE}${m[2]}` : `${BASE}${path.slice(1)}/${m[2]}`;
}

/** Old builds used hash routes ("#/compare"); keep those links working. */
export function legacyHashTarget(hash: string): string | null {
  const m = /^#\/([a-z-]*)/.exec(hash);
  if (!m) return null;
  return m[1] === '' || m[1] === 'admin' ? '/' : `/${m[1]}`;
}

interface RouterValue {
  path: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean; keepScroll?: boolean }) => void;
}
const RouterCtx = createContext<RouterValue | null>(null);

function readLocation(): { path: string; search: string } {
  return { path: stripBase(window.location.pathname), search: window.location.search };
}

export function RouterProvider({ children, url }: { children: ReactNode; url?: string }) {
  const [loc, setLoc] = useState(() => {
    if (url !== undefined) {
      const u = new URL(url, 'http://prerender.local');
      return { path: normalisePath(u.pathname), search: u.search };
    }
    const legacy = legacyHashTarget(window.location.hash);
    if (legacy) window.history.replaceState(null, '', href(legacy));
    return readLocation();
  });

  useEffect(() => {
    if (url !== undefined) return;
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [url]);

  const navigate = useCallback((to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) => {
    const target = href(to);
    if (opts.replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    setLoc(readLocation());
    if (!opts.keepScroll) window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ ...loc, navigate }), [loc, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export function useRouter(): RouterValue {
  const v = useContext(RouterCtx);
  if (!v) throw new Error('useRouter must be used inside <RouterProvider>');
  return v;
}

/** In-app link: a real <a href> (crawlable, opens in new tab) that navigates client-side on a plain click. */
export function Link({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { navigate } = useRouter();
  return (
    <a
      href={href(to)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
