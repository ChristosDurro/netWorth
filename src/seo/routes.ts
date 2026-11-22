import { countryBySlug, countryContent, publicCountries } from '../content/countries';
import { HOME_FAQ, SITE_NAME, TAGLINE } from '../content/home';
import type { FaqItem } from '../content/countries';

export type RouteName = 'home' | 'calculator' | 'compare' | 'saved' | 'settings' | 'methodology' | 'countries' | 'country' | 'privacy' | 'disclaimer' | 'notFound';

export interface RouteMatch {
  name: RouteName;
  path: string;
  /** Country code for /countries/:slug. */
  code?: string;
}

const STATIC: Record<string, RouteName> = {
  '/': 'home',
  '/calculator': 'calculator',
  '/compare': 'compare',
  '/saved': 'saved',
  '/settings': 'settings',
  '/methodology': 'methodology',
  '/countries': 'countries',
  '/privacy': 'privacy',
  '/disclaimer': 'disclaimer',
};

export function matchRoute(path: string): RouteMatch {
  if (STATIC[path]) return { name: STATIC[path], path };
  const m = /^\/countries\/([a-z-]+)$/.exec(path);
  if (m) {
    const c = countryBySlug(m[1]);
    if (c) return { name: 'country', path, code: c.code };
  }
  return { name: 'notFound', path };
}

export interface Crumb {
  name: string;
  path: string;
}
export interface PageMeta {
  title: string;
  description: string;
  path: string;
  index: boolean;
  breadcrumbs: Crumb[];
  faq?: FaqItem[];
  kind: 'website' | 'app' | 'article';
}

const HOME: Crumb = { name: 'Home', path: '/' };

export function pageMeta(match: RouteMatch): PageMeta {
  const t = (s: string) => `${s} · ${SITE_NAME}`;
  switch (match.name) {
    case 'home':
      return {
        title: `${SITE_NAME} — International take-home pay calculator`,
        description: 'Compare salaries across countries after income tax and social contributions, converted into the currency you use. Free, private, no account.',
        path: '/',
        index: true,
        breadcrumbs: [],
        faq: HOME_FAQ,
        kind: 'website',
      };
    case 'calculator':
      return {
        title: t('Salary after tax calculator'),
        description: 'Calculate take-home pay after income tax and social contributions in Denmark, Germany, the Netherlands, Sweden, Norway and Greece, with ECB exchange rates.',
        path: '/calculator',
        index: true,
        breadcrumbs: [HOME, { name: 'Calculator', path: '/calculator' }],
        kind: 'app',
      };
    case 'compare':
      return {
        title: t('Compare salaries between countries'),
        description: 'Compare job offers in different countries by what you actually take home: each salary taxed under its own country’s rules, then converted into one currency.',
        path: '/compare',
        index: true,
        breadcrumbs: [HOME, { name: 'Compare', path: '/compare' }],
        kind: 'app',
      };
    case 'saved':
      return { title: t('Saved calculations'), description: 'Your saved salary calculations, stored only in this browser.', path: '/saved', index: false, breadcrumbs: [HOME, { name: 'Saved', path: '/saved' }], kind: 'app' };
    case 'settings':
      return { title: t('Settings'), description: 'Default currency, country, tax year and display preferences for NetWorth.', path: '/settings', index: false, breadcrumbs: [HOME, { name: 'Settings', path: '/settings' }], kind: 'app' };
    case 'methodology':
      return {
        title: t('Methodology, sources and verification'),
        description: 'How NetWorth turns gross salary into net pay: income tax, social contributions, brackets, credits, municipalities, exchange rates, verification and limitations.',
        path: '/methodology',
        index: true,
        breadcrumbs: [HOME, { name: 'Methodology', path: '/methodology' }],
        kind: 'article',
      };
    case 'countries':
      return {
        title: t('Salary calculators by country'),
        description: `Take-home pay calculators and tax guides for ${publicCountries()
          .map((c) => c.name)
          .join(', ')}.`,
        path: '/countries',
        index: true,
        breadcrumbs: [HOME, { name: 'Countries', path: '/countries' }],
        kind: 'website',
      };
    case 'country': {
      const info = publicCountries().find((c) => c.code === match.code);
      const content = info ? countryContent(info.code, info.year) : null;
      if (!info || !content) return pageMeta({ name: 'notFound', path: match.path });
      return {
        title: t(`${info.name} salary calculator ${info.year} — take-home pay after tax`),
        description: content.summary,
        path: match.path,
        index: true,
        breadcrumbs: [HOME, { name: 'Countries', path: '/countries' }, { name: info.name, path: match.path }],
        faq: content.faq,
        kind: 'article',
      };
    }
    case 'privacy':
      return { title: t('Privacy'), description: 'NetWorth has no accounts, no tracking and no server-side storage. What stays in your browser and the one request we make.', path: '/privacy', index: true, breadcrumbs: [HOME, { name: 'Privacy', path: '/privacy' }], kind: 'article' };
    case 'disclaimer':
      return { title: t('Disclaimer'), description: 'NetWorth provides estimates for information only and does not replace professional tax advice.', path: '/disclaimer', index: true, breadcrumbs: [HOME, { name: 'Disclaimer', path: '/disclaimer' }], kind: 'article' };
    default:
      return { title: t('Page not found'), description: TAGLINE, path: match.path, index: false, breadcrumbs: [], kind: 'website' };
  }
}

/** Every pre-rendered, indexable-or-not page. The 404 page is rendered separately. */
export function allPagePaths(): string[] {
  return [...Object.keys(STATIC), ...publicCountries().map((c) => `/countries/${c.slug}`)];
}

/** JSON-LD objects that describe content actually visible on the page. */
export function structuredData(meta: PageMeta, siteUrl: string): object[] {
  const abs = (p: string) => `${siteUrl}${p === '/' ? '/' : `${p}/`}`;
  const out: object[] = [];
  if (meta.kind === 'website' && meta.path === '/') {
    out.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: abs('/'), description: meta.description });
  }
  if (meta.path === '/' || meta.kind === 'app') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: abs(meta.path === '/' ? '/calculator' : meta.path),
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    });
  }
  if (meta.breadcrumbs.length > 1) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: meta.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path) })),
    });
  }
  if (meta.faq?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: meta.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  return out;
}
