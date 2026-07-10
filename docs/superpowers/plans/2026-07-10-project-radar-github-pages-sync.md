# Project Radar GitHub Pages Agentless Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, agentless pipeline that checks Project Radar documents every 30 minutes, pushes changed snapshots to an isolated public GitHub repository, and publishes them through GitHub Pages.

**Architecture:** A user LaunchAgent invokes a fixed Node.js entry point with absolute paths. The entry point generates a content-addressed snapshot in the independent site repository, verifies it, commits only the generated snapshot, and pushes over the already-working GitHub SSH connection. A GitHub Actions workflow builds a pure static React application and deploys `dist-pages/` to GitHub Pages.

**Tech Stack:** Node.js 22.13+, TypeScript 5.9, React 19, Vite 8, Node test runner, macOS launchd, Git, SSH, GitHub Actions, GitHub Pages

## Global Constraints

- Treat `/Users/baowenzhuo/project/xhxagentv3` as read-only input; never write, stage, commit, switch branches, or generate files there.
- Keep all source, snapshots, tests, logs, locks, commits, and configuration in `/Users/baowenzhuo/Documents/Codex/2026-07-10/sites-plugin-sites-openai-bundled-2` or the user's LaunchAgents/Application Support directories.
- Use the public repository `1firecracker/project-radar-docs` with default branch `main`.
- Run the fixed job every 1,800 seconds and once at load; do not use Codex Automation, an Agent, Sites management APIs, `/api/sync`, or the old realtime watcher.
- Do not commit credentials. Scheduled pushes must use the existing non-interactive SSH identity for `git@github.com`.
- Content identity, not check time, determines whether to commit and deploy. The site labels the manifest timestamp as `内容更新时间`.
- Preserve the current Sites deployment until the GitHub Pages production URL passes final verification.
- Follow TDD: observe each targeted test fail before adding its implementation.

---

## File Structure

### New files

- `lib/pages/routing.ts` — GitHub Pages base-path and Hash-route parsing/formatting.
- `github-pages/index.html` — static Vite HTML entry kept outside vinext's reserved `pages/` directory.
- `github-pages/main.tsx` — static React bootstrap.
- `github-pages/PagesApp.tsx` — Hash-route state and `DocsSite` integration.
- `vite.pages.config.ts` — static Pages build configuration and `/project-radar-docs/` base.
- `sync/github-pages-sync.mjs` — deterministic synchronization orchestration with lock and recovery.
- `scripts/run-github-pages-sync.mjs` — production command-line entry point.
- `sync/github-launch-agent.mjs` — plist rendering, installation, loading, and removal helpers.
- `scripts/install-github-pages-launch-agent.mjs` — installer command.
- `scripts/uninstall-github-pages-launch-agent.mjs` — uninstaller command.
- `.github/workflows/pages.yml` — test, static build, artifact upload, and Pages deployment.
- `tests/pages-routing.test.ts` — base-path and Hash-route unit tests.
- `tests/pages-ui.test.tsx` — static route/UI behavior tests.
- `tests/pages-build.test.mjs` — built artifact checks.
- `sync/tests/github-pages-sync.test.mjs` — no-change, change, recovery, isolation, and lock tests.
- `sync/tests/github-launch-agent.test.mjs` — 30-minute plist and secret-safety tests.
- `tests/github-pages-workflow.test.mjs` — workflow trigger, permissions, and artifact-path tests.

### Modified files

- `app/components/DocsSite.tsx` — accept base path and route URL formatter.
- `app/components/Navigation.tsx` — use injected route formatter and `内容更新时间` copy.
- `app/components/MarkdownDocument.tsx` — use injected route formatter and base-aware asset URLs.
- `app/components/HtmlDocument.tsx` — use a base-aware static raw URL.
- `lib/content/client.ts` — build static content URLs below a configurable base path.
- `package.json` — add static Pages build/test and scheduled sync scripts.
- `.gitignore` — ignore `dist-pages/` and scheduled job state/logs.
- `docs/superpowers/specs/2026-07-10-project-radar-github-pages-sync-design.md` — mark confirmed.
- `docs/文档索引.md` — register this plan and update statuses.

