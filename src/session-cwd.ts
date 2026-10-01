export interface SessionHeader {
  cwd?: string
}

export interface SessionRecord {
  header: SessionHeader
}

export interface SessionStore {
  get(id: string): SessionRecord | undefined
}

/** Minimal persistence face used as a cold-session fallback (optional). */
export interface SessionPersistence {
  stat(id: string): Promise<{ header: SessionHeader } | undefined>
}

/** The `webRuntime` service exposing deployment-derived trusted authorities. */
export interface WebRuntime {
  trustedHosts: readonly string[]
}

export interface HostContext {
  sessions: SessionStore
  webServer: {
    register(route: unknown): () => void
  }
  webRuntime?: WebRuntime
  sessionPersistence?: SessionPersistence
  get(key: string): unknown
  effect(cb: () => () => void, label?: string): void
}

/**
 * Resolve a session's authoritative working directory.
 *
 * The attached session header wins; while the session is still hydrating from
 * persistence the caller's own summary cwd is used (passed explicitly); the
 * session-persistence index is queried as a last resort for cold
 * (not-yet-attached) sessions so a detached first request still resolves the
 * correct project instead of the host process cwd. `process.cwd()` is the
 * final fallback for deployments without persistence (tests / stripped-down
 * hosts).
 *
 * An empty or whitespace-only cwd is treated as absent, so a detached session
 * falls through the chain rather than resolving to `process.cwd()` early.
 */
export async function sessionCwdOf(
  ctx: HostContext,
  sessionId: string,
  clientCwd?: string,
): Promise<string> {
  const headerCwd = ctx.sessions.get(sessionId)?.header.cwd
  if (headerCwd !== undefined && headerCwd.trim() !== '') return headerCwd
  if (clientCwd !== undefined && clientCwd.trim() !== '') return clientCwd
  const persistence = (ctx.get?.('sessionPersistence') as SessionPersistence | undefined) ?? ctx.sessionPersistence
  const persisted = (await persistence?.stat(sessionId))?.header.cwd
  if (persisted !== undefined && persisted.trim() !== '') return persisted
  return process.cwd()
}
