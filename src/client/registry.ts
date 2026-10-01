import { parseFileAddress } from './address'

export const BROWSER_TAB_ID = 'dsh-side-html-viewer'
export const BROWSER_TAB_KIND = 'html-browser'
export const BROWSER_PATTERNS = ['dsh-resource://file/**/*.html', 'dsh-resource://file/**/*.htm'] as const

/**
 * Whether this plugin opens a file address. Only SESSION-scoped HTML files are
 * openable: the plugin's security model serves files contained inside a
 * session's workspace root, and an `absolute`-scope address names a file with
 * no such root (its path is OS-absolute). Those fall through to the host's own
 * viewers rather than being claimed here.
 */
export function canOpenAddress(address: string): boolean {
  const file = parseFileAddress(address)
  if (!file) return false
  if (file.scope !== 'session') return false
  return /\.html?$/i.test(file.path)
}

export function titleForAddress(address: string): string {
  const file = parseFileAddress(address)
  if (!file) return 'HTML'
  const basename = file.path.split(/[\\/]/).pop()
  return basename || 'HTML'
}
