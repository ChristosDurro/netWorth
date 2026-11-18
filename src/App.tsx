import { lazy, Suspense } from 'react';
import { Layout } from './components/layout/Layout';
import { CalculatorPage } from './pages/CalculatorPage';
import { ComparePage } from './pages/ComparePage';
import { MethodologyPage } from './pages/MethodologyPage';
import { SavedPage } from './pages/SavedPage';
import { SettingsPage } from './pages/SettingsPage';
import { AppStateProvider, useApp } from './state/AppState';

// The Update Center is a local maintenance tool. `import.meta.env.DEV` is a
// build-time constant, so production bundles do not contain this page at all.
const AdminPage = import.meta.env.DEV ? lazy(() => import('./pages/AdminPage')) : null;

function Routes() {
  const { route } = useApp();
  switch (route) {
    case 'compare':
      return <ComparePage />;
    case 'saved':
      return <SavedPage />;
    case 'settings':
      return <SettingsPage />;
    case 'methodology':
      return <MethodologyPage />;
    case 'admin':
      return AdminPage ? (
        <Suspense fallback={<p className="text-sm text-muted">Loading Update Center…</p>}>
          <AdminPage />
        </Suspense>
      ) : (
        <CalculatorPage />
      );
    default:
      return <CalculatorPage />;
  }
}

export function App() {
  return (
    <AppStateProvider>
      <Layout>
        <Routes />
      </Layout>
    </AppStateProvider>
  );
}
