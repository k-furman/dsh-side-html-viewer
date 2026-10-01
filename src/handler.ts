import { readFile, stat } from 'node:fs/promises'
import { decodeBrowserUrl } from './browser-url'
import { BROWSER_CSP } from './csp'
import { contentTypeForPath } from './mime'
import { resolveInsideRoot } from './path-security'
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
  })
  res.end(body)
}

export function createHandler(ctx: HostContext, options?: BrowserRouteOptions) {
  const mediaLimit = options?.mediaLimit ?? DEFAULT_MEDIA_LIMIT
  // Deployment-derived trusted authorities, sampled at boot (see webRuntime);
  // empty in stripped-down hosts (tests) where loopback still passes.
  const trustedHosts = ctx.webRuntime?.trustedHosts ?? []

  return async function handler(req: IncomingLike, res: ResponseLike): Promise<void> {
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

      let info
      try {
        info = await stat(absolute)
      } catch {
        writeError(res, 404, 'fs-error', 'not found')
        return
      }
      if (!info.isFile()) {
        writeError(res, 403, 'fs-error', 'not a regular file')
        return
      }
      if (info.size > mediaLimit) {
        writeError(res, 413, 'fs-error', 'file too large')
        return
      }

      const body = await readFile(absolute)
      res.writeHead(200, {
        'content-type': contentTypeForPath(absolute),
        'content-length': info.size,
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
