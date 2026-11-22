import { useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { CalculatorPage } from './pages/CalculatorPage';
import { ComparePage } from './pages/ComparePage';
import { CountriesPage, CountryPage } from './pages/CountryPages';
import { DisclaimerPage, NotFoundPage, PrivacyPage } from './pages/InfoPages';
import { HomePage } from './pages/HomePage';
import { MethodologyPage } from './pages/MethodologyPage';
import { SavedPage } from './pages/SavedPage';
import { SettingsPage } from './pages/SettingsPage';
import { RouterProvider, useRouter } from './router';
import { matchRoute, pageMeta } from './seo/routes';
import { AppStateProvider } from './state/AppState';

function Page() {
  const { path } = useRouter();
  const match = matchRoute(path);

  // Pre-rendered pages already carry full <head> tags; keep title and description in step on client navigation.
  useEffect(() => {
    const meta = pageMeta(match);
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  }, [match.name, match.path]); // eslint-disable-line react-hooks/exhaustive-deps

  switch (match.name) {
    case 'home':
      return <HomePage />;
    case 'calculator':
      return <CalculatorPage />;
    case 'compare':
      return <ComparePage />;
    case 'saved':
      return <SavedPage />;
    case 'settings':
      return <SettingsPage />;
    case 'methodology':
      return <MethodologyPage />;
    case 'countries':
      return <CountriesPage />;
    case 'country':
      return <CountryPage code={match.code as string} />;
    case 'privacy':
      return <PrivacyPage />;
    case 'disclaimer':
      return <DisclaimerPage />;
    default:
      return <NotFoundPage />;
  }
}

/** `url` is only passed when pre-rendering pages at build time. */
export function App({ url }: { url?: string }) {
  return (
    <RouterProvider url={url}>
      <AppStateProvider>
        <Layout>
          <Page />
        </Layout>
      </AppStateProvider>
    </RouterProvider>
  );
}
