import { renderToString } from 'react-dom/server';
import { App } from './App';
import { matchRoute, pageMeta, structuredData, allPagePaths } from './seo/routes';

/** Build-time only: renders one page to HTML for scripts/prerender.mjs. */
export function render(path: string): string {
  return renderToString(<App url={path} />);
}

export { allPagePaths, matchRoute, pageMeta, structuredData };
