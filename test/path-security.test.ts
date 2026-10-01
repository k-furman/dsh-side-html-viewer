import { describe, it, expect } from 'vitest'
import { resolveInsideRoot } from '../src/path-security'

describe('resolveInsideRoot', () => {
  it('resolves a bare relative path inside the root', () => {
    expect(resolveInsideRoot('/w', 'sub/file.html')).toBe('/w/sub/file.html')
  })

  it('resolves a root-relative path (leading slash = from root)', () => {
    expect(resolveInsideRoot('/w', '/sub/file.html')).toBe('/w/sub/file.html')
  })

  it('rejects a .. escape', () => {
    expect(resolveInsideRoot('/w', '../etc/passwd')).toBeUndefined()
    expect(resolveInsideRoot('/w', '/../etc/passwd')).toBeUndefined()
  })

  it('rejects a UNC absolute path (out of root)', () => {
    expect(resolveInsideRoot('/w', '//host/share/x')).toBeUndefined()
  })

  it('rejects a drive absolute path (out of root)', () => {
    expect(resolveInsideRoot('/w', 'C:/x/y')).toBeUndefined()
  })

  it('allows the root itself', () => {
    expect(resolveInsideRoot('/w', '/')).toBe('/w')
  })

  it('resolves an OS-absolute path inside the root (no double prefix)', () => {
    expect(resolveInsideRoot('/w', '/w/samples/index.html')).toBe('/w/samples/index.html')
  })

  it('treats a slash-leading path outside the root as root-relative', () => {
    // `/etc/passwd` is not inside `/w` as an absolute path, so it is read as the
    // root-relative path `etc/passwd`. Containment still holds: the result never
    // escapes the root.
    expect(resolveInsideRoot('/w', '/etc/passwd')).toBe('/w/etc/passwd')
  })
})
