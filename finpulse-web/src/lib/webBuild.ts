/**
 * Web build switch (Phase 42, v2.10).
 * ====================================
 * `VITE_WEB_BUILD=true npm run build` produces the browser-only build for the
 * public website. With the flag unset (desktop / Electron build) nothing here
 * changes behaviour.
 */

export const IS_WEB_BUILD: boolean = import.meta.env.VITE_WEB_BUILD === 'true';

/**
 * Routes that work in the web build without a local server.
 * 'hub' is the suite picker; the rest are browser-only suites.
 * Phase 43 will hide the server-only steps inside these routes.
 */
export const WEB_ALLOWED_ROUTES: readonly string[] = ['hub', 'reco', 'income-tax'];
// 'tds-reco' is intentionally NOT here yet: its ledger/party mapping and reconcile step run on the server DB.

/** True when the route can be shown. Always true in the desktop build. */
export const isRouteAvailableOnWeb = (route: string): boolean =>
  !IS_WEB_BUILD || WEB_ALLOWED_ROUTES.includes(route);
