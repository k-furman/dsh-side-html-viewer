import { iframeSrcFor } from './iframe'
import {
  BROWSER_TAB_ID,
  BROWSER_TAB_KIND,
  BROWSER_PATTERNS,
  canOpenAddress,
  titleForAddress,
} from './registry'

export const inject = ['slots']

interface TabInfo {
  tab: {
    contentId: string
  }
}

interface BodyProps {
  useTabInfo: () => TabInfo
}

function BrowserTabBody(props: BodyProps) {
  const info = props.useTabInfo()
  const src = iframeSrcFor(info.tab.contentId)
  return (
    <iframe
      src={src}
      title="side-html-viewer"
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
    />
  )
}

function BrowserTabTitle(props: BodyProps) {
  const info = props.useTabInfo()
  return <span>{titleForAddress(info.tab.contentId)}</span>
}

interface SidebarRightTabs {
  register(def: unknown): () => void
}

interface Slots {
  inject(key: string, callback: () => () => void): () => void
  register(options: unknown, component: unknown): () => void
}

interface ClientContext {
  slots: Slots
  inject(deps: string[], callback: (injected: Map<string, unknown>) => void): void
  effect(cb: () => () => void, label?: string): void
}

export function apply(ctx: ClientContext): void {
  // The registrations are collected as they are handed out, so a partial set can
  // still be released if a later registration throws (a duplicate id, or a slot
  // registration on a now-inactive context during reload/disposal).
  const disposers: Array<() => void> = []

  const register = (tabs: SidebarRightTabs): void => {
    if (disposers.length > 0) return
    disposers.push(
      tabs.register({
        id: BROWSER_TAB_ID,
        kind: BROWSER_TAB_KIND,
        multiple: true,
        patterns: BROWSER_PATTERNS,
        priority: 'extension',
        canOpen: canOpenAddress,
        title: titleForAddress,
      }),
    )
    disposers.push(
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: BROWSER_TAB_ID,
            inject: (sessionId: string) => ({ sessionId }),
          },
          BrowserTabBody,
        ),
      ),
    )
    disposers.push(
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab.title',
            key: BROWSER_TAB_ID,
            inject: () => ({}),
          },
          BrowserTabTitle,
        ),
      ),
    )
  }

  // Wait for the tab-type REGISTRY (`sidebarRightTabs`), not the slot seat:
  // the seat may declare `sidebar.right.pane.tab` before it provides the
  // registry, and `ctx.inject` re-runs this callback whenever the service
  // appears or reappears — the lifecycle the registrations need.
  ctx.inject(['sidebarRightTabs'], (injected) => {
    const tabs = injected.get('sidebarRightTabs') as SidebarRightTabs | undefined
    if (tabs === undefined) return
    register(tabs)
  })

  ctx.effect(
    () => () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          // A release failure must not mask the teardown being handled.
        }
      }
    },
    'dsh-side-html-viewer: tab registration',
  )
}
