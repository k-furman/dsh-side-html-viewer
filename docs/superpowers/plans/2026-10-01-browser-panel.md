# dsh-browser-panel Implementation Plan

> **Note:** this plan names the plugin `dsh-browser-panel`; it was implemented
> and shipped as **`dsh-side-html-viewer`** (package name, plugin `id`, and
> cordis patch id all use the latter; the tab `kind` stays `html-browser`). See
> "As-built deviations" in `docs/superpowers/specs/2026-10-01-browser-panel-design.md`
> for the full list of intentional differences from this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deepseek-harness plugin that renders `.html`/`.htm` files from the Files sidebar in a real-browser iframe (CSS, JS, ES modules, `fetch`, relative paths, in-panel navigation all work).

**Architecture:** Two halves mirroring `dsh-better-sidebar`: a host HTTP route `/browser-html/<sessionId>/<segment-encoded-path>` that serves the entry HTML and every sibling resource from the session workspace root with correct MIME, a non-sandbox CSP, and a path-traversal guard; and a client sidebar-right tab type that claims `dsh-resource://file/**/*.html`/`*.htm` at the `extension` band (longer pattern than better-sidebar) and renders an unsandboxed iframe pointed at the host route.

**Tech Stack:** TypeScript 5.6, tsdown 0.23 (rolldown) for dual-format bundling (ESM host + `window.__ModuleLoader__.load` CJS client), vitest 4 for tests, Node ≥20. React 18 (baseline module table, never bundled).

**Spec:** `docs/superpowers/specs/2026-10-01-browser-panel-design.md`

## Global Constraints

- `engines.node: ">=20"`; `type: module`; host artifact `lib/index.js` MUST be ESM (starts with `import`); client artifact `lib/client.js` MUST begin with `window.__ModuleLoader__.load({ id: "dsh-browser-panel", factory: (require) => {` and end with `return module.exports; }\n});`.
- The route serves the CSP verbatim from the spec (decision 3); NO `sandbox` attribute and NO `Content-Security-Policy: sandbox` anywhere.
- Tab claims must win over `dsh-better-sidebar`: patterns `['dsh-resource://file/**/*.html','dsh-resource://file/**/*.htm']` at `priority: 'extension'` — the `/*.html` suffix makes them longer than better-sidebar's `dsh-resource://file/**`, so the length tiebreak resolves to this plugin.
- Never import `@deepseek-ai/dsh-client-ui-*` packages (or any Harness Client package) as runtime modules; React comes from the module table via `require('react')`/`require('react/jsx-runtime')` only. Type imports from `@deepseek-ai/cordis` are erased and allowed.
- Path-encoding is segment-wise (`encodeURIComponent` per path segment), NOT whole-string — this is required so the browser's WHATWG URL algorithm resolves `./style.css` against the document URL to the correct sibling. (Corrects the spec's `encodeURIComponent(path)` shorthand; see Task 2.)

## Review Focus

The five failure modes the spec implies but its test sample does not pin:

