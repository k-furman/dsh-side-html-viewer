export const BROWSER_ROUTE_PREFIX = '/browser-html/'

export interface BrowserRouteRef {
  sessionId: string
  path: string
}

export type BrowserDecodeResult =
  | { ok: true; ref: BrowserRouteRef }
  | { ok: false; status: 400 | 404; message: string }

/**
 * Encode a session id + file path into a `/browser-html/...` path.
 *
 * The path is encoded SEGMENT-WISE (each `encodeURIComponent` applied per
 * `/`-separated segment) rather than whole-string, so the browser's WHATWG
 * URL algorithm resolves relative subresources (`./style.css`) against the
 * document URL to the correct sibling. A leading `/` is dropped (absolute-
 * in-root paths resolve against the root anyway), a UNC `//host/...` keeps
 * its empty first segment as a marker, and a drive `C:` keeps its colon
 * literal (so the client-side parser can round-trip it).
 *
 * An empty `sessionId` is permitted: it encodes an `absolute`-scope address,
 * which the host resolves against its own process cwd (see `sessionCwdOf`).
 */
function encodeSegment(s: string): string {
  return encodeURIComponent(s).replace(/%3A/gi, ':')
}

export function encodeBrowserUrl(sessionId: string, path: string): string {
  const segments = path.split(/[\\/]+/).filter((s) => s !== '')
  const isUnc = path.startsWith('//')
  const joined = segments.map(encodeSegment).join('/')
  const body = isUnc ? '/' + joined : joined
  return `${BROWSER_ROUTE_PREFIX}${encodeURIComponent(sessionId)}/${body}`
}

/**
 * Decode a `/browser-html/<sessionId>/<path>` pathname back into a route
 * ref. Returns `{ ok: false, status, message }` for a wrong prefix (404),
 * missing path, or malformed percent-encoding (400).
 *
 * An empty first segment (`/browser-html/<sid>//host/...`) is the UNC marker
 * for an absolute UNC path, mirroring better-sidebar's encoding. An empty
 * `sessionId` segment (`/browser-html//C:/...`) is a legal `absolute`-scope
 * address whose file path the host resolves against its own cwd.
 */
export function decodeBrowserUrl(pathname: string): BrowserDecodeResult {
  if (!pathname.startsWith(BROWSER_ROUTE_PREFIX)) {
    return { ok: false, status: 404, message: 'not found' }
  }
  const rest = pathname.slice(BROWSER_ROUTE_PREFIX.length)
  if (rest === '') {
    return { ok: false, status: 400, message: 'missing path' }
  }
  const parts = rest.split('/')
  let sessionId: string
  try {
    sessionId = decodeURIComponent(parts[0])
  } catch {
    return { ok: false, status: 400, message: 'malformed session id' }
  }
  const tail = parts.slice(1)
  if (tail.length === 0) {
    return { ok: false, status: 400, message: 'malformed path' }
  }
  // UNC: the first path segment is empty (`//host/...`).
  const isUnc = tail[0] === '' && tail.length > 1
  const realTail = isUnc ? tail.slice(1) : tail
  if (realTail.length === 0) {
    return { ok: false, status: 400, message: 'missing path' }
  }
  let path: string
  try {
    const decoded = realTail.map(decodeURIComponent)
    if (isUnc) {
      path = '//' + decoded.join('/')
    } else if (/^[A-Za-z]:$/.test(decoded[0])) {
      path = decoded.join('/')
    } else {
      path = '/' + decoded.join('/')
    }
  } catch {
    return { ok: false, status: 400, message: 'malformed percent-encoding' }
  }
  return { ok: true, ref: { sessionId, path } }
}
