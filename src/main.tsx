import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { App } from './App';
import { BASE } from './router';
import './index.css';

// Pages are pre-rendered for search engines and first paint. The client renders
// fresh (instead of hydrating) because settings and saved data live in this
// browser's storage and legitimately differ from the build-time markup.
const root = document.getElementById('root') as HTMLElement;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {
      /* offline support is optional */
    });
  });
}