---

### Task 1: Stop the Old Agent Schedule and Establish a Read-Only Baseline

**Files:**
- Modify: `docs/superpowers/specs/2026-07-10-project-radar-github-pages-sync-design.md`
- Modify: `docs/文档索引.md`

**Interfaces:**
- Consumes: existing Codex Automation id `project-radar`
- Produces: an absent old automation and a captured AgentV3 Git-status baseline used by later verification

- [ ] **Step 1: Capture the source baseline without modifying it**

Run:

```bash
git -C /Users/baowenzhuo/project/xhxagentv3 status --porcelain=v1 > /tmp/project-radar-agentv3-before.txt
stat -f '%m %N' /Users/baowenzhuo/project/xhxagentv3/.superpowers/brainstorm/.last-port \
  /Users/baowenzhuo/project/xhxagentv3/.superpowers/brainstorm/.last-token 2>/dev/null || true
```

Expected: the status is captured; no file under AgentV3 changes. The untracked `.superpowers/` files created by the former Agent job are observed but not deleted.

- [ ] **Step 2: Delete the old recurring Agent job**

Use `codex_app__automation_update` with:

```json
{"id":"project-radar","mode":"delete"}
```

Expected: the automation is deleted and cannot run another Agent turn.

- [ ] **Step 3: Verify both former local mechanisms are absent**

Run:

```bash
launchctl print gui/$(id -u)/com.baowenzhuo.project-radar-docs-sync >/dev/null 2>&1; test $? -eq 113
test ! -e "$HOME/.codex/automations/project-radar/automation.toml"
cmp /tmp/project-radar-agentv3-before.txt <(git -C /Users/baowenzhuo/project/xhxagentv3 status --porcelain=v1)
```

Expected: the old realtime LaunchAgent and Codex Automation are absent; `cmp` exits 0.

- [ ] **Step 4: Commit the confirmed design status**

Run:

```bash
git add docs/superpowers/specs/2026-07-10-project-radar-github-pages-sync-design.md docs/文档索引.md
git commit -m "docs: confirm GitHub Pages sync design"
```

Expected: one documentation-only commit in the independent site repository.

---

### Task 2: Add Base-Path and Hash-Route Primitives

**Files:**
- Create: `lib/pages/routing.ts`
- Create: `tests/pages-routing.test.ts`
- Modify: `lib/content/client.ts`
- Modify: `tests/content-client.test.ts`

**Interfaces:**
- Produces: `normalizeBasePath(basePath: string): string`
- Produces: `withBasePath(basePath: string, pathname: string): string`
- Produces: `pagesDocumentHref(path: string): string`
- Produces: `documentPathFromHash(hash: string): string`
- Modifies: `contentObjectUrl(manifest, sha256, basePath?)` and `loadContentManifest(fetchImpl?, basePath?)`

- [ ] **Step 1: Write failing routing tests**

Add tests equivalent to:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  documentPathFromHash,
  normalizeBasePath,
  pagesDocumentHref,
  withBasePath,
} from "../lib/pages/routing";

test("normalizes the GitHub Pages base path", () => {
  assert.equal(normalizeBasePath("/project-radar-docs/"), "/project-radar-docs");
  assert.equal(withBasePath("/project-radar-docs/", "/content/manifest.json"),
    "/project-radar-docs/content/manifest.json");
});

test("formats and parses static document hashes", () => {
  assert.equal(pagesDocumentHref("README.md"), "#/");
  assert.equal(pagesDocumentHref("决策记录/采用任务边界触发.md"),
    "#/docs/%E5%86%B3%E7%AD%96%E8%AE%B0%E5%BD%95/%E9%87%87%E7%94%A8%E4%BB%BB%E5%8A%A1%E8%BE%B9%E7%95%8C%E8%A7%A6%E5%8F%91.md");
  assert.equal(documentPathFromHash("#/docs/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md"), "产品概要.md");
  assert.equal(documentPathFromHash("#/"), "README.md");
});
```

Extend `tests/content-client.test.ts` so a static object and manifest under `/project-radar-docs/` resolve below that base.

- [ ] **Step 2: Run the focused tests and observe failure**

Run:

```bash
node --import tsx --test tests/pages-routing.test.ts tests/content-client.test.ts
```

Expected: FAIL because `lib/pages/routing.ts` and base-path parameters do not exist.

- [ ] **Step 3: Implement minimal routing and URL helpers**

Create `lib/pages/routing.ts` with:

```ts
import { validateContentPath } from "../content/paths";

