import { describe, it, expect } from 'vitest'
import { encodeBrowserUrl, decodeBrowserUrl, BROWSER_ROUTE_PREFIX } from '../src/browser-url'

describe('encodeBrowserUrl', () => {
  it('encodes a relative path segment-wise', () => {
    expect(encodeBrowserUrl('s1', 'sub/dir/file.html')).toBe('/browser-html/s1/sub/dir/file.html')
  })

  it('drops the leading slash of an absolute-in-root path', () => {
    expect(encodeBrowserUrl('s1', '/abs/file.html')).toBe('/browser-html/s1/abs/file.html')
  })

  it('preserves the UNC marker (double slash)', () => {
    expect(encodeBrowserUrl('s1', '//host/share/x.html')).toBe('/browser-html/s1//host/share/x.html')
  })

  it('keeps the drive colon literal', () => {
    expect(encodeBrowserUrl('s1', 'C:/x/y.html')).toBe('/browser-html/s1/C:/x/y.html')
  })

  it('percent-encodes spaces and unicode per segment', () => {
    expect(encodeBrowserUrl('s1', 'a b/файл.html')).toBe('/browser-html/s1/a%20b/%D1%84%D0%B0%D0%B9%D0%BB.html')
  })
})

describe('decodeBrowserUrl', () => {
  it('decodes a session-relative path', () => {
    expect(decodeBrowserUrl('/browser-html/s1/sub/dir/file.html')).toEqual({
      ok: true,
      ref: { sessionId: 's1', path: '/sub/dir/file.html' },
    })
  })

  it('decodes a UNC path', () => {
    expect(decodeBrowserUrl('/browser-html/s1//host/share/x.html')).toEqual({
      ok: true,
      ref: { sessionId: 's1', path: '//host/share/x.html' },
    })
  })

  it('decodes a drive path without leading slash', () => {
    expect(decodeBrowserUrl('/browser-html/s1/C:/x/y.html')).toEqual({
      ok: true,
      ref: { sessionId: 's1', path: 'C:/x/y.html' },
    })
  })

  it('returns 404 for a wrong prefix', () => {
    expect(decodeBrowserUrl('/not-browser-html/x')).toMatchObject({ ok: false, status: 404 })
  })

  it('returns 400 for a missing path', () => {
    expect(decodeBrowserUrl('/browser-html/')).toMatchObject({ ok: false, status: 400 })
  })

  it('returns 400 for malformed percent-encoding', () => {
    expect(decodeBrowserUrl('/browser-html/%E0%A4%A')).toMatchObject({ ok: false, status: 400 })
  })

  it('exposes the prefix constant', () => {
    expect(BROWSER_ROUTE_PREFIX).toBe('/browser-html/')
  })

  it('decodes an empty-session (absolute-scope) drive address', () => {
    expect(decodeBrowserUrl('/browser-html//C:/x/y.html')).toEqual({
      ok: true,
      ref: { sessionId: '', path: 'C:/x/y.html' },
    })
  })
})

describe('round-trip', () => {
  it('encodes then decodes to the root-relative/UNC/drive path forms', () => {
    // decode normalizes a bare relative path to a root-relative `/...` path;
    // UNC and drive forms are preserved verbatim. `resolveInsideRoot` accepts
    // all three.
    const cases: Array<[string, string, string, string]> = [
      ['s1', 'sub/dir/file.html', 's1', '/sub/dir/file.html'],
      ['s1', '/abs/file.html', 's1', '/abs/file.html'],
      ['s1', '//host/share/x.html', 's1', '//host/share/x.html'],
      ['s1', 'C:/x/y.html', 's1', 'C:/x/y.html'],
      ['s1', 'a b/файл.html', 's1', '/a b/файл.html'],
    ]
    for (const [sessionId, path, expectedSession, expectedPath] of cases) {
      const url = encodeBrowserUrl(sessionId, path)
      const decoded = decodeBrowserUrl(url)
      expect(decoded.ok).toBe(true)
      if (decoded.ok) {
        expect(decoded.ref.sessionId).toBe(expectedSession)
        expect(decoded.ref.path).toBe(expectedPath)
      }
    }
  })
})
