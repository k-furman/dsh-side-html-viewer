import { useEffect, useRef } from 'react'
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
    actions: {
      bindCommands(commands: { refresh?: () => void }): () => void
    }
  }
}

interface BodyProps {
  useTabInfo: () => TabInfo
}

interface ToolbarProps {
  onBack: () => void
  onForward: () => void
  onReload: () => void
}

const BUTTON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  margin: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  borderRadius: 6,
  opacity: 0.8,
}

const TOOLBAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '4px 8px',
  borderBottom: '1px solid rgba(128, 128, 128, 0.25)',
  flexShrink: 0,
}

function BrowserToolbar({ onBack, onForward, onReload }: ToolbarProps) {
  return (
    <div style={TOOLBAR_STYLE} role="toolbar" aria-label="Browser navigation">
      <button type="button" title="Back" aria-label="Back" style={BUTTON_STYLE} onClick={onBack}>
        ←
      </button>
      <button type="button" title="Forward" aria-label="Forward" style={BUTTON_STYLE} onClick={onForward}>
        →
      </button>
      <button type="button" title="Reload" aria-label="Reload" style={BUTTON_STYLE} onClick={onReload}>
        ⟳
      </button>
    </div>
  )
}

function BrowserTabBody(props: BodyProps) {
  const info = props.useTabInfo()
  const src = iframeSrcFor(info.tab.contentId)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // A browser "reload" reloads the frame's *current* location. `location.reload()`
  // is a navigation, so it stays permitted even after the frame navigated to an
  // external site (unlike `history`, which goes cross-origin-opaque).
  const reload = () => {
    try {
      iframeRef.current?.contentWindow?.location.reload()
    } catch {
      // Cross-origin or detached frame: nothing to reload.
    }
  }

  // Back/forward act on the frame's own session history. They only work while the
  // frame is same-origin (the primary case); after an external navigation the
  // `history` access throws and the buttons become no-ops.
  const navigate = (fn: (history: History) => void) => {
    try {
      const win = iframeRef.current?.contentWindow
      if (win) fn(win.history)
    } catch {
      // Ignore: cross-origin history is not scriptable.
    }
  }

  useEffect(() => info.tab.actions.bindCommands({ refresh: reload }), [info.tab.actions])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <BrowserToolbar
        onBack={() => navigate((h) => h.back())}
        onForward={() => navigate((h) => h.forward())}
        onReload={reload}
      />
      <iframe
        ref={iframeRef}
        src={src}
        title="side-html-viewer"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', flexGrow: 1 }}
      />
    </div>
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
