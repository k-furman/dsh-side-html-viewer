import { describe, it, expect } from 'vitest'
import { mediaTypeForPath, contentTypeForPath } from '../src/mime'

describe('contentTypeForPath', () => {
  it('maps html/htm to text/html with charset', () => {
    expect(contentTypeForPath('x.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeForPath('x.htm')).toBe('text/html; charset=utf-8')
  })

  it('maps css/js/json to text types with charset', () => {
    expect(contentTypeForPath('x.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeForPath('x.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeForPath('x.json')).toBe('application/json; charset=utf-8')
  })

  it('maps binary types without charset', () => {
    expect(contentTypeForPath('x.png')).toBe('image/png')
    expect(contentTypeForPath('x.svg')).toBe('image/svg+xml')
    expect(contentTypeForPath('x.woff2')).toBe('font/woff2')
  })
})

describe('mediaTypeForPath', () => {
  it('falls back to octet-stream for unknown extensions', () => {
    expect(mediaTypeForPath('x.unknown')).toBe('application/octet-stream')
  })

  it('is case-insensitive', () => {
    expect(mediaTypeForPath('x.HTML')).toBe('text/html')
  })
})
