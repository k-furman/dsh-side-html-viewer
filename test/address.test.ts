import { describe, it, expect } from 'vitest'
import { parseFileAddress } from '../src/client/address'

describe('parseFileAddress', () => {
  it('parses a session address', () => {
    expect(parseFileAddress('dsh-resource://file/session/s1/sub%2Fdir%2Ffile.html')).toEqual({
      scope: 'session',
      sessionId: 's1',
      path: 'sub/dir/file.html',
    })
  })

  it('parses an absolute UNC address', () => {
    expect(parseFileAddress('dsh-resource://file/absolute//host/share/x.html')).toEqual({
      scope: 'absolute',
      path: '//host/share/x.html',
    })
  })

  it('parses an absolute drive address', () => {
    expect(parseFileAddress('dsh-resource://file/absolute/C:/x/y.html')).toEqual({
      scope: 'absolute',
      path: 'C:/x/y.html',
    })
  })

  it('returns undefined for an empty session id', () => {
    expect(parseFileAddress('dsh-resource://file/session//file.html')).toBeUndefined()
  })

  it('returns undefined for a non-file address', () => {
    expect(parseFileAddress('not-an-address')).toBeUndefined()
  })

  it('returns undefined for malformed percent-encoding', () => {
    expect(parseFileAddress('dsh-resource://file/%E0%A4%A')).toBeUndefined()
  })
})
