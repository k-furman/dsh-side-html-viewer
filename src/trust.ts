/**
 * Browser-trust fence for the `/browser-html` route.
 *
 * Behaviourally mirrors the fence `dsh-better-sidebar` uses for its own
 * routes (itself a copy of the `/api` gateway fence in
 * `@deepseek-ai/dsh-client-connection`, BSD-3-Clause). The two confused-deputy
 * paths a browser opens against a local HTTP server are the same ones here:
 *
 * - **DNS rebinding** — a page on `attacker.example` resolving that name to
 *   `127.0.0.1` would otherwise read local files through this route. The
 *   `Host` fence binds every request, browser-looking or not: over plain HTTP
 *   a browser attaches neither `Origin` nor Fetch Metadata to reads (images,
 *   navigations), so `Host` is the one header rebinding cannot forge.
 * - **Cross-site requests** — a malicious page firing a request at this route
 *   is refused by the Fetch Metadata marker and the `Origin` comparison.
 *
 * This is a request-provenance fence, NOT authentication: anything that can
 * reach the loopback port passes. Network reachability and authentication are
 * deliberately out of scope (the bind host is the webserver's business).
 */

/** The request facts the fence reads (structural subset of `IncomingMessage`). */
export interface MinimalRequestHeaders {
  readonly headers: Record<string, string | string[] | undefined>
}

/** Read one header as a plain string, ignoring a repeated-header array. */
function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a `Host` authority, or `undefined` when unparsable. */
function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/**
 * Whether the request authority matches a `trustedHosts` entry: an entry
 * written without a port matches the host on any port, one written with a port
 * matches that exact authority.
 */
function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    if (entryUrl.port === '') return entryUrl.hostname === hostUrl.hostname
    return entryUrl.host === hostUrl.host
  })
}

/**
 * Decide whether one request may reach the `/browser-html` route: the `Host`
 * must be ours (loopback or a trusted authority), the browser must not have
 * marked the request cross-site, and an attached `Origin` must name this same
 * hostname. A missing `Origin` passes — the `Host` fence above already bound
 * the authority — while the literal `"null"` (sandboxed iframe, `file:` page)
 * is an opaque origin and is refused.
 *
 * @param req - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns whether the request is trusted.
 */
export function isTrustedRequest(
  req: MinimalRequestHeaders,
  trustedHosts: readonly string[] = [],
): boolean {
  const host = header(req.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false
  // Comparing hostname, not host: some Chromium builds serialize the Origin of
  // a non-default-port loopback page without the port, and refusing those would
  // break every request from the GUI's own iframe.
  const origin = header(req.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    return false
  }
}