export function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function withBasePath(basePath: string, pathname: string): string {
  const base = normalizeBasePath(basePath);
  return `${base}/${pathname.replace(/^\/+/, "")}`;
}

export function pagesDocumentHref(path: string): string {
  const safe = validateContentPath(path);
  if (safe === "README.md") return "#/";
  return `#/docs/${safe.split("/").map(encodeURIComponent).join("/")}`;
}

export function documentPathFromHash(hash: string): string {
  const route = hash.replace(/^#/, "") || "/";
  if (route === "/") return "README.md";
  if (!route.startsWith("/docs/")) return "README.md";
  return validateContentPath(
    route.slice("/docs/".length).split("/").map(decodeURIComponent).join("/"),
  );
}
```

Update `lib/content/client.ts` so `contentObjectUrl(manifest, sha256, basePath = "")` calls `withBasePath(basePath, `/content/objects/${encodeURIComponent(sha256)}`)` for snapshots, and `loadContentManifest(fetchImpl = fetch, basePath = "")` fetches `withBasePath(basePath, "/content/manifest.json")` for its static fallback. Dynamic Sites URLs retain their existing root behavior when `basePath` is empty.

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
node --import tsx --test tests/pages-routing.test.ts tests/content-client.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pages/routing.ts lib/content/client.ts tests/pages-routing.test.ts tests/content-client.test.ts
git commit -m "feat: add GitHub Pages route helpers"
```

---

### Task 3: Build the Pure Static GitHub Pages Application

**Files:**
- Create: `github-pages/index.html`
- Create: `github-pages/main.tsx`
- Create: `github-pages/PagesApp.tsx`
- Create: `vite.pages.config.ts`
- Create: `tests/pages-ui.test.tsx`
- Create: `tests/pages-build.test.mjs`
- Modify: `app/components/DocsSite.tsx`
- Modify: `app/components/Navigation.tsx`
- Modify: `app/components/MarkdownDocument.tsx`
- Modify: `app/components/HtmlDocument.tsx`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 2 routing helpers
- Produces: `PagesApp` and `npm run build:pages`, with artifact root `dist-pages/`
- Extends: `DocsSiteProps` with `basePath?: string` and `documentHrefFor?: (path: string) => string`

- [ ] **Step 1: Write failing static UI tests**

Add focused tests that render `DocsSite` with `basePath="/project-radar-docs/"` and `documentHrefFor={pagesDocumentHref}`, then assert:

```tsx
assert.match(html, /href="#\/docs\//);
assert.match(html, /内容更新时间/);
assert.doesNotMatch(html, /最近同步/);
```

Add a test for an HTML file that asserts its iframe URL begins with `/project-radar-docs/content/raw/`.

- [ ] **Step 2: Run the focused UI tests and observe failure**

Run:

```bash
node --import tsx --test tests/pages-ui.test.tsx tests/docs-ui.test.tsx
```

Expected: FAIL because the components do not accept the static routing/base-path props and still render `最近同步`.

- [ ] **Step 3: Inject route and base-path behavior into reusable components**

Use this prop shape in `DocsSite.tsx`:

```ts
interface DocsSiteProps {
  initialPath: string;
  basePath?: string;
  documentHrefFor?: (path: string) => string;
}
```

Default `documentHrefFor` to the existing `documentHref`, so the current Sites build remains functional. Pass the formatter and base path to `Navigation`, `MarkdownDocument`, and `HtmlDocument`. Change only the label to `内容更新时间`; preserve the timestamp value from `manifest.generatedAt`.

- [ ] **Step 4: Create the static application entry**

Create `github-pages/PagesApp.tsx` with Hash-route state:

```tsx
import { useEffect, useState } from "react";
import { DocsSite } from "../app/components/DocsSite";
import { documentPathFromHash, pagesDocumentHref } from "../lib/pages/routing";

export function PagesApp() {
  const [path, setPath] = useState(() => documentPathFromHash(window.location.hash));
  useEffect(() => {
    const update = () => setPath(documentPathFromHash(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <DocsSite
      key={path}
      initialPath={path}
      basePath={import.meta.env.BASE_URL}
      documentHrefFor={pagesDocumentHref}
    />
  );
}
```

`github-pages/main.tsx` must import React, `createRoot`, `PagesApp`, and `../app/globals.css`, then render into `#root`. `github-pages/index.html` must contain the Chinese metadata, `og.png`, `#root`, and a module script for `/main.tsx`.

- [ ] **Step 5: Add the static Vite configuration and scripts**

Create `vite.pages.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages",
  base: "/project-radar-docs/",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
```

Add scripts:

```json
{
  "build:pages": "vite build --config vite.pages.config.ts",
  "test:pages": "node --import tsx --test tests/pages-routing.test.ts tests/pages-ui.test.tsx && npm run build:pages && node --test tests/pages-build.test.mjs"
}
```

Ignore `/dist-pages/` and `/work/github-pages-sync/`.

- [ ] **Step 6: Verify static build and artifact contents**

`tests/pages-build.test.mjs` must assert that `dist-pages/index.html`, `dist-pages/content/manifest.json`, `dist-pages/content/raw/README.md`, and at least one hashed JavaScript asset exist, and that `index.html` uses `/project-radar-docs/` asset URLs.

Run:

```bash
npm run test:pages
```

Expected: PASS and `dist-pages/` contains a static entry plus the full snapshot.

- [ ] **Step 7: Commit**

```bash
git add pages vite.pages.config.ts app/components lib/content package.json package-lock.json .gitignore tests/pages-ui.test.tsx tests/pages-build.test.mjs
git commit -m "feat: add static GitHub Pages build"
```

---

### Task 4: Implement the Deterministic Sync Runner

**Files:**
- Create: `sync/github-pages-sync.mjs`
- Create: `scripts/run-github-pages-sync.mjs`
- Create: `sync/tests/github-pages-sync.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `runGitHubPagesSync(options): Promise<{status: "unchanged" | "pushed" | "recovered-push"; revision: string}>`
- Produces: `withDirectoryLock(lockDir, callback, options?): Promise<T>`
- Consumes: `generateStaticSnapshot({sourceDir, outputDir})`
- Test seams: optional `options.execute` command runner and `options.generateSnapshot` snapshot function; production defaults use real commands and `generateStaticSnapshot`

- [ ] **Step 1: Write failing orchestration tests**

Use temporary source and site Git repositories with an injectable command runner. Implement a `createSyncFixture(t)` helper in the test file that creates both repositories, records every executed command, exposes `writeSource(path, value)`, `siteCommitCount()`, `lastCommitFiles()`, and `commitSnapshotWithoutPush()`, and registers cleanup with `t.after`. Cover these exact assertions:

```js
test("unchanged content does not commit or push", async (t) => {
  const fixture = await createSyncFixture(t);
  const before = await fixture.siteCommitCount();
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "unchanged");
  assert.equal(await fixture.siteCommitCount(), before);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), false);
});

