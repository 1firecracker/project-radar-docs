# Project Radar Docs Realtime Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly deploy a Project Radar documentation site whose content is updated within seconds by a macOS login-started watcher reading `/Users/baowenzhuo/project/xhxagentv3/docs/bwz`.

**Architecture:** A Vinext/React site renders a client-side documentation shell while the Cloudflare Worker exposes public read routes and Bearer-protected synchronization routes. R2 stores immutable SHA-256-addressed objects and a single atomically replaced manifest; a dependency-free Node.js watcher uploads missing objects, commits the manifest, retries failures, and is managed by a macOS LaunchAgent.

**Tech Stack:** Node.js 22+, TypeScript 5.9, React 19, Vinext 0.0.50, Cloudflare Workers/R2, `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `rehype-sanitize` 6.0.0, Node test runner, `tsx` 4.23.0, macOS `launchd`, OpenAI Sites.

## Global Constraints

- Site source, tests, configuration, documentation, generated build artifacts, branches, and commits stay in `/Users/baowenzhuo/Documents/Codex/2026-07-10/sites-plugin-sites-openai-bundled-2`.
- `/Users/baowenzhuo/project/xhxagentv3` is read-only input. Never write files, run Git mutations, change `.gitignore`, stage files, create branches, or commit there.
- The watcher reads only `/Users/baowenzhuo/project/xhxagentv3/docs/bwz`; it writes state, configuration, logs, and locks only under `~/Library/Application Support/ProjectRadarDocsSync` and `~/Library/Logs/ProjectRadarDocsSync`.
- The website is public read-only. Every `/api/sync/*` route requires `Authorization: Bearer {DOCS_SYNC_TOKEN}`.
- `DOCS_SYNC_TOKEN` is a Sites secret and a mode-`0600` local value. It never appears in Git, logs, browser responses, shell command output, or the final response.
- R2 binding name is exactly `DOCS`; D1 stays `null`.
- Hidden paths, absolute paths, path traversal, and symbolic links are rejected. A single file may not exceed `20 * 1024 * 1024` bytes.
- Markdown does not execute raw HTML. Standalone HTML renders only in an iframe without `allow-scripts` or `allow-same-origin` and receives a restrictive CSP.
- Public document routes are `/` for `README.md` and `/docs/{full-relative-path}` for other `.md`, `.html`, and `.htm` files.
- Use TDD for every behavior-bearing task. Commit after each independently verified task.
- Keep the retained development server alive through build and publishing. Do not perform browser screenshots or UI inspection unless the user separately requests it.

---

## File Structure

```text
.openai/hosting.json                 R2 binding and Sites project id
.env.example                        local variable names with a non-production development value
app/page.tsx                        README route
app/docs/[...slug]/page.tsx         stable deep document route
app/components/DocsSite.tsx         loading, error, navigation, and document state
app/components/Navigation.tsx       desktop sidebar and mobile drawer
app/components/MarkdownDocument.tsx safe Markdown renderer and relative-link resolver
app/components/HtmlDocument.tsx     sandboxed standalone HTML frame
app/globals.css                     complete responsive documentation visual system
app/layout.tsx                      Chinese metadata, favicon, and social metadata
lib/content/types.ts                manifest and file types
lib/content/paths.ts                path validation, resolving, and URL generation
lib/content/manifest.ts             manifest validation, lookup, and navigation ordering
lib/content/r2-store.ts             R2 object and manifest operations
lib/sync/auth.ts                    constant-time Bearer validation
worker/env.ts                       Worker environment and R2 structural types
worker/sync-routes.ts               protected status, object upload, and commit routes
worker/public-routes.ts             public manifest, immutable object, and raw path routes
worker/index.ts                     route dispatch before Vinext fallback
sync/config.mjs                     local config validation
sync/core.mjs                       scan, hash, manifest, and diff logic
sync/client.mjs                     authenticated synchronization HTTP client
sync/watcher.mjs                    recursive watch, debounce, single flight, and retry
sync/install-launch-agent.mjs       runtime installation and LaunchAgent bootstrap
sync/uninstall-launch-agent.mjs     LaunchAgent removal without deleting source documents
tests/helpers/memory-r2.ts           deterministic in-memory R2 fake
tests/configuration.test.mjs         starter and repository-boundary assertions
tests/content-core.test.ts           manifest, path, and navigation tests
tests/sync-routes.test.ts            protected write-path tests
tests/public-routes.test.ts          public read-path and HTML-security tests
tests/docs-ui.test.tsx               component rendering and link-rewrite tests
sync/tests/core.test.mjs             local scan and diff tests
sync/tests/client.test.mjs           upload/commit/retry tests
sync/tests/integration.test.mjs      real filesystem watch against a local mock service
sync/tests/launch-agent.test.mjs     plist and secret-separation tests
public/og.png                        generated Project Radar social preview
```

## Task 1: Initialize the Sites project and lock configuration boundaries

**Files:**
- Create from Sites starter: `package.json`, `package-lock.json`, `.gitignore`, `.openai/hosting.json`, `app/**`, `worker/**`, `build/**`, `vite.config.ts`, and starter support files
- Create: `.env.example`
- Create: `tests/configuration.test.mjs`
- Modify: `package.json`, `.gitignore`, `.openai/hosting.json`, `vite.config.ts`, `docs/文档索引.md`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-07-10-project-radar-docs-sync-design.md`
- Produces: an installed Vinext project with `DOCS` R2 binding and test scripts `test:unit`, `test:sync`, and `test`

- [ ] **Step 1: Initialize exactly once with the bundled Sites initializer**

The project root already contains the approved spec, so initialize into the ignored staging directory and merge the starter without its nested Git repository:

```bash
mkdir -p work/sites-starter
/Users/baowenzhuo/.codex/plugins/cache/openai-bundled/sites/0.1.27/scripts/init-site.sh "$PWD/work/sites-starter"
rsync -a --exclude '.git' --exclude 'node_modules' "$PWD/work/sites-starter/" "$PWD/"
mv "$PWD/work/sites-starter/node_modules" "$PWD/node_modules"
```

Expected: starter files exist in the independent Sites repository, the existing `docs/` tree is preserved, and the AgentV3 repository status is unchanged.

- [ ] **Step 2: Start and retain the development server**

Run `npm run dev` in a retained terminal session. Use the exact Local URL printed by Vinext and open it in Codex once. Keep this session alive until publishing finishes.

Expected: the starter loading page responds successfully.

- [ ] **Step 3: Write the failing configuration test**

Create `tests/configuration.test.mjs` with assertions that:

```js
assert.deepEqual(hosting, { d1: null, r2: "DOCS" });
assert.equal(pkg.dependencies["react-markdown"], "10.1.0");
assert.equal(pkg.dependencies["remark-gfm"], "4.0.1");
assert.equal(pkg.dependencies["rehype-sanitize"], "6.0.0");
assert.equal(pkg.devDependencies.tsx, "4.23.0");
assert.match(envExample, /^DOCS_SYNC_TOKEN=local-development-token-[0-9]{32}$/m);
assert.doesNotMatch(launchAgentSource, /\/Users\/baowenzhuo\/project\/xhxagentv3.*(?:writeFile|appendFile|mkdir)/s);
```

For the last assertion, treat a missing `sync/install-launch-agent.mjs` as an empty string so this task can establish configuration before the installer exists.

- [ ] **Step 4: Run the test and verify failure**

Run: `node --test tests/configuration.test.mjs`

Expected: FAIL because R2 and package dependencies are not configured.

- [ ] **Step 5: Apply the minimal project configuration**

Set `.openai/hosting.json` exactly to:

```json
{
  "d1": null,
  "r2": "DOCS"
}
```

Install exact dependencies:

```bash
npm install react-markdown@10.1.0 remark-gfm@4.0.1 rehype-sanitize@6.0.0
npm install --save-dev tsx@4.23.0
```

Add these package scripts:

```json
{
  "test:unit": "node --import tsx --test tests/*.test.ts tests/*.test.tsx",
  "test:sync": "node --test sync/tests/*.test.mjs",
  "test": "npm run test:unit && npm run test:sync && npm run build && node --test tests/rendered-html.test.mjs"
}
```

Create `.env.example` with:

```dotenv
DOCS_SYNC_TOKEN=local-development-token-00000000000000000000000000000000
```

Add `!.env.example` after `.env*` in `.gitignore`. In `vite.config.ts`, add `vars: { DOCS_SYNC_TOKEN: process.env.DOCS_SYNC_TOKEN ?? "local-development-token-00000000000000000000000000000000" }` to the local Cloudflare binding configuration.

- [ ] **Step 6: Pass configuration tests and verify repository isolation**

Run:

```bash
node --test tests/configuration.test.mjs
git status --short
git -C /Users/baowenzhuo/project/xhxagentv3 status --short
```

Expected: configuration test PASS; only the independent Sites repository contains new site files; AgentV3 still shows only its pre-existing `.gitignore` and `docs/design-assets/` changes.

- [ ] **Step 7: Commit**

```bash
git add . ':!work' ':!outputs'
git commit -m "chore: initialize Project Radar docs site"
```

## Task 2: Implement manifest, path, and navigation rules

**Files:**
- Create: `lib/content/types.ts`
- Create: `lib/content/paths.ts`
- Create: `lib/content/manifest.ts`
- Create: `tests/content-core.test.ts`

**Interfaces:**
- Produces: `validateContentPath(path)`, `resolveContentPath(from, target)`, `documentHref(path)`, `validateManifest(value)`, `findManifestFile(manifest, path)`, and `orderedDocuments(manifest)`
- Types: `ContentKind = "markdown" | "html" | "asset"`, `ManifestFile`, and `ContentManifest`

- [ ] **Step 1: Write failing core tests**

Use exact cases in `tests/content-core.test.ts`:

```ts
assert.equal(validateContentPath("决策记录/采用任务边界触发.md"), "决策记录/采用任务边界触发.md");
assert.throws(() => validateContentPath("../secret.md"), /invalid content path/i);
assert.throws(() => validateContentPath(".private/token.txt"), /hidden path/i);
assert.equal(resolveContentPath("决策记录/a.md", "../产品概要.md"), "产品概要.md");
assert.equal(documentHref("README.md"), "/");
assert.equal(documentHref("决策记录/采用任务边界触发.md"), "/docs/%E5%86%B3%E7%AD%96%E8%AE%B0%E5%BD%95/%E9%87%87%E7%94%A8%E4%BB%BB%E5%8A%A1%E8%BE%B9%E7%95%8C%E8%A7%A6%E5%8F%91.md");
assert.deepEqual(orderedDocuments(manifest).map((file) => file.path), [
  "README.md",
  "产品概要.md",
  "零版产品需求.md",
  "技术设计.md",
  "实施计划.md",
  "测试与演示.md",
  "决策记录/采用任务边界触发.md",
]);
```

Also reject uppercase/non-64-character hashes, negative byte counts, duplicate paths, duplicate manifest entries, and unsupported `schemaVersion`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern='content core'`

Expected: FAIL with module-not-found errors for `lib/content/*`.

- [ ] **Step 3: Implement the typed core**

Define:

```ts
export interface ManifestFile {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  kind: "markdown" | "html" | "asset";
}

export interface ContentManifest {
  schemaVersion: 1;
  revision: string;
  generatedAt: string;
  files: ManifestFile[];
}
```

`validateContentPath` must normalize Unicode text without changing case, convert backslashes to `/`, reject empty segments, `.`/`..`, leading `/`, NUL, and segments beginning with `.`. `orderedDocuments` includes only Markdown/HTML kinds and applies the exact Project Radar root order from the test before lexical sorting of remaining root files and `决策记录/` children.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm run test:unit -- --test-name-pattern='content core'
npx tsc --noEmit
```

Expected: all content-core tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/content tests/content-core.test.ts
git commit -m "feat: define content manifest and path rules"
```

## Task 3: Implement authenticated R2 synchronization routes

**Files:**
- Create: `worker/env.ts`
- Create: `lib/sync/auth.ts`
- Create: `lib/content/r2-store.ts`
- Create: `worker/sync-routes.ts`
- Create: `tests/helpers/memory-r2.ts`
- Create: `tests/sync-routes.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Consumes: `ContentManifest`, `validateManifest`, `validateContentPath`
- Produces: `handleSyncRoute(request, env, ctx): Promise<Response | null>` and `R2Store` functions `getCurrentManifest`, `putVerifiedObject`, `commitManifest`, and `garbageCollect`

- [ ] **Step 1: Write failing sync-route tests**

Test the exact contract:

```ts
assert.equal((await request("GET", "/api/sync/status")).status, 401);
assert.equal((await authorized("GET", "/api/sync/status")).status, 200);
assert.equal((await authorized("PUT", `/api/sync/objects/${hash}`, bytes)).status, 201);
assert.equal((await authorized("PUT", `/api/sync/objects/${wrongHash}`, bytes)).status, 422);
assert.equal((await authorized("POST", "/api/sync/commit", missingObjectManifest)).status, 422);
assert.equal((await authorized("POST", "/api/sync/commit", firstCommit)).status, 200);
assert.equal((await authorized("POST", "/api/sync/commit", staleBaseRevision)).status, 409);
```

Assert that a second upload of the same hash returns 204, a 20 MiB + 1 byte request returns 413, malformed manifests return 400, and successful commit calls `ctx.waitUntil` for garbage collection.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern='sync routes'`

Expected: FAIL because sync modules do not exist.

- [ ] **Step 3: Implement constant-time Bearer validation and R2 store**

`isAuthorized` must compare UTF-8 bytes across the greater input length and fold the length difference into the accumulator. `putVerifiedObject` reads at most `20 * 1024 * 1024 + 1` bytes, hashes with `crypto.subtle.digest("SHA-256", bytes)`, and stores only exact matches at `objects/{hash}`.

`commitManifest` must:

```ts
const current = await getCurrentManifest(bucket);
if ((current?.revision ?? null) !== baseRevision) return { kind: "conflict" };
for (const file of manifest.files) {
  if (!(await bucket.head(`objects/${file.sha256}`))) return { kind: "missing", sha256: file.sha256 };
}
await bucket.put("manifests/current.json", JSON.stringify(manifest), {
  httpMetadata: { contentType: "application/json; charset=utf-8" },
});
return { kind: "committed", previous: current };
```

After responding, delete only object hashes referenced by the previous manifest and not the new manifest.

- [ ] **Step 4: Dispatch sync routes before Vinext**

In `worker/index.ts`, add `DOCS` and `DOCS_SYNC_TOKEN` to `Env`, call `handleSyncRoute` before image optimization, and return its response when non-null. Do not expose secrets in error bodies.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm run test:unit -- --test-name-pattern='sync routes'
npx tsc --noEmit
```

Expected: all sync route tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add worker lib tests/helpers tests/sync-routes.test.ts
git commit -m "feat: add atomic authenticated R2 sync API"
```

## Task 4: Implement public content and sandboxed HTML routes

**Files:**
- Create: `worker/public-routes.ts`
- Create: `tests/public-routes.test.ts`
- Modify: `worker/index.ts`

**Interfaces:**
- Consumes: current manifest and `DOCS` bucket
- Produces: `handlePublicRoute(request, env): Promise<Response | null>` for `/api/content/manifest`, `/api/content/objects/{sha256}`, and `/raw/{content-path}`

- [ ] **Step 1: Write failing public-route tests**

Assert:

```ts
assert.equal(manifestResponse.status, 200);
assert.match(manifestResponse.headers.get("cache-control") ?? "", /no-cache/);
assert.equal(objectResponse.headers.get("etag"), `"${hash}"`);
assert.match(objectResponse.headers.get("cache-control") ?? "", /immutable/);
assert.equal(rawHtml.headers.get("content-security-policy"), "default-src 'self' data:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
assert.equal((await get("/raw/../secret.md")).status, 400);
assert.equal((await get("/raw/deleted.md")).status, 404);
```

Also assert `If-None-Match` returns 304 for immutable objects and that raw paths can read only objects referenced by the current manifest.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- --test-name-pattern='public routes'`

Expected: FAIL because `worker/public-routes.ts` does not exist.

- [ ] **Step 3: Implement public routes**

Return manifest JSON with `Cache-Control: no-cache`. Return content-addressed objects with `ETag: "{sha256}"` and `Cache-Control: public, max-age=31536000, immutable`. Resolve `/raw/{content-path}` only through the current manifest; return `Cache-Control: public, max-age=5, must-revalidate`. Add the exact CSP from the test to HTML responses and `X-Content-Type-Options: nosniff` to every content response.

- [ ] **Step 4: Dispatch public routes and verify**

Call `handlePublicRoute` after sync routes and before Vinext. Run:

```bash
npm run test:unit -- --test-name-pattern='public routes'
npx tsc --noEmit
```

Expected: public route tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add worker/public-routes.ts worker/index.ts tests/public-routes.test.ts
git commit -m "feat: serve public documents and sandboxed html"
```

## Task 5: Build the responsive documentation interface

**Files:**
- Create: `app/components/DocsSite.tsx`
- Create: `app/components/Navigation.tsx`
- Create: `app/components/MarkdownDocument.tsx`
- Create: `app/components/HtmlDocument.tsx`
- Create: `app/docs/[...slug]/page.tsx`
- Create: `tests/docs-ui.test.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `tests/rendered-html.test.mjs`, `package.json`
- Delete: `app/_sites-preview/SkeletonPreview.tsx`, `app/_sites-preview/preview.css`

**Interfaces:**
- Consumes: `ContentManifest`, `orderedDocuments`, `documentHref`, public content routes
- Produces: `<DocsSite initialPath: string>`, `<Navigation>`, `<MarkdownDocument>`, and `<HtmlDocument>`

- [ ] **Step 1: Replace starter tests with failing product tests**

In `tests/docs-ui.test.tsx`, server-render components with fixture manifest/content and assert:

```ts
assert.match(html, /Project Radar/);
assert.match(html, /文档导航/);
assert.match(html, /产品概要/);
assert.match(html, /href="\/docs\/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md"/);
assert.match(markdownHtml, /href="\/docs\/%E5%86%B3%E7%AD%96%E8%AE%B0%E5%BD%95\/%E9%87%87%E7%94%A8%E4%BB%BB%E5%8A%A1%E8%BE%B9%E7%95%8C%E8%A7%A6%E5%8F%91.md"/);
assert.doesNotMatch(markdownHtml, /<script|onerror=/i);
assert.match(htmlFrame, /sandbox=""/);
assert.doesNotMatch(htmlFrame, /allow-scripts|allow-same-origin/);
```

Update `tests/rendered-html.test.mjs` to expect the product title, Chinese `lang`, no `codex-preview` marker, no `_sites-preview`, and no `react-loading-skeleton` dependency.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm run test:unit -- --test-name-pattern='docs ui'
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: component imports fail and rendered HTML still contains starter metadata.

- [ ] **Step 3: Implement the documentation shell**

`DocsSite` fetches `/api/content/manifest`, finds `initialPath`, fetches `/api/content/objects/{sha256}`, and renders explicit loading, empty, 404, and retryable error states. It also fetches `README.md` when needed to keep navigation context available.

`Navigation` renders the ordered document list, active state, sync timestamp, a desktop `<nav aria-label="文档导航">`, and a keyboard-operable mobile drawer. `MarkdownDocument` uses `react-markdown`, `remark-gfm`, and `rehype-sanitize` without `rehype-raw`; relative document links use `documentHref`, while images/attachments resolve to the manifest object's immutable URL. `HtmlDocument` renders:

```tsx
<iframe
  className="html-document-frame"
  sandbox=""
  src={`/raw/${path.split("/").map(encodeURIComponent).join("/")}`}
  title={`${title} HTML 文档`}
/>
```

- [ ] **Step 4: Complete routes, metadata, and styling**

`app/page.tsx` returns `<DocsSite initialPath="README.md" />`. `app/docs/[...slug]/page.tsx` awaits `params`, joins the decoded slug segments with `/`, validates the path, and renders `DocsSite`.

Set `<html lang="zh-CN">`, title `Project Radar 文档`, and description `Project Radar 的产品、需求、技术设计、实施计划与决策记录。`. Replace `app/globals.css` with the approved light documentation system: deep-gray body copy, muted blue-violet accent, fixed desktop sidebar, readable article width, responsive drawer, accessible focus rings, table overflow, code wrapping, and `prefers-reduced-motion` handling.

Remove `app/_sites-preview`, remove `react-loading-skeleton`, refresh the lockfile, and remove every starter SVG not referenced by the finished site.

- [ ] **Step 5: Pass UI, build, and rendered output tests**

Run:

```bash
npm run test:unit -- --test-name-pattern='docs ui'
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: all tests PASS, build exits 0, title is Project Radar, and no starter markers remain.

- [ ] **Step 6: Commit**

```bash
git add app lib tests package.json package-lock.json public
git commit -m "feat: build Project Radar documentation interface"
```

## Task 6: Implement the local scanner, sync client, watcher, and retry loop

**Files:**
- Create: `sync/config.mjs`
- Create: `sync/core.mjs`
- Create: `sync/client.mjs`
- Create: `sync/watcher.mjs`
- Create: `sync/tests/core.test.mjs`
- Create: `sync/tests/client.test.mjs`
- Create: `sync/tests/integration.test.mjs`

**Interfaces:**
- Produces: `loadConfig(path)`, `scanSource(root)`, `buildManifest(files)`, `syncOnce(config, fetchImpl)`, `createWatcher(config)`, and `computeRetryDelay(attempt)`
- HTTP contract: GET status, PUT missing immutable objects, POST commit with `baseRevision`

- [ ] **Step 1: Write failing scanner and client tests**

Use a temporary directory to assert that `scanSource` includes Markdown, HTML, images, and ordinary attachments; excludes `.DS_Store` and hidden directories; and rejects symbolic links. Assert deterministic SHA-256, media type, kind, sorted paths, and the 20 MiB limit.

For the client, use a fake `fetchImpl` and assert exact call order:

```js
assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
  "GET /api/sync/status",
  `PUT /api/sync/objects/${newHash}`,
  "POST /api/sync/commit",
]);
assert.equal(calls[0].authorization, "Bearer test-secret");
assert.equal(computeRetryDelay(0), 2000);
assert.equal(computeRetryDelay(1), 4000);
assert.equal(computeRetryDelay(20), 300000);
```

Test that a 409 triggers a complete fresh status/diff cycle, while 401 stops with a non-retryable authentication error.

In `sync/tests/integration.test.mjs`, start an ephemeral local HTTP server implementing the three sync endpoints, point a real watcher at a temporary directory, write `README.md`, wait for the first committed manifest, change the file, wait for the second manifest, restore the original bytes, and wait for the third manifest. Assert all three SHA-256 values and close the watcher/server in `finally`.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:sync`

Expected: FAIL with missing `sync/core.mjs` and `sync/client.mjs`.

- [ ] **Step 3: Implement scanning and manifest construction**

Use `lstat` so symbolic links are never followed. Normalize every relative path through the same rules as the site. Read each regular file once, reject buffers over 20 MiB, calculate SHA-256 with `node:crypto`, and retain bytes only until upload completes. Generate revision as `${new Date().toISOString()}-${randomBytes(4).toString("hex")}`.

- [ ] **Step 4: Implement the sync client**

`syncOnce` scans first, retrieves `{ revision, hashes }`, uploads only missing hashes with raw request bodies, then commits `{ baseRevision, manifest }`. Every request uses `Authorization: Bearer ${token}`. Do not include the token in thrown error messages. Re-scan before commit; if an event changed the scan generation, abandon the candidate and rerun.

- [ ] **Step 5: Implement the watcher loop**

Use `fs.watch(sourceDir, { recursive: true })`, one-second debounce, a single in-flight sync promise, and a `dirty` flag. On failure, retry after `min(2000 * 2 ** attempt, 300000)` milliseconds. Any new filesystem event sets `dirty`, clears the longer retry timer, and schedules the one-second debounce. Handle `SIGTERM` and `SIGINT` by closing the watcher and timers without writing into the source directory.

- [ ] **Step 6: Pass sync tests**

Run: `npm run test:sync`

Expected: scanner, diff, call-order, conflict, authentication, debounce, retry, and real temporary-directory change/restore tests all PASS.

- [ ] **Step 7: Commit**

```bash
git add sync package.json package-lock.json
git commit -m "feat: add realtime local document sync watcher"
```

## Task 7: Install a secret-safe macOS LaunchAgent

**Files:**
- Create: `sync/install-launch-agent.mjs`
- Create: `sync/uninstall-launch-agent.mjs`
- Create: `sync/tests/launch-agent.test.mjs`
- Modify: `tests/configuration.test.mjs`

**Interfaces:**
- Produces: `buildLaunchAgentPlist({ label, nodeDir, runtimeDir, configPath, stdoutPath, stderrPath })`, installer accepting the token through standard input, and idempotent uninstaller
- LaunchAgent label: `com.baowenzhuo.project-radar-docs-sync`

- [ ] **Step 1: Write failing installer tests**

Assert that generated plist contains `RunAtLoad`, `KeepAlive`, `ThrottleInterval` 10, `/usr/bin/env`, `node`, the runtime watcher path, and log paths. Assert it does not contain `DOCS_SYNC_TOKEN`, the provided secret, or `/Users/baowenzhuo/project/xhxagentv3/.git`.

Assert installation plan paths are exactly:

```js
const supportDir = join(homedir(), "Library/Application Support/ProjectRadarDocsSync");
const logsDir = join(homedir(), "Library/Logs/ProjectRadarDocsSync");
const plistPath = join(homedir(), "Library/LaunchAgents/com.baowenzhuo.project-radar-docs-sync.plist");
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:sync -- --test-name-pattern='launch agent'`

Expected: FAIL because installer modules do not exist.

- [ ] **Step 3: Implement installer and uninstaller**

The installer reads one token line from standard input, creates support/log directories, copies `config.mjs`, `core.mjs`, `client.mjs`, and `watcher.mjs` into the support directory, writes `config.json` with mode `0600`, writes the plist with mode `0644`, then runs:

```text
launchctl bootout gui/{uid} {plistPath}   # ignore only “not loaded”
launchctl bootstrap gui/{uid} {plistPath}
launchctl kickstart -k gui/{uid}/com.baowenzhuo.project-radar-docs-sync
```

The JSON config contains only `sourceDir`, production `endpoint`, and `token`. The uninstaller performs `bootout`, removes the plist, and leaves source documents and remote data untouched.

- [ ] **Step 4: Pass installer and repository-boundary tests**

Run:

```bash
npm run test:sync -- --test-name-pattern='launch agent'
node --test tests/configuration.test.mjs
```

Expected: tests PASS; generated plist contains no secret; no code writes to AgentV3.

- [ ] **Step 5: Commit**

```bash
git add sync tests/configuration.test.mjs
git commit -m "feat: add macOS login-started sync service"
```

## Task 8: Finalize social metadata and validate the complete build

**Files:**
- Create: `public/og.png`
- Modify: `app/layout.tsx`, `docs/文档索引.md`

**Interfaces:**
- Consumes: stable finished visual system and Project Radar copy
- Produces: validated social card and fully passing build/test suite

- [ ] **Step 1: Generate exactly one Project Radar social card**

Use one image-generation request with this exact direction:

```text
Create a polished 1200×630 landscape social preview for “Project Radar 文档”. Use a quiet warm-white background, deep charcoal Chinese typography, and restrained muted blue-violet radar arcs. Include exactly these visible words: “Project Radar 文档” and “让项目在正确时机继续向前”. No logos, browser chrome, device frame, watermark, extra text, or tiny decorative copy. Match a mature Chinese technical-documentation website.
```

Inspect the returned image. If either exact text string is incorrect or unreadable, retry once; otherwise save it as `public/og.png`. If both attempts are unusable, omit `og:image` rather than shipping incorrect text.

- [ ] **Step 2: Wire absolute request-host social metadata**

Add Open Graph and X metadata for title `Project Radar 文档`, the approved description, and `/og.png`, using an absolute URL derived from the incoming request host. Do not restore starter metadata.

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
npm run test:unit
npm run test:sync
npm run build
node --test tests/rendered-html.test.mjs
git diff --check
git -C /Users/baowenzhuo/project/xhxagentv3 status --short
```

Expected: all tests PASS, build exits 0, no whitespace errors, and AgentV3 still contains only the pre-existing user changes.

- [ ] **Step 4: Commit the exact validated source**

```bash
git add app public docs package.json package-lock.json
git commit -m "feat: finalize Project Radar docs site"
git status --short
```

Expected: independent Sites repository is clean.

## Task 9: Publish publicly, install the watcher, and verify realtime sync

**Files:**
- Modify after site creation: `.openai/hosting.json` to add only the opaque `project_id` alongside `d1` and `r2`
- Create outside Git: `~/Library/Application Support/ProjectRadarDocsSync/config.json`
- Create outside Git: `~/Library/LaunchAgents/com.baowenzhuo.project-radar-docs-sync.plist`

**Interfaces:**
- Consumes: successful build, clean commit, Sites connector, production URL, generated secret
- Produces: public production URL, loaded LaunchAgent, and verified read-only initial synchronization

- [ ] **Step 1: Create or reuse exactly one Sites project**

Read `.openai/hosting.json`. If `project_id` exists, reuse it. Otherwise call Sites `create_site` once with title `Project Radar 文档`, description `Project Radar 的产品、需求、技术设计、实施计划与决策记录。`, and a valid unique slug beginning with `project-radar-docs`; persist the returned opaque id unchanged as `project_id`.

- [ ] **Step 2: Generate and configure the production sync secret**

Generate 32 random bytes and encode as 64 lowercase hexadecimal characters without printing it. Store it as secret `DOCS_SYNC_TOKEN` through Sites `update_environment_variables` with `is_secret: true`. Retain it only in memory until the local installer reads it from standard input.

- [ ] **Step 3: Push, package, save, and publicly deploy the validated version**

Commit the hosting metadata change, push the exact branch-head commit using the short-lived credential, package with:

```bash
/Users/baowenzhuo/.codex/plugins/cache/openai-bundled/sites/0.1.27/scripts/package-site.sh "$PWD" "$PWD/work/project-radar-docs-site.tar.gz"
```

Save one version with the pushed `commit_sha` and exact archive. Set access mode to `public`, deploy that saved version with `deploy_site_version`, and poll `get_deployment_status` until `succeeded` or `failed`. The user's earlier choice of “公开” is explicit approval for this public production deployment.

- [ ] **Step 4: Install and start the local watcher without exposing the secret**

Start `node sync/install-launch-agent.mjs --endpoint {production-url} --token-stdin` in a retained session, send the secret through standard input, and confirm the script reports only non-sensitive paths and status. Never interpolate the token into a shell command or plist.

- [ ] **Step 5: Verify initial synchronization**

Poll the authenticated status endpoint locally without printing authorization headers until the manifest contains the current source scan. Verify the public homepage, `/docs/产品概要.md`, `/docs/决策记录/采用任务边界触发.md`, and the Project Radar image return successful responses. Verify an unauthenticated `/api/sync/status` request returns 401.

- [ ] **Step 6: Verify the production source remained read-only**

Compare the public manifest's paths, sizes, and SHA-256 values with a fresh local read-only scan. Confirm the LaunchAgent log reports a successful initial synchronization. Do not modify timestamps, bytes, paths, Git index, or configuration anywhere under `/Users/baowenzhuo/project/xhxagentv3`.

- [ ] **Step 7: Verify login service and repository boundaries**

Run:

```bash
launchctl print gui/$(id -u)/com.baowenzhuo.project-radar-docs-sync
git status --short
git -C /Users/baowenzhuo/project/xhxagentv3 status --short
```

Expected: LaunchAgent state is running; the independent Sites repository is clean; AgentV3 status exactly matches its pre-task status.

- [ ] **Step 8: Open and hand off the production site**

Open the exact successful deployment URL in Codex, stop the retained development server, and report the public URL plus the watcher/log locations. Do not report secrets, internal IDs, source credentials, or temporary archive paths.

## Plan Self-Review

- Spec coverage: architecture, storage, routes, rendering, security, retries, login startup, public deployment, realtime change/revert validation, and repository isolation each map to a task.
- Placeholder scan: braces such as `{sha256}`, `{uid}`, and `{production-url}` identify runtime values with an explicit source in the same step; there are no unfinished requirements or deferred behaviors.
- Type consistency: `ContentManifest`, `ManifestFile`, `DOCS`, `DOCS_SYNC_TOKEN`, `handleSyncRoute`, `handlePublicRoute`, and all watcher function names are defined once and reused unchanged.
- Scope: the plan excludes search, comments, editor, accounts, version UI, multi-source sync, Git CI, and automatic full redeploys.
