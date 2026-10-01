import { readFile, realpath, stat } from 'node:fs/promises'
import { decodeBrowserUrl } from './browser-url'
import { BROWSER_CSP } from './csp'
import { contentTypeForPath } from './mime'
import { isInsideRoot, resolveInsideRoot } from './path-security'
import { isTrustedRequest } from './trust'
import { sessionCwdOf, type HostContext } from './session-cwd'

export const DEFAULT_MEDIA_LIMIT = 20 * 1024 * 1024

export interface BrowserRouteOptions {
  mediaLimit?: number
}

interface IncomingLike {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}

interface ResponseLike {
  writeHead(status: number, headers?: Record<string, string | number>): void
  end(body?: Buffer | string): void
}

function writeError(res: ResponseLike, status: number, code: string, message: string): void {
  const body = JSON.stringify({ ok: false, error: { code, message } })
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

export function createHandler(ctx: HostContext, options?: BrowserRouteOptions) {
  const mediaLimit = options?.mediaLimit ?? DEFAULT_MEDIA_LIMIT

  return async function handler(req: IncomingLike, res: ResponseLike): Promise<void> {
    // Trusted authorities are read per-request, not sampled at boot, so a
    // runtime change to `webRuntime.trustedHosts` takes effect immediately.
    const trustedHosts = ctx.webRuntime?.trustedHosts ?? []
    if (!isTrustedRequest(req, trustedHosts)) {
      writeError(res, 403, 'forbidden', 'forbidden')
      return
    }
    if (req.method !== 'GET') {
      writeError(res, 405, 'method-not-allowed', 'method not allowed')
      return
    }

    try {
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const decoded = decodeBrowserUrl(pathname)
      if (!decoded.ok) {
        writeError(res, decoded.status, 'bad-request', decoded.message)
        return
      }
      const { sessionId, path } = decoded.ref
      const root = await sessionCwdOf(ctx, sessionId)
      const absolute = resolveInsideRoot(root, path)
      if (absolute === undefined) {
        writeError(res, 403, 'fs-error', 'path escapes workspace root')
        return
      }

      // Symlink-aware containment: `resolveInsideRoot` is lexical only, so a
      // symlink inside the workspace could point at a file outside it (e.g.
      // `/etc/passwd`). Resolve both the root and the target through
      // `realpath` and re-check containment, so a link escaping the root is
      // refused even when the lexical path looks clean.
      let realRoot: string
      let real: string
      try {
        realRoot = await realpath(root)
        real = await realpath(absolute)
      } catch {
        writeError(res, 404, 'fs-error', 'not found')
        return
      }
      if (!isInsideRoot(realRoot, real)) {
        writeError(res, 403, 'fs-error', 'path escapes workspace root')
        return
      }

      const info = await stat(real)
      if (!info.isFile()) {
        writeError(res, 403, 'fs-error', 'not a regular file')
        return
      }
      if (info.size > mediaLimit) {
        writeError(res, 413, 'fs-error', 'file too large')
        return
      }

      const body = await readFile(real)
      res.writeHead(200, {
        'content-type': contentTypeForPath(real),
        'content-length': body.length,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': BROWSER_CSP,
      })
      res.end(body)
    } catch {
      // Do not leak internal paths/error details to the client.
      writeError(res, 500, 'internal', 'internal error')
    }
  }
}
