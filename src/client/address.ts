export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

export type FileAddress =
  | { scope: 'session'; sessionId: string; path: string }
  | { scope: 'absolute'; path: string }

/**
 * Parse a `dsh-resource://file/...` address (mirror of better-sidebar's
 * `parseFileAddress`). Returns `undefined` for any invalid or malformed
 * input (including malformed percent-encoding).
 */
export function parseFileAddress(address: string): FileAddress | undefined {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    let rest = address.slice(FILE_ADDRESS_PREFIX.length)
    const q = rest.search(/[?#]/)
    if (q >= 0) rest = rest.slice(0, q)
    const parts = rest.split('/')
    const scope = parts[0]
    if (scope === 'session') {
      const id = parts[1] ? decodeURIComponent(parts[1]) : ''
      if (id === '' || parts.length <= 2) return undefined
      const path = parts.slice(2).map(decodeURIComponent).join('/')
      if (path === '') return undefined
      return { scope: 'session', sessionId: id, path }
    }
    if (scope === 'absolute') {
      const tail = parts.slice(1)
      if (tail.length === 0) return undefined
      const unc = tail[0] === '' && tail.length > 1
      const realTail = unc ? tail.slice(1) : tail
      const decoded = realTail.map(decodeURIComponent)
      let path: string
      if (unc) {
        path = '//' + decoded.join('/')
      } else if (/^[A-Za-z]:$/.test(decoded[0])) {
        path = decoded.join('/')
      } else {
        path = '/' + decoded.join('/')
      }
      return { scope: 'absolute', path }
    }
    return undefined
  } catch {
    return undefined
  }
}
