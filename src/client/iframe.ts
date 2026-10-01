import { parseFileAddress } from './address'
import { encodeBrowserUrl } from '../browser-url'

/**
 * Build the iframe `src` for a tab content id (a `dsh-resource://file/...`
 * address). Only session-scope addresses are rendered: they resolve against
 * their session workspace root. Returns `undefined` for a non-file address or
 * an `absolute`-scope address (see `canOpenAddress`, which the registry vetoes
 * before this runs).
 */
export function iframeSrcFor(contentId: string): string | undefined {
  const file = parseFileAddress(contentId)
  if (!file) return undefined
  if (file.scope !== 'session') return undefined
  return encodeBrowserUrl(file.sessionId, file.path)
}
