# Design: `dsh-side-html-viewer` — a real-browser HTML renderer for the Files sidebar

Date: 2026-10-01
Status: Approved for planning (implemented; see "As-built deviations" below)

## Goal

A deepseek-harness plugin that renders HTML files from the right-hand "Files"
panel the way a normal browser does: CSS, JS, ES modules, `fetch`, relative
paths, and internal links all work, and internal navigation stays inside the
panel. This replaces the two current renderers that do not meet this bar
(the stock `ui-sidebar-documentpreview` sanitizes/removes links and sandboxes
scripts; `dsh-better-sidebar` intercepts `.html` into an opaque-origin iframe
where `fetch`/modules/storage break).

## Decisions (confirmed by the user)

1. **Isolation = "Origin GUI, iframe without sandbox".** No second HTTP server.
   The page is served on the GUI's own origin inside an iframe with no
   `sandbox` attribute, so it gains full access to the GUI origin (DOM, internal
   APIs, storage). The session-theft risk is accepted deliberately.
2. **Takeover = yes, with priority.** The plugin wins `.html`/`.htm` claims over
   `dsh-better-sidebar` by registering a longer matching glob at the same
   `extension` band.
3. **Network = local + external links, but not external subresources.** External
   links navigate (the iframe itself may load an external site); external
   subresources (script/style/img/font/fetch) are blocked by CSP.

## Architecture

Two halves, mirroring `dsh-better-sidebar`:

- **Host** (`src/index.ts`): an HTTP route that serves the HTML file and every
  sibling resource it references by relative path, with correct MIME types and
  no `sandbox` CSP.
- **Client** (`src/client.ts`): a sidebar-right tab type that claims
  `dsh-resource://file/**/*.html` (and `.htm`), and a tab body that renders an
  unsandboxed iframe pointed at the host route.

### Host: file-serving route

- `ctx.webServer.register({ kind: 'prefix', path: '/browser-html', handler })`.
- URL scheme: `/browser-html/<sessionId>/<encoded-relative-path>`. The relative
  path is resolved against the session's workspace root (via the same
  `sessionCwdOf` mechanism `dsh-better-sidebar` uses).
- Serve both the entry HTML and all sibling resources (`./style.css`,
  `img/x.png`, `./app.js`) so relative resolution behaves like a browser.
- MIME by extension (html/htm → `text/html; charset=utf-8`, css/js/png/svg/…),
  with `X-Content-Type-Options: nosniff`.
- **Path-traversal guard:** normalize the path and require it to stay inside the
  workspace root; `..` escapes and out-of-root absolute paths → 403. Error map:
  404 (missing), 403 (out-of-root / not a regular file), 413 (too large).
- **No `sandbox` attribute and no `Content-Security-Policy: sandbox`** (decision
  1).

### Network policy (CSP)

One `Content-Security-Policy` header implementing decision 3:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';
font-src 'self' data:; media-src 'self' data: blob:; object-src 'none';
base-uri 'self'
```

- `'self'` = the `/browser-html` route origin → local resources and local
  `fetch`/XHR work.
- External subresources (https://…) are blocked.
- Navigation is NOT restricted: clicking an external `<a>` navigates the iframe
  to the external site, which then loads its own resources under its own policy.
- Consequence (accepted): local scripts cannot `fetch` external APIs
  (`connect-src 'self'`). That is exactly "external links yes, external
  resources no."

### Client: tab type + takeover

- `ctx.sidebarRightTabs.register({ id: 'dsh-browser-panel', kind:
  'html-browser', patterns: ['dsh-resource://file/**/*.html',
  'dsh-resource://file/**/*.htm'], priority: 'extension', multiple: true,
  canOpen: address => /\.html?$/i.test(parseFileAddress(address)?.path),
  title: address => basename })`.
- Pattern length `dsh-resource://file/**/*.html` (30 chars) beats
  `dsh-better-sidebar`'s `dsh-resource://file/**` (26 chars) at the same
  `extension` band, so the claim resolves to this plugin.
- Tab body registered in keyed slot `sidebar.right.pane.tab` under `id`;
  title in `sidebar.right.pane.tab.title`.
- Body renders `<iframe src={'/browser-html/' + sessionId + '/' +
  encodeURIComponent(path)}>` (no `sandbox`), filling the tab.
- `multiple: true` (independent tabs per file); `keepMounted` off.

### Address parsing

Parser for `dsh-resource://file/session/<id>/<path>` (and `…/absolute/…`) →
`{ sessionId, path }`, mirroring `dsh-better-sidebar`'s `parseFileAddress`.

## Package layout

- `package.json`: `type: module`, `main: lib/index.js`, `dsh.client.inject`
  (client injections), `dsh.bundle.patch: ./cordis.patch.yml` (insert-mount).
- `src/index.ts` (host), `src/client.ts` (client). Build with tsc + tsdown into
  `lib/`.
- `cordis.patch.yml`: loader entry (`id`/`name`/`config`), the `!!js` marker as
  used elsewhere in the profile.

## Testing

A sample HTML exercising: relative `./style.css`; `./app.js` as an ES module;
`fetch('./data.json')`; an `img/` image; an internal link to a sibling `.html`;
an external link `https://example.com`; an external `<img src="https://...">`
(expected to be blocked by CSP). Verify: CSS applies, JS/modules run, local
`fetch` works, internal links navigate in-panel, external subresource is
blocked.

## Explicit non-goals

- No second HTTP listener (decision 1).
- No security isolation of the page from the GUI origin.
- No external-subresource allowance (decision 3).

## As-built deviations (implementation vs. this spec)

The shipped plugin (`dsh-side-html-viewer`) diverges from this design in a few
deliberate, security-driven ways:

1. **Package/id naming.** The package, plugin `id`, and cordis patch id are
   `dsh-side-html-viewer` (not `dsh-browser-panel`); the tab `kind` remains
   `html-browser`.
2. **`absolute`-scope addresses are not claimed.** `canOpenAddress`/`iframeSrcFor`
   only accept `scope === 'session'` addresses; an `absolute`-scope address has
   no workspace root to confine against, so it falls through to the host's own
   viewers.
3. **Full provenance fence.** The trust gate is a full `Host` + `Origin` +
   Fetch Metadata check against loopback / `trustedHosts`, not a bare
   `sec-fetch-site` comparison.
4. **Symlink-aware containment.** The path guard resolves the target through
   `realpath` and re-checks it stays inside the (also `realpath`-ed) root, so a
   symlink escaping the workspace cannot be served.
5. **Cold-session resolution.** `sessionCwdOf` falls back through the
   session-persistence index before `process.cwd()`, so a detached first
   request still resolves the right project.

