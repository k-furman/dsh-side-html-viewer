import { createHandler, DEFAULT_MEDIA_LIMIT } from './handler'
import type { HostContext } from './session-cwd'

export const name = 'dsh-side-html-viewer'
export const inject = ['webServer', 'sessions', 'webRuntime']
export { DEFAULT_MEDIA_LIMIT }

export interface BrowserPanelConfig {
  mediaLimit?: number
}

export function apply(ctx: HostContext, config?: BrowserPanelConfig): void {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/browser-html',
        handler: createHandler(ctx, config),
      }),
    'dsh-side-html-viewer: /browser-html route',
  )
}