1. **`..` traversal** — a crafted `/browser-html/<sid>/../../etc/passwd` must 403, not serve. → Task 2 `resolveInsideRoot` test.
2. **Absolute out-of-root path** — `/browser-html/<sid>/../outside/file.html` or an absolute-scope address outside the workspace root must 403. → Task 2 `resolveInsideRoot` test + Task 3 handler test.
3. **Cross-site request (CSRF)** — a page on another origin fetching `/browser-html/...` must be rejected (403), mirroring better-sidebar's fence. → Task 3 `isTrustedRequest`-gated handler test.
4. **Non-regular / directory** — a path resolving to a directory (or a symlink to one) must 403, not 500 or a directory listing. → Task 3 handler test.
5. **Oversized file** — a file over `mediaLimit` must 413 with a clean JSON error, not a truncated stream. → Task 3 handler test.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | manifest: dual exports, `dsh.bundle.patch`, `dsh.client` declaration, build/test scripts |
| `tsconfig.json` / `tsconfig.build.json` | typecheck base + declaration-only emit (`lib/*.d.ts`) |
| `tsdown.config.mjs` / `tsdown.client.config.mjs` | host ESM bundle + client CJS `__ModuleLoader__` bundle |
| `cordis.patch.yml` | loader insert row (`id`/`name`) |
| `src/browser-url.ts` | shared (host+client) segment-wise URL encode/decode, `BROWSER_ROUTE_PREFIX` |
| `src/csp.ts` | `BROWSER_CSP` constant |
| `src/mime.ts` | extension → content-type (+charset) |
| `src/path-security.ts` | `resolveInsideRoot` containment guard |
| `src/trust.ts` | `isTrustedRequest` fence |
| `src/session-cwd.ts` | `sessionCwdOf` workspace-root resolution |
| `src/handler.ts` | `createHandler` route handler (stat/read/CSP/errors) |
| `src/index.ts` | host entry: `name`/`inject`/`apply` |
| `src/client/address.ts` | `parseFileAddress` (mirrors better-sidebar) |
| `src/client/registry.ts` | tab id/kind/patterns/canOpen/title (pure, testable) |
| `src/client/iframe.ts` | `iframeSrcFor` (address → iframe URL) |
| `src/client/tab.tsx` | client entry: `inject`/`apply`, tab registration + iframe body |
| `test/*.test.ts` | vitest suites for all pure functions + handler |
| `samples/*` | end-to-end sample site |

`src/browser-url.ts` is imported by BOTH entries (host decodes, client encodes); tsdown inlines it into each bundle independently — no cross-entry coupling.

---

### Task 1: Scaffold + build pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsdown.config.mjs`, `tsdown.client.config.mjs`, `cordis.patch.yml`, `.gitignore`

**Interfaces:**
- Produces: `npm run build` → `lib/index.js` (ESM), `lib/client.js` (CJS `__ModuleLoader__` wrapper), `lib/*.d.ts`. Later tasks add source; this task proves the pipeline with stub entries.

- [ ] **Step 1: Write the manifest files** (exact fields)

`package.json` (key fields — write the rest as idiomatic):
```json
{
  "name": "dsh-browser-panel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "engines": { "node": ">=20" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-sidebar-right", "@deepseek-ai/dsh-client-modules"] },
    "manifestVersion": 1
  },
  "scripts": {
    "build": "node -e \"require('node:fs').rmSync('lib',{recursive:true,force:true})\" && tsc -p tsconfig.build.json && tsdown && tsdown --config tsdown.client.config.mjs",
    "test": "vitest run"
  },
  "devDependencies": { "typescript": "^5.6.0", "tsdown": "^0.23.0", "vitest": "^4.0.0", "@types/node": "^24.0.0", "@types/react": "^18.2.0", "@deepseek-ai/cordis": "^4.0.4" },
  "peerDependencies": { "@deepseek-ai/cordis": "^4.0.4", "@deepseek-ai/dsh-host-webserver": "^0.2.0-rc.1", "@deepseek-ai/dsh-session": "^0.2.0-rc.1", "@deepseek-ai/dsh-client-ui-slots": "^0.2.0-rc.1", "@deepseek-ai/dsh-client-ui-sidebar-right": "^0.2.0-rc.1", "react": "^18.2.0", "react-dom": "^18.2.0" }
}
```

`tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `lib ["ES2022","DOM"]`, `jsx react-jsx`, `strict true`, `skipLibCheck true`, `esModuleInterop true`, `types ["node"]`, `include ["src"]`.

`tsconfig.build.json`: `extends ./tsconfig.json`, `compilerOptions { emitDeclarationOnly: true, declaration: true, outDir: "lib", rootDir: "src" }`, `exclude ["**/*.test.ts","samples"]`.

`tsdown.config.mjs` (host — ESM only):
```js
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['es'],
  outDir: 'lib',
  outExtensions: () => ({ js: '.js' }),
  dts: false,
})
```

`tsdown.client.config.mjs` (client — CJS wrapped, React external):
```js
import { defineConfig } from 'tsdown'
const id = 'dsh-browser-panel'
export default defineConfig({
  entry: { client: 'src/client/tab.tsx' },
  format: ['cjs'],
  outDir: 'lib',
  outExtensions: () => ({ js: '.js' }),
  dts: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  banner: `window.__ModuleLoader__.load({\n\tid: "${id}",\n\tfactory: (require) => {`,
  footer: 'return module.exports; }\n});',
})
```

`cordis.patch.yml`:
```yaml
- insert:
    - id: browser-panel
      name: 'dsh-browser-panel'
