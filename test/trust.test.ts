import { describe, it, expect } from 'vitest'
import { isTrustedRequest, isLoopbackHostname } from '../src/trust'

describe('isLoopbackHostname', () => {
  it('accepts localhost and loopback literals', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.1.2.3')).toBe(true)
  })

  it('rejects non-loopback and malformed hosts', () => {
    expect(isLoopbackHostname('example.com')).toBe(false)
    expect(isLoopbackHostname('127.0.0')).toBe(false)
    expect(isLoopbackHostname('128.0.0.1')).toBe(false)
  })
})

describe('isTrustedRequest', () => {
  it('accepts a same-origin loopback request', () => {
    expect(
      isTrustedRequest({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' } }),
    ).toBe(true)
  })

  it('accepts a request with no browser markers over loopback', () => {
    expect(isTrustedRequest({ headers: { host: '127.0.0.1:3080' } })).toBe(true)
    expect(isTrustedRequest({ headers: { host: 'localhost:3080' } })).toBe(true)
  })

  it('accepts a matching origin over loopback', () => {
    expect(
      isTrustedRequest({ headers: { host: 'localhost:3080', origin: 'http://localhost:3080' } }),
    ).toBe(true)
  })

  it('rejects cross-site requests', () => {
    expect(
      isTrustedRequest({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }),
    ).toBe(false)
  })

  it('rejects a mismatched origin', () => {
    expect(
      isTrustedRequest({ headers: { host: 'localhost:3080', origin: 'http://evil.example' } }),
    ).toBe(false)
  })

  it('rejects the opaque "null" origin', () => {
    expect(isTrustedRequest({ headers: { host: 'localhost:3080', origin: 'null' } })).toBe(false)
  })

  it('rejects a request with no Host header', () => {
    expect(isTrustedRequest({ headers: {} })).toBe(false)
  })

  it('rejects a non-loopback Host unless listed as a trusted authority', () => {
    expect(isTrustedRequest({ headers: { host: '192.168.1.5:3080' } })).toBe(false)
    expect(isTrustedRequest({ headers: { host: '192.168.1.5:3080' } }, ['192.168.1.5:3080'])).toBe(true)
    // port-less trusted entry matches any port
    expect(isTrustedRequest({ headers: { host: '192.168.1.5:9999' } }, ['192.168.1.5'])).toBe(true)
  })
})