test("changed content verifies, commits only public/content, and pushes", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.writeSource("README.md", "# changed\n");
  const expectedHash = createHash("sha256").update("# changed\n").digest("hex");
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "pushed");
  assert.deepEqual(await fixture.lastCommitFiles(), [
    "public/content/manifest.json",
    `public/content/objects/${expectedHash}`,
    "public/content/raw/README.md",
  ]);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), true);
});

test("an already verified local commit is pushed after a previous network failure", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.commitSnapshotWithoutPush();
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "recovered-push");
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "commit"), false);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), true);
});

test("source git status changes abort the site commit", async (t) => {
  const fixture = await createSyncFixture(t);
  fixture.options.generateSnapshot = async (input) => {
    const result = await generateStaticSnapshot(input);
    await fixture.writeSource("README.md", "# changed during scan\n");
    return result;
  };
  await assert.rejects(
    runGitHubPagesSync(fixture.options),
    /AgentV3 changed during synchronization/,
  );
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "commit"), false);
});

test("a held lock prevents an overlapping run", async (t) => {
  const fixture = await createSyncFixture(t);
  await mkdir(fixture.options.lockDir, { recursive: true });
  await assert.rejects(runGitHubPagesSync(fixture.options), /already running/);
});
```

Assertions must inspect Git history and the source worktree, not only mocked calls.

- [ ] **Step 2: Run tests and observe failure**

Run:

```bash
node --test sync/tests/github-pages-sync.test.mjs
```

Expected: FAIL because the sync module does not exist.

- [ ] **Step 3: Implement lock and command boundaries**

`sync/github-pages-sync.mjs` must use `mkdir(lockDir)` as the atomic lock, write diagnostic state only below the lock directory, remove it in `finally`, and reject overlap without deleting a live lock. Export a `runCommand(command, args, {cwd})` implementation based on `spawn` with captured stdout/stderr and a nonzero-exit error.

The orchestration must follow this state machine:

```js
const sourceBefore = await gitStatus(sourceDir);
const snapshot = await generateStaticSnapshot({ sourceDir, outputDir });
const sourceAfter = await gitStatus(sourceDir);
if (sourceBefore !== sourceAfter) throw new Error("AgentV3 changed during synchronization");