```

`.gitignore`: `node_modules/`, `lib/`.

- [ ] **Step 2: Write stub entries** so the pipeline has something to build

`src/index.ts`: `export const name = 'dsh-browser-panel'; export const inject = ['webServer', 'sessions']; export function apply() {}`.
`src/client/tab.tsx`: `export const inject = ['slots']; export function apply() {}`.

- [ ] **Step 3: Install devDependencies**

Run: `npm install` (resolves typescript/tsdown/vitest/@types/cordis; network available).

- [ ] **Step 4: Build and verify artifacts**

Run: `npm run build`
Expected: `lib/index.js` starts with `import`/`export` (ESM); `lib/client.js` starts with `window.__ModuleLoader__.load({` and ends with `return module.exports; }\n});`; `lib/index.d.ts`, `lib/client.d.ts` exist.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold dsh-browser-panel package + build pipeline"
```

---

### Task 2: Shared pure helpers (URL, CSP, MIME, path, trust)

**Files:**
- Create: `src/browser-url.ts`, `src/csp.ts`, `src/mime.ts`, `src/path-security.ts`, `src/trust.ts`
- Test: `test/browser-url.test.ts`, `test/mime.test.ts`, `test/path-security.test.ts`, `test/trust.test.ts`

**Interfaces:**
- Produces:
  - `src/browser-url.ts`: `export const BROWSER_ROUTE_PREFIX = '/browser-html/'`; `export interface BrowserRouteRef { sessionId: string; path: string }`; `export type BrowserDecodeResult = { ok: true; ref: BrowserRouteRef } | { ok: false; status: 400 | 404; message: string }`; `export function encodeBrowserUrl(sessionId: string, path: string): string`; `export function decodeBrowserUrl(pathname: string): BrowserDecodeResult`.
  - `src/csp.ts`: `export const BROWSER_CSP: string`.
  - `src/mime.ts`: `export function mediaTypeForPath(path: string): string`; `export function contentTypeForPath(path: string): string`.
  - `src/path-security.ts`: `export function resolveInsideRoot(root: string, target: string): string | undefined`.
  - `src/trust.ts`: `export function isTrustedRequest(req: { headers: Record<string, string | string[] | undefined> }): boolean`.

- [ ] **Step 1: Write the failing tests** (`test/*.test.ts`)

`test/browser-url.test.ts` — encode/decode round-trips and error cases:
- `encodeBrowserUrl('s1', 'sub/dir/file.html')` === `'/browser-html/s1/sub/dir/file.html'`.
- `encodeBrowserUrl('s1', '/abs/file.html')` === `'/browser-html/s1/abs/file.html'` (leading slash dropped, absolute-in-root preserved as path).
- `encodeBrowserUrl('s1', '//host/share/x.html')` === `'/browser-html/s1//host/share/x.html'` (UNC marker preserved).
- `encodeBrowserUrl('s1', 'C:/x/y.html')` === `'/browser-html/s1/C:/x/y.html'` (drive colon NOT percent-encoded).
- `encodeBrowserUrl('s1', 'a b/файл.html')` percent-encodes space and unicode per segment.
- `decodeBrowserUrl('/browser-html/s1/sub/dir/file.html')` → `{ ok: true, ref: { sessionId: 's1', path: '/sub/dir/file.html' } }`.
- `decodeBrowserUrl('/browser-html/s1//host/share/x.html')` → path `'//host/share/x.html'`.
- `decodeBrowserUrl('/browser-html/s1/C:/x/y.html')` → path `'C:/x/y.html'` (no leading slash).
- `decodeBrowserUrl('/not-browser-html/x')` → `{ ok: false, status: 404 }`.
- `decodeBrowserUrl('/browser-html/')` → `{ ok: false, status: 400 }`.
- `decodeBrowserUrl('/browser-html/%E0%A4%A')` (malformed percent) → `{ ok: false, status: 400 }`.

