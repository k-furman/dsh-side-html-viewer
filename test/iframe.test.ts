import { describe, it, expect } from 'vitest'
import { iframeSrcFor } from '../src/client/iframe'

describe('iframeSrcFor', () => {
  it('builds the route URL for a session address', () => {
    expect(iframeSrcFor('dsh-resource://file/session/s1/sub/dir/file.html')).toBe(
      '/browser-html/s1/sub/dir/file.html',
    )
  })

  it('returns undefined for an absolute address (no session root)', () => {
    expect(iframeSrcFor('dsh-resource://file/absolute/C:/x/y.html')).toBeUndefined()
    expect(iframeSrcFor('dsh-resource://file/absolute//host/share/x.html')).toBeUndefined()
  })

  it('returns undefined for a non-address', () => {
    expect(iframeSrcFor('not-an-address')).toBeUndefined()
  })
})
