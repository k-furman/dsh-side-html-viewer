import { describe, it, expect } from 'vitest'
import { canOpenAddress, titleForAddress, BROWSER_PATTERNS } from '../src/client/registry'

describe('canOpenAddress', () => {
  it('opens .html', () => {
    expect(canOpenAddress('dsh-resource://file/session/s1/a.html')).toBe(true)
  })

  it('opens .htm and is case-insensitive', () => {
    expect(canOpenAddress('dsh-resource://file/session/s1/a.htm')).toBe(true)
    expect(canOpenAddress('dsh-resource://file/session/s1/a.HTML')).toBe(true)
  })

  it('rejects other extensions', () => {
    expect(canOpenAddress('dsh-resource://file/session/s1/a.pdf')).toBe(false)
    expect(canOpenAddress('dsh-resource://file/session/s1/a.png')).toBe(false)
    expect(canOpenAddress('dsh-resource://file/session/s1/a.html.bak')).toBe(false)
  })

  it('rejects non-file addresses', () => {
    expect(canOpenAddress('not-an-address')).toBe(false)
  })

  it('rejects absolute-scope addresses (no session workspace root)', () => {
    expect(canOpenAddress('dsh-resource://file/absolute/C:/x/y.html')).toBe(false)
    expect(canOpenAddress('dsh-resource://file/absolute//host/share/x.html')).toBe(false)
  })
})

describe('titleForAddress', () => {
  it('returns the basename', () => {
    expect(titleForAddress('dsh-resource://file/session/s1/dir/a.html')).toBe('a.html')
  })

  it('falls back to HTML for non-addresses', () => {
    expect(titleForAddress('not-an-address')).toBe('HTML')
  })
})

describe('BROWSER_PATTERNS', () => {
  it('is longer than better-sidebar trailing glob', () => {
    const betterSidebar = 'dsh-resource://file/**'
    expect(BROWSER_PATTERNS[0].length).toBeGreaterThan(betterSidebar.length)
  })
})