`test/mime.test.ts`:
- `contentTypeForPath('x.html')` === `'text/html; charset=utf-8'`; `'x.htm'` same.
- `contentTypeForPath('x.css')` === `'text/css; charset=utf-8'`; `'x.js'` === `'text/javascript; charset=utf-8'`; `'x.json'` === `'application/json; charset=utf-8'`.
- `contentTypeForPath('x.png')` === `'image/png'`; `'x.svg'` === `'image/svg+xml'`; `'x.woff2'` === `'font/woff2'`.
- `mediaTypeForPath('x.unknown')` === `'application/octet-stream'`.

`test/path-security.test.ts`:
- `resolveInsideRoot('/w', 'sub/file.html')` === `'/w/sub/file.html'`.
- `resolveInsideRoot('/w', '/w/sub/file.html')` === `'/w/sub/file.html'` (absolute-in-root).
- `resolveInsideRoot('/w', '../etc/passwd')` === `undefined` (`..` escape).
- `resolveInsideRoot('/w', '/etc/passwd')` === `undefined` (absolute out-of-root).
- `resolveInsideRoot('/w', '/w')` === `'/w'` (root itself allowed).

`test/trust.test.ts`:
- `isTrustedRequest({ headers: { 'sec-fetch-site': 'same-origin' } })` === `true`.
- `isTrustedRequest({ headers: { 'sec-fetch-site': 'cross-site' } })` === `false`.
- `isTrustedRequest({ headers: {} })` === `true` (header absent → allowed).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/browser-url.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement the five modules**

`src/browser-url.ts` — mirror better-sidebar's `encodeHtmlUrl`/`decodeHtmlUrl`, prefix `/browser-html/`, segment-wise `encodeURIComponent` (not whole-string), UNC `''` first-segment marker, drive `C:` kept literal, `try/catch` on `decodeURIComponent` → 400. `decodeBrowserUrl` returns `path` as `'/'+tail`, `'//'+tail` (UNC), or drive form without leading slash.

