/**
 * Content-Security-Policy for served HTML (decision 3): local resources and
 * local fetch/XHR work (`'self'` = the `/browser-html` route origin), external
 * subresources are blocked, and navigation is NOT restricted. There is
 * deliberately NO `sandbox` directive (decision 1).
 */
export const BROWSER_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'"
