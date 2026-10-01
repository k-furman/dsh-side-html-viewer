import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHandler } from '../src/handler'
import type { HostContext } from '../src/session-cwd'
import { BROWSER_CSP } from '../src/csp'

interface CapturedResponse {
  status?: number
  headers?: Record<string, string | string[] | number>
  body?: Buffer | string
  ended: boolean
}

function fakeRes() {
  const res: any = {
    writeHead(status: number, headers?: any) {
      res.captured.status = status
      res.captured.headers = headers ?? {}
    },
    end(body?: any) {
      res.captured.body = body
      res.captured.ended = true
    },
    captured: {} as CapturedResponse,
  }
  return res
}

function fakeReq(method: string, url: string, headers: Record<string, string> = {}) {
  return { method, url, headers: { host: '127.0.0.1:3080', ...headers } }
}

describe('createHandler', () => {
  let root: string
  let registered: { kind: string; path: string; handler: any }
  let ctx: HostContext & { webServer: any }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'side-html-viewer-'))
    writeFileSync(join(root, 'index.html'), '<html>hello</html>')
    writeFileSync(join(root, 'style.css'), 'body { color: red }')
    mkdirSync(join(root, 'subdir'))
    registered = { kind: '', path: '', handler: null }
    ctx = {
      sessions: { get: () => ({ header: { cwd: root } }) },
      webServer: {
        register(route: any) {
          registered = route
          return () => {}
        },
      },
    } as any
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function getHandler() {
    return createHandler(ctx)
  }

  async function run(method: string, url: string, headers: Record<string, string> = {}) {
    const handler = getHandler()
    const res = fakeRes()
    await handler(fakeReq(method, url, headers), res)
    return res.captured
  }

  it('serves a valid HTML file with CSP and no sandbox', async () => {
    const r = await run('GET', '/browser-html/s1/index.html')
    expect(r.status).toBe(200)
    expect(r.headers).toMatchObject({
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
    })
    expect((r.headers as any)['content-security-policy']).toBe(BROWSER_CSP)
    expect((r.headers as any)['content-security-policy']).not.toContain('sandbox')
    expect(r.body).toEqual(Buffer.from('<html>hello</html>'))
  })

  it('serves CSS with the right content type', async () => {
    const r = await run('GET', '/browser-html/s1/style.css')
    expect(r.status).toBe(200)
    expect(r.headers).toMatchObject({ 'content-type': 'text/css; charset=utf-8' })
  })

  it('returns 404 for a missing file', async () => {
    const r = await run('GET', '/browser-html/s1/nope.html')
    expect(r.status).toBe(404)
    expect(JSON.parse(r.body!.toString()).ok).toBe(false)
  })

  it('returns 403 for a .. escape (encoded slashes)', async () => {
    const r = await run('GET', '/browser-html/s1/..%2F..%2Fetc%2Fpasswd')
    expect(r.status).toBe(403)
  })

  it('returns 403 for an absolute out-of-root path', async () => {
    const r = await run('GET', '/browser-html/s1//etc/passwd')
    expect(r.status).toBe(403)
  })

  it('returns 403 for a directory', async () => {
    const r = await run('GET', '/browser-html/s1/subdir')
    expect(r.status).toBe(403)
  })

  it('returns 413 for an oversized file', async () => {
    const big = Buffer.alloc(1024)
    writeFileSync(join(root, 'big.html'), big)
    const small = createHandler(ctx, { mediaLimit: 512 })
    const res = fakeRes()
    await small(fakeReq('GET', '/browser-html/s1/big.html'), res)
    expect(res.captured.status).toBe(413)
  })

  it('returns 405 for non-GET methods', async () => {
    const r = await run('POST', '/browser-html/s1/index.html')
    expect(r.status).toBe(405)
    expect(JSON.parse(r.body!.toString())).toEqual({
      ok: false,
      error: { code: 'method-not-allowed', message: 'method not allowed' },
    })
  })

  it('returns 403 for cross-site requests', async () => {
    const r = await run('GET', '/browser-html/s1/index.html', { 'sec-fetch-site': 'cross-site' })
    expect(r.status).toBe(403)
  })

  it('returns 403 for a request from a foreign origin', async () => {
    const r = await run('GET', '/browser-html/s1/index.html', { origin: 'http://evil.example' })
    expect(r.status).toBe(403)
  })

  it('returns 403 for a request with no Host header', async () => {
    const handler = getHandler()
    const res = fakeRes()
    await handler({ method: 'GET', url: '/browser-html/s1/index.html', headers: {} }, res)
    expect(res.captured.status).toBe(403)
  })

  it('returns 403 for a symlink escaping the workspace root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'side-html-viewer-outside-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'top secret')
      symlinkSync(outside, join(root, 'link-out'))
      const r = await run('GET', '/browser-html/s1/link-out/secret.txt')
      expect(r.status).toBe(403)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('serves a file through a symlink that stays inside the root', async () => {
    writeFileSync(join(root, 'real.html'), '<html>real</html>')
    symlinkSync(join(root, 'real.html'), join(root, 'alias.html'))
    const r = await run('GET', '/browser-html/s1/alias.html')
    expect(r.status).toBe(200)
    expect(r.body).toEqual(Buffer.from('<html>real</html>'))
  })
})