`src/csp.ts` — the exact CSP:
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'
```

`src/mime.ts` — `MEDIA_TYPES` map (html/htm/css/js/mjs/json/png/jpg/jpeg/gif/webp/svg/bmp/ico/avif/pdf/woff/woff2/ttf/otf/wasm/txt/xml/mp3/mp4) → `mediaTypeForPath` (`application/octet-stream` fallback); `contentTypeForPath` appends `; charset=utf-8` for `text/*`, `application/json`, and `application/javascript`-family.

`src/path-security.ts` — `resolveInsideRoot(root, target)`: `resolved = resolve(root, target)` (node `path.resolve` — absolute target overrides root, relative joins); `rel = relative(resolve(root), resolved)`; return `resolved` iff `rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))`, else `undefined`.

`src/trust.ts` — `isTrustedRequest(req)`: read `req.headers['sec-fetch-site']`, return `false` iff the (lowercased, joined) value === `'cross-site'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all four suites PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: shared URL/CSP/MIME/path/trust helpers"
```

---

### Task 3: Host route handler + apply

**Files:**
- Create: `src/session-cwd.ts`, `src/handler.ts`, `src/index.ts` (replace stub)
- Test: `test/handler.test.ts`

**Interfaces:**
- Consumes: `decodeBrowserUrl`, `BROWSER_CSP`, `contentTypeForPath`, `resolveInsideRoot`, `isTrustedRequest` (Task 2).
- Produces:
  - `src/session-cwd.ts`: `export async function sessionCwdOf(ctx: HostContext, sessionId: string): Promise<string>`.
  - `src/handler.ts`: `export interface BrowserRouteOptions { mediaLimit?: number }`; `export interface HostContext { sessions: { get(id: string): { header: { cwd?: string } } | undefined }; webServer: { register(route: unknown): () => void } }`; `export function createHandler(ctx: HostContext, options?: BrowserRouteOptions): (req: any, res: any) => Promise<void>`.
  - `src/index.ts`: `export const name = 'dsh-browser-panel'`; `export const inject = ['webServer', 'sessions']`; `export const DEFAULT_MEDIA_LIMIT = 20 * 1024 * 1024`; `export function apply(ctx: HostContext, config?: { mediaLimit?: number }): void`.

- [ ] **Step 1: Write the failing handler tests** (`test/handler.test.ts`)

Build a fake `HostContext` with a `tmpdir` root, a fake `webServer.register` that captures the route, and a fake `sessions.get` returning `{ header: { cwd: tmpdir } }`. Write fixture files into `tmpdir` (an `index.html`, a `style.css`, a sibling dir, and an oversized file). Then assert via a fake `req`/`res` (capture `writeHead` args and `end` body):

- GET valid html → status 200, `content-type` `'text/html; charset=utf-8'`, `content-security-policy` === `BROWSER_CSP`, `x-content-type-options` `'nosniff'`, `cache-control` `'no-cache'`, body === file contents, and NO `sandbox` in the CSP.
- GET valid css → status 200, `content-type` `'text/css; charset=utf-8'`.
- GET missing file → status 404, JSON body `{ ok: false, ... }`.
- GET path resolving to `../outside` (relative escape) → status 403.
- GET absolute out-of-root path → status 403.
- GET a directory → status 403.
- GET oversized file (> `mediaLimit`) → status 413.
- non-GET method (POST) → status 405.
- cross-site request (`sec-fetch-site: cross-site`) → status 403.
- `apply(ctx)` calls `ctx.webServer.register` exactly once with `{ kind: 'prefix', path: '/browser-html', handler }` and returns a cleanup on dispose (verify the returned disposer is invoked by `ctx.effect` teardown).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/handler.test.ts`
Expected: FAIL (createHandler undefined).

- [ ] **Step 3: Implement `sessionCwdOf`, `createHandler`, `apply`**

`sessionCwdOf(ctx, sessionId)`: `ctx.sessions.get(sessionId)?.header.cwd` → else `process.cwd()`.

`createHandler(ctx, options)`: returns `async (req, res) => { ... }`:
1. `if (!isTrustedRequest(req)) { writeError(res, 403, 'forbidden'); return }`
2. `if (req.method !== 'GET') { res.writeHead(405); res.end(); return }`
3. decode `new URL(req.url ?? '/', 'http://dsh.internal').pathname`; if `!decoded.ok` → `writeError` with `decoded.status`.
4. `root = await sessionCwdOf(ctx, decoded.ref.sessionId)`; `absolute = resolveInsideRoot(root, decoded.ref.path)`; `undefined` → 403 `'path escapes workspace root'`.
5. `stat(absolute)` (catch `ENOENT` → 404 `'not found'`); `!info.isFile()` → 403 `'not a regular file'`; `info.size > (options.mediaLimit ?? DEFAULT_MEDIA_LIMIT)` → 413 `'file too large'`.
6. `body = await readFile(absolute)`; `res.writeHead(200, { 'content-type': contentTypeForPath(absolute), 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': BROWSER_CSP })`; `res.end(body)`.
7. wrap steps 3–6 in `try/catch` → `writeError(res, error)`.

`writeError` helper (local): `res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, error: { code, message } }))`.

`apply(ctx, config)`: `ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/browser-html', handler: createHandler(ctx, config) }), 'dsh-browser-panel: /browser-html route')`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: handler suite PASS (plus Task 2 suites still green).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: host /browser-html file-serving route with containment + CSP"
```

---

### Task 4: Client address parser + tab registration + iframe body

**Files:**
- Create: `src/client/address.ts`, `src/client/registry.ts`, `src/client/iframe.ts`, `src/client/tab.tsx` (replace stub)
- Test: `test/address.test.ts`, `test/registry.test.ts`, `test/iframe.test.ts`

**Interfaces:**
- Consumes: `encodeBrowserUrl` (Task 2).
- Produces:
  - `src/client/address.ts`: `export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'`; `export type FileAddress = { scope: 'session'; sessionId: string; path: string } | { scope: 'absolute'; path: string }`; `export function parseFileAddress(address: string): FileAddress | undefined`.
  - `src/client/registry.ts`: `export const BROWSER_TAB_ID = 'dsh-browser-panel'`; `export const BROWSER_TAB_KIND = 'html-browser'`; `export const BROWSER_PATTERNS = ['dsh-resource://file/**/*.html', 'dsh-resource://file/**/*.htm'] as const`; `export function canOpenAddress(address: string): boolean`; `export function titleForAddress(address: string): string`.
  - `src/client/iframe.ts`: `export function iframeSrcFor(contentId: string): string | undefined`.
  - `src/client/tab.tsx`: `export const inject = ['slots']`; `export function apply(ctx: ClientContext): void`.