if (snapshot.changed) {
  await verifySite();
  await gitAddGeneratedSnapshotOnly();
  await assertStagedPathsStartWith("public/content/");
  await gitCommit("docs: refresh Project Radar snapshot");
}

const ahead = await commitsAheadOfOriginMain();
if (ahead > 0) await gitPushOriginMain();
return snapshot.changed
  ? { status: "pushed", revision: snapshot.manifest.revision }
  : ahead > 0
    ? { status: "recovered-push", revision: snapshot.manifest.revision }
    : { status: "unchanged", revision: snapshot.manifest.revision };
```

`verifySite()` must execute, in order:

```text
npm run test:unit
npm run test:sync
npm run test:pages
git diff --check
```

- [ ] **Step 4: Add the fixed production entry point**

`scripts/run-github-pages-sync.mjs` must resolve these defaults and allow test-only environment overrides:

```js
const sourceDir = process.env.PROJECT_RADAR_SOURCE_DIR
  ?? "/Users/baowenzhuo/project/xhxagentv3/docs/bwz";
const siteDir = process.env.PROJECT_RADAR_SITE_DIR
  ?? "/Users/baowenzhuo/Documents/Codex/2026-07-10/sites-plugin-sites-openai-bundled-2";
```

It must write one JSON result line to stdout, one safe error line to stderr, never print document content or credentials, and set a nonzero exit code on failure.

Add:

```json
{
  "sync:github-pages": "node scripts/run-github-pages-sync.mjs"
}
```

- [ ] **Step 5: Run focused and regression tests**

Run:

```bash
node --test sync/tests/github-pages-sync.test.mjs
npm run test:unit
npm run test:sync
npm run test:pages
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add sync/github-pages-sync.mjs scripts/run-github-pages-sync.mjs sync/tests/github-pages-sync.test.mjs package.json package-lock.json
git commit -m "feat: add deterministic document sync runner"
```

---

### Task 5: Install the Fixed 30-Minute LaunchAgent

**Files:**
- Create: `sync/github-launch-agent.mjs`
- Create: `scripts/install-github-pages-launch-agent.mjs`
- Create: `scripts/uninstall-github-pages-launch-agent.mjs`
- Create: `sync/tests/github-launch-agent.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `renderGitHubPagesLaunchAgent({nodePath, scriptPath, workingDirectory, stdoutPath, stderrPath}): string`
- Produces: installer/uninstaller for label `com.baowenzhuo.project-radar-github-pages-sync`

- [ ] **Step 1: Write failing plist tests**

