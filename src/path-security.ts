import { isAbsolute, relative, resolve } from 'node:path'

/** Whether `target` sits at or below `root` (lexically, after `resolve`). */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Resolve `target` against the workspace `root` and require it to stay
 * inside the root.
 *
 * `target` may be either spelling the client produces for a `session`-scoped
 * file address (see `@deepseek-ai/dsh-util-workspace-path`):
 *
 * - a workspace-relative path (`samples/index.html`, no leading slash), or
 * - an OS-absolute path inside the workspace (`/Workspace/.../index.html`,
 *   leading slash). The shared address grammar keeps the slash on absolute
 *   paths and leaves relative ones slash-less; a path that lies outside the
 *   root is also carried through with its slash intact (and is refused here).
 *
 * Our route decoder re-adds a leading `/` to both forms, so the slash alone is
 * ambiguous. Disambiguate by where the OS-absolute reading lands: if the
 * slash-leading target, taken as an OS-absolute path, stays inside the root,
 * it was absolute; otherwise it was workspace-relative. UNC (`//host/...`) and
 * drive (`C:/...`) paths are OS-absolute and never inside the root.
 *
 * Returns the resolved absolute path, or `undefined` when the target escapes
 * the root (via `..`, a UNC/drive path, or an out-of-root absolute path).
 */
export function resolveInsideRoot(root: string, target: string): string | undefined {
  // Drive-letter (C:/...) and UNC (//host/...) paths are OS-absolute and never
  // resolve inside a workspace root.
  if (/^[A-Za-z]:[\\/]/.test(target) || target.startsWith('//')) return undefined

  const rootResolved = resolve(root)

  const leading = target.startsWith('/')
  const asAbsolute = leading ? resolve(target) : undefined
  const absoluteInRoot = asAbsolute !== undefined && isInside(rootResolved, asAbsolute)

  const resolved = absoluteInRoot
    ? asAbsolute
    : resolve(rootResolved, leading ? target.slice(1) : target)

  return isInside(rootResolved, resolved) ? resolved : undefined
}