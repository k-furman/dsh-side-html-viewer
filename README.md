# dsh-side-html-viewer

A [DSH](https://github.com/deepseek-ai/dsh) plugin that renders HTML files from
the Files sidebar in a **real browser iframe** — with working CSS, JavaScript,
ES modules, and same-origin `fetch`, instead of a static preview.

## Features

- Serves `.html` / `.htm` files from a session's workspace root over the
  `/browser-html/<sessionId>/<path>` route.
- Full iframe rendering: inline `<script type="module">`, `<link>` stylesheets,
  images, and local `fetch` of sibling files all work.
- Strict security model:
  - Requests are gated to trusted origins (loopback / configured `trustedHosts`).
  - Paths are confined to the session workspace root (`..`, UNC, and drive
    escapes are rejected).
  - Served with a restrictive CSP, `X-Content-Type-Options: nosniff`, and
    no-cache headers.
  - Configurable media size limit (default 20 MiB).
- Registers a `html-browser` tab type in the sidebar-right pane.

## Install

```bash
dsh plugin --profile <name> add dsh-side-html-viewer
```

Then restart the profile's server. Open any `.html` file from the Files sidebar
to see it rendered.

## Development

```bash
npm install
npm run build   # emits lib/index.js (host) + lib/client.js (client)
npm test        # vitest, 65 tests
```

The client bundle is built with `tsdown` as a CommonJS module wrapped in the
`window.__ModuleLoader__.load({...})` envelope expected by the DSH web client.
The banner/footer shim (`var module = { exports: {} }` / `return module.exports`)
is required — the loader invokes the factory with only `require` in scope.

## Layout

- `src/index.ts` — host entry (`apply`/`inject`/`name`), registers the
  `/browser-html` route.
- `src/handler.ts` — request handling (trust gate, path resolve, stat, serve).
- `src/client/*` — client entry (`tab.tsx`) registering the sidebar-right tab
  and iframe body.
- `cordis.patch.yml` — bundle layer inserting the plugin.

## License

MIT