Assert the rendered plist contains:

```xml
<key>Label</key><string>com.baowenzhuo.project-radar-github-pages-sync</string>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>1800</integer>
```

Also assert it contains absolute `node`, script, working-directory, stdout, and stderr paths; contains no `KeepAlive`, token, source content, or Agent/Codex command.

- [ ] **Step 2: Run the focused test and observe failure**

Run:

```bash
node --test sync/tests/github-launch-agent.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement plist rendering and lifecycle commands**

Escape XML values and render a user LaunchAgent that invokes only:

```text
<absolute node path> <absolute site path>/scripts/run-github-pages-sync.mjs
```

The installer must create the independent log directory, write the plist atomically to `~/Library/LaunchAgents/com.baowenzhuo.project-radar-github-pages-sync.plist`, then call `launchctl bootstrap gui/<uid> <plist>` and `launchctl kickstart -k gui/<uid>/<label>`. The uninstaller must boot out the label and remove only that plist.

- [ ] **Step 4: Add package scripts and verify tests**

Add:

```json
{
  "sync:install": "node scripts/install-github-pages-launch-agent.mjs",
  "sync:uninstall": "node scripts/uninstall-github-pages-launch-agent.mjs"
}
```

Run:

```bash
node --test sync/tests/github-launch-agent.test.mjs
npm run test:sync
```

Expected: all tests PASS; no LaunchAgent is installed by the unit tests.

- [ ] **Step 5: Commit**

```bash
git add sync/github-launch-agent.mjs scripts/install-github-pages-launch-agent.mjs scripts/uninstall-github-pages-launch-agent.mjs sync/tests/github-launch-agent.test.mjs package.json package-lock.json
git commit -m "feat: add fixed GitHub Pages schedule"
```

---

### Task 6: Add the GitHub Pages Deployment Workflow

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `tests/github-pages-workflow.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `npm run test:pages` and artifact `dist-pages/`
- Produces: GitHub Pages deployment on `main` pushes and manual dispatch

- [ ] **Step 1: Write a failing workflow contract test**

Parse the workflow as text and assert it includes:

```text
push: main
workflow_dispatch
contents: read
pages: write
id-token: write
actions/configure-pages@v5
actions/upload-pages-artifact@v4
actions/deploy-pages@v4
path: ./dist-pages
environment: github-pages
```

Also assert the deploy job needs the build job and exposes `steps.deployment.outputs.page_url`.

- [ ] **Step 2: Run the contract test and observe failure**

Run:

```bash
node --test tests/github-pages-workflow.test.mjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Add the official Pages workflow**

Create `.github/workflows/pages.yml` with this job structure:

```yaml
name: Deploy GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22.13.0
          cache: npm
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:sync
      - run: npm run test:pages
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: ./dist-pages
  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run the workflow test and full local verification**

Run:

```bash
node --test tests/github-pages-workflow.test.mjs
npm test
npm run test:pages
git diff --check
```

Expected: all tests and both builds PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml tests/github-pages-workflow.test.mjs package.json package-lock.json
git commit -m "ci: deploy static docs to GitHub Pages"
```

---

### Task 7: Create and Publish the Independent Public Repository

**Files:**
- No new local source files
- External: `https://github.com/1firecracker/project-radar-docs`

**Interfaces:**
- Consumes: current validated independent site repository and working SSH identity
- Produces: public `origin/main` and an enabled GitHub Pages Actions source

- [ ] **Step 1: Verify the repository name is available and request action-time confirmation**

Use the GitHub connector to search for `1firecracker/project-radar-docs`. Expected: no existing repository with that exact name. Immediately before creation, confirm creation of one public GitHub repository with the user.

- [ ] **Step 2: Create an empty public repository**

Using the signed-in GitHub website, create `1firecracker/project-radar-docs` as public with no generated README, `.gitignore`, or license.

Expected: the empty repository page displays the SSH URL `git@github.com:1firecracker/project-radar-docs.git`.

- [ ] **Step 3: Prepare and push the validated local history**

Run:

```bash
git branch -M main
git remote add origin git@github.com:1firecracker/project-radar-docs.git
git push -u origin main
```