- [ ] **Step 1: Write the failing tests**

`test/address.test.ts` (mirror better-sidebar's `parseFileAddress` contract):
- `parseFileAddress('dsh-resource://file/session/s1/sub%2Fdir%2Ffile.html')` → `{ scope: 'session', sessionId: 's1', path: 'sub/dir/file.html' }`.
- `parseFileAddress('dsh-resource://file/absolute//host/share/x.html')` → `{ scope: 'absolute', path: '//host/share/x.html' }`.
- `parseFileAddress('dsh-resource://file/absolute/C:/x/y.html')` → `{ scope: 'absolute', path: 'C:/x/y.html' }`.
- `parseFileAddress('dsh-resource://file/session//file.html')` → `undefined` (empty sessionId).
- `parseFileAddress('not-an-address')` → `undefined`.
- `parseFileAddress('dsh-resource://file/%E0%A4%A')` → `undefined` (malformed percent).

`test/registry.test.ts`:
- `canOpenAddress('dsh-resource://file/session/s1/a.html')` === `true`.
- `canOpenAddress('.../a.htm')` === `true`; `'.../a.HTML'` === `true` (case-insensitive).
- `canOpenAddress('.../a.pdf')` === `false`; `'.../a.png')` === `false`; `'.../a.html.bak')` === `false`.
- `canOpenAddress('not-an-address')` === `false`.
- `titleForAddress('.../a.html')` === `'a.html'`; `titleForAddress('not-an-address')` === `'HTML'` (fallback).
- `BROWSER_PATTERNS[0]` is longer than `'dsh-resource://file/**'`.

`test/iframe.test.ts`:
- `iframeSrcFor('dsh-resource://file/session/s1/sub/dir/file.html')` === `'/browser-html/s1/sub/dir/file.html'`.
- `iframeSrcFor('dsh-resource://file/absolute/C:/x/y.html')` === `'/browser-html//C:/x/y.html'` (absolute scope has no sessionId → empty segment).
- `iframeSrcFor('not-an-address')` === `undefined`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/address.test.ts test/registry.test.ts test/iframe.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the four modules**

`src/client/address.ts` — port better-sidebar's `parseFileAddress` verbatim (prefix slice at index 20, strip `[?#]`, split `/`, decodeURIComponent per segment in try/catch, session/absolute scopes, UNC `''` first segment, drive detection).

`src/client/registry.ts` — `canOpenAddress(address)` = `/\.html?$/i.test(parseFileAddress(address)?.path ?? '')`; `titleForAddress(address)` = basename of the parsed path (`path.split(/[\\/]/).pop()`) or `'HTML'`.

`src/client/iframe.ts` — `parseFileAddress(contentId)`; session scope → `encodeBrowserUrl(sessionId, path)`; absolute scope → `encodeBrowserUrl('', path)` (empty sessionId → double slash in URL, host resolves against `process.cwd()`); else `undefined`.

`src/client/tab.tsx` — client entry. Structural `ClientContext` type (`slots` + the `ctx.inject`/`ctx.effect` methods from `@deepseek-ai/cordis`'s `Context` type, plus `sidebarRightTabs` accessed via `ctx.inject(['sidebarRightTabs'], cb)`). In `apply`:

```ts
ctx.effect(() => {
  const disposers: (() => void)[] = []
  ctx.inject(['sidebarRightTabs'], (injected: any) => {
    const tabs = injected.get('sidebarRightTabs')
    // register the tab type
    disposers.push(tabs.register({
      id: BROWSER_TAB_ID,
      kind: BROWSER_TAB_KIND,
      multiple: true,
      patterns: BROWSER_PATTERNS,
      priority: 'extension',
      canOpen: canOpenAddress,
      title: titleForAddress,
    }))
    // register the body + title slots
    disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab', key: BROWSER_TAB_ID, inject: (sessionId: string) => ({ sessionId }) }, BrowserTabBody)))
    disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: BROWSER_TAB_ID, inject: () => ({}) }, BrowserTabTitle)))
  })
  return () => disposers.forEach((d) => d())
}, 'dsh-browser-panel: tab registration')
```

`BrowserTabBody` is a React component receiving the slot framework props; it reads `props.useTabInfo().tab.contentId`, computes `iframeSrcFor(contentId)`, and renders:

```tsx
<iframe src={src} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="browser-panel" />
```

(No `sandbox` attribute. The `useTabInfo` prop name comes from the slot's `hooks.tabInfo` compartment via the slots framework's `use<Name>` convention — see spec.)

`BrowserTabTitle` renders the basename string (or reuses `titleForAddress` from `useTabInfo().tab.contentId`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 5: Build and verify the client wrapper**

Run: `npm run build`
Expected: `lib/client.js` starts with `window.__ModuleLoader__.load({` and its body contains `require("react/jsx-runtime")` (externalized, not inlined); `lib/index.js` is ESM.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: client html-browser tab type with iframe body"
```

---

### Task 5: End-to-end sample site + install

**Files:**
- Create: `samples/index.html`, `samples/style.css`, `samples/app.js`, `samples/data.json`, `samples/other.html`, `samples/img/logo.png`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the sample site**

`index.html` references `./style.css` (`<link rel="stylesheet">`), `./app.js` (`<script type="module">`), an internal `<a href="other.html">`, an external `<a href="https://example.com">`, a local `<img src="img/logo.png">`, and an external `<img src="https://example.com/x.png">`. `app.js` is an ES module that `fetch('./data.json')` and writes the result into `#result`. `data.json` = `{"message":"local fetch works"}`. `style.css` colors the body (proves CSS applied). `img/logo.png` = any small valid PNG.

- [ ] **Step 2: Build and test**

Run: `npm run build && npm test`
Expected: build clean, all tests pass.

- [ ] **Step 3: Install the bundle**

Per the cordis-plugin-development skill: write the built files (already in the workspace), then invoke the `plugin_manager` tool with `action: 'install_bundle'` and `target` = absolute path to the package directory. This step requires approval and a running harness; if the tool is not reachable from this session, stop here and report the exact install command for the user to run (the deliverable is complete and build-tested).

- [ ] **Step 4: Verify live**

Open a `.html` file in the Files sidebar and confirm: CSS applies, the module script runs, local `fetch('./data.json')` resolves, the internal link navigates in-panel, the external link navigates the iframe, and the external `<img>` is blocked (CSP). Confirm `dsh-better-sidebar` no longer claims `.html`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: end-to-end sample site for browser panel"
```

---

## Self-Review Notes (checked against spec)

1. **Spec coverage** — Decisions 1/2/3 map to Task 3 (no-sandbox CSP, route) and Task 4 (takeover patterns, multiple:true). Architecture host/client halves → Tasks 3/4. Network CSP → Task 2 (`BROWSER_CSP`) + Task 3 (header). Path-traversal guard + error map (404/403/413) → Tasks 2/3. Address parsing → Task 4. Package layout → Task 1. Testing sample → Task 5. **One deliberate correction:** the spec's `encodeURIComponent(path)` whole-string shorthand would break relative-subresource resolution; the plan uses segment-wise encoding (better-sidebar's proven mechanism), documented in Global Constraints.
2. **Step scan** — every step names an exact function/signature + the test asserting spec values; no "handle edge cases" or body-transcript steps.
3. **Type consistency** — `encodeBrowserUrl`/`decodeBrowserUrl`/`parseFileAddress`/`iframeSrcFor`/`resolveInsideRoot`/`createHandler` signatures agree across Tasks 2–4.
4. **Review Focus** — all five lines have owning tests (Task 2 for `..`/absolute escape + trust; Task 3 for directory/oversize/cross-site).
5. **Proportion** — plan ≈ spec length; bodies appear only where the signature+tests do not determine them (decode algorithm, handler order, tsdown banner/footer).