Expected: SSH push succeeds; `git status --branch --short` shows `main...origin/main` with no divergence.

- [ ] **Step 4: Enable GitHub Actions as the Pages source**

In repository Settings → Pages, set Build and deployment Source to `GitHub Actions`.

Expected: the Pages settings page shows GitHub Actions as the source. Per GitHub's official Pages workflow contract, the workflow uses `configure-pages@v5`, `upload-pages-artifact@v4`, and `deploy-pages@v4` with `pages: write` and `id-token: write` permissions.

- [ ] **Step 5: Verify the first workflow and deployment**

Inspect the workflow for the pushed `main` commit. Expected: build and deploy jobs succeed, and the deployment URL is:

```text
https://1firecracker.github.io/project-radar-docs/
```

---

### Task 8: Install the Schedule and Perform End-to-End Migration Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/文档索引.md`

**Interfaces:**
- Consumes: published `origin/main`, fixed sync runner, installer, and Pages production URL
- Produces: active agentless schedule and verified production migration

- [ ] **Step 1: Run one manual no-change synchronization**

Run:

```bash
npm run sync:github-pages
```

Expected: one JSON line with `status:"unchanged"`; no commit is created and AgentV3 status matches `/tmp/project-radar-agentv3-before.txt`.

- [ ] **Step 2: Install and kickstart the fixed LaunchAgent**

Run:

```bash
npm run sync:install
launchctl print gui/$(id -u)/com.baowenzhuo.project-radar-github-pages-sync
```

Expected: the job is loaded, its interval is 1,800 seconds, its program is Node.js plus `scripts/run-github-pages-sync.mjs`, and its last exit status is 0 after kickstart.

- [ ] **Step 3: Verify source isolation after the scheduled entry point runs**

Run:

```bash
cmp /tmp/project-radar-agentv3-before.txt <(git -C /Users/baowenzhuo/project/xhxagentv3 status --porcelain=v1)
git status --short
```

Expected: `cmp` exits 0 and the independent site repository is clean.

- [ ] **Step 4: Verify the production site in a browser**

Open `https://1firecracker.github.io/project-radar-docs/` and verify:

```text
首页标题：Project Radar 文档总览
导航：核心文档、决策记录
时间标签：内容更新时间
深层路由：#/docs/<encoded-path>
图片：两张当前快照图片可见
```

Also open the URL from the computer that could access the old site. Expected: both computers can load the GitHub Pages site.

- [ ] **Step 5: Update handoff documentation**

Document the new production URL, `npm run sync:github-pages`, `npm run sync:install`, `npm run sync:uninstall`, LaunchAgent label, log location, SSH prerequisite, and the fact that the old Sites URL is retained only as rollback.

- [ ] **Step 6: Run final verification**

Run:

```bash
npm run snapshot:docs
npm run test:unit
npm run test:sync
npm run test:pages
npm run build
node --test tests/rendered-html.test.mjs tests/github-pages-workflow.test.mjs
git diff --check
git status --short
cmp /tmp/project-radar-agentv3-before.txt <(git -C /Users/baowenzhuo/project/xhxagentv3 status --porcelain=v1)
```

Expected: snapshot reports `changed:false`; all tests and builds pass; both Git comparisons are clean.

- [ ] **Step 7: Commit the operational handoff**

```bash
git add README.md docs/文档索引.md
git commit -m "docs: document GitHub Pages synchronization"
git push origin main
```

Expected: the final workflow succeeds and the production URL remains available.

---

## Execution Notes

- GitHub's current official Pages documentation uses `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`; re-check official action releases if implementation occurs much later than this plan.
- Repository creation and changing Pages settings are external side effects. Obtain action-time confirmation before each mutation when browser safety rules require it.
- Do not delete the previously generated AgentV3 `.superpowers/` directory automatically. It predates this implementation and sits in the read-only source repository; report it separately for user-directed cleanup.
- If a test requires writing sample documents, use a temporary directory and pass `PROJECT_RADAR_SOURCE_DIR`; never write fixtures into the real source directory.
