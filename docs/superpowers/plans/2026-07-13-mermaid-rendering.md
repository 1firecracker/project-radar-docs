# Mermaid Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render standard fenced `mermaid` code blocks as secure client-side SVG diagrams in the Project Radar Markdown viewer.

**Architecture:** `MarkdownDocument` recognizes block-level `code.language-mermaid` nodes and replaces their surrounding `pre` element with a focused client component. `MermaidBlock` dynamically loads the local Mermaid package, renders with strict security settings, and falls back to the original source on failure. The existing local snapshot pipeline and GitHub Pages workflow remain unchanged.

**Tech Stack:** React 19, React Markdown 10, Mermaid 11, TypeScript 5.9, Node test runner, Vite 8, GitHub Pages

## Global Constraints

- Only standard fenced Markdown blocks with the `mermaid` language tag are supported.
- Do not render raw `<div class="mermaid">` markup.
- Use the local npm dependency; do not call an external Mermaid rendering service.
- Initialize Mermaid with `startOnLoad: false` and `securityLevel: "strict"`.
- On syntax or runtime failure, show an error message and the original Mermaid source without breaking the document.
- Preserve ordinary code blocks, `rehype-sanitize`, standalone HTML sandboxing, and base-path routing.
- Treat `/Users/baowenzhuo/project/xhxagentv3` as read-only.
- Preserve the pending generated `public/content` snapshot and commit it only through the existing snapshot workflow.

---

## File Structure

- Create `app/components/MermaidBlock.tsx`: client-only Mermaid loader, renderer adapter, loading state, SVG display, and failure fallback.
- Modify `app/components/MarkdownDocument.tsx`: recognize block-level `language-mermaid` nodes and delegate them to `MermaidBlock`.
- Modify `app/globals.css`: diagram container, responsive SVG, loading, and error fallback styles.
- Modify `tests/docs-ui.test.tsx`: server-render recognition and ordinary-code regression coverage.
- Create `tests/mermaid-block.test.ts`: renderer adapter configuration and failure propagation tests without a browser DOM.
- Modify `tests/configuration.test.mjs`: require Mermaid as a production dependency.
- Modify `package.json` and `package-lock.json`: pin the installed Mermaid dependency.

### Task 1: Mermaid renderer boundary

**Files:**
- Create: `app/components/MermaidBlock.tsx`
- Create: `tests/mermaid-block.test.ts`
- Modify: `tests/configuration.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Mermaid module exposing `initialize(config)` and `render(id, source)`.
- Produces: `renderMermaidSvg(source: string, id: string, loadMermaid?: MermaidLoader): Promise<string>` and `MermaidBlock({ source }: { source: string }): JSX.Element`.

- [ ] **Step 1: Write the failing dependency and renderer tests**

Add a configuration assertion:

```js
assert.equal(typeof pkg.dependencies.mermaid, "string");
```

Add `tests/mermaid-block.test.ts` with a fake loader that records configuration and returns `<svg data-test="diagram"></svg>`. Assert that `renderMermaidSvg("flowchart LR\nA-->B", "diagram-1", loader)` returns the SVG and initializes with:

```ts
{
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
}
```

Add a second test whose fake `render` rejects with `new Error("bad syntax")` and assert that `renderMermaidSvg` rejects with that error.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --import tsx --test tests/mermaid-block.test.ts tests/configuration.test.mjs
```

Expected: FAIL because `MermaidBlock.tsx` and the Mermaid dependency do not exist.

- [ ] **Step 3: Install Mermaid and implement the renderer adapter**

Install the current Mermaid 11 release as an exact production dependency. Implement a dynamic default loader and the adapter:

```ts
type MermaidApi = {
  initialize(config: {
    startOnLoad: boolean;
    securityLevel: "strict";
    theme: "neutral";
  }): void;
  render(id: string, source: string): Promise<{ svg: string }>;
};

export type MermaidLoader = () => Promise<{ default: MermaidApi }>;

export async function renderMermaidSvg(
  source: string,
  id: string,
  loadMermaid: MermaidLoader = () => import("mermaid"),
): Promise<string> {
  const { default: mermaid } = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
  });
  return (await mermaid.render(id, source)).svg;
}
```

Implement `MermaidBlock` as a `"use client"` component. Generate a DOM-safe id from `useId`, render a loading label initially, call `renderMermaidSvg` in `useEffect`, ignore stale results after cleanup, show the SVG through `dangerouslySetInnerHTML` on success, and show “Mermaid 渲染失败” plus `<pre><code>{source}</code></pre>` on failure.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the focused command from Step 2. Expected: all tests pass.

- [ ] **Step 5: Commit the renderer boundary**

Commit only the dependency, component, and focused tests with message:

```text
feat: add secure Mermaid renderer
```

### Task 2: Markdown integration and presentation

**Files:**
- Modify: `app/components/MarkdownDocument.tsx`
- Modify: `app/globals.css`
- Modify: `tests/docs-ui.test.tsx`

**Interfaces:**
- Consumes: `MermaidBlock({ source })` from Task 1.
- Produces: standard fenced `mermaid` blocks render with `.mermaid-block`; all other fenced code stays inside `<pre><code>`.

- [ ] **Step 1: Write the failing Markdown behavior test**

Render this source through `MarkdownDocument`:

````markdown
```mermaid
flowchart LR
  A --> B
```

```js
console.log("ordinary")
```
````

Assert the static HTML contains `class="mermaid-block"`, contains the Mermaid source as its accessible loading fallback, and still contains `<pre><code class="language-js">` for the JavaScript block.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --import tsx --test tests/docs-ui.test.tsx
```

Expected: FAIL because the Mermaid code is still emitted as an ordinary code block.

- [ ] **Step 3: Integrate Mermaid at the block-level `pre` boundary**

Add a `pre` renderer to `MarkdownDocument`. When its only child is a valid React element with a class token equal to `language-mermaid`, normalize the child text by removing one trailing newline and render `<MermaidBlock source={source} />`. Otherwise return the original `<pre>` element and props unchanged. This keeps inline code and ordinary fenced code out of the Mermaid path.

Add CSS that:

- gives `.mermaid-block` a bordered paper background and responsive horizontal overflow;
- sets `.mermaid-block svg { display: block; max-width: 100%; height: auto; margin-inline: auto; }`;
- styles loading and error labels without animation;
- keeps the failure `<pre>` visually consistent with ordinary code.

- [ ] **Step 4: Run Markdown tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/docs-ui.test.tsx tests/pages-ui.test.tsx tests/mermaid-block.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Markdown integration**

Commit the integration, styles, and test with message:

```text
feat: render Mermaid code blocks in Markdown
```

### Task 3: Recovery, verification, and publication

**Files:**
- Preserve and publish: `public/content/**`
- No changes permitted under: `/Users/baowenzhuo/project/xhxagentv3`

**Interfaces:**
- Consumes: existing `npm run sync:github-pages`, `npm run sync:install`, and GitHub Pages workflow.
- Produces: clean `main`, restored 600-second LaunchAgent, successful Pages deployment, and a production SVG smoke test.

- [ ] **Step 1: Pause the LaunchAgent and publish the feature commits**

Run `npm run sync:uninstall` before changing index state. Preserve the generated `public/content` working tree and push the already-committed Mermaid feature commits to `origin/main`. This order is required because the snapshot runner intentionally refuses to push when non-snapshot commits are ahead of `origin/main`.

- [ ] **Step 2: Recover the pending snapshot through the existing runner**

After `origin/main` contains the feature commits, unstage only `public/content` and run `npm run sync:github-pages`. The existing runner must regenerate from the read-only source, verify, commit only `public/content`, and push the snapshot. Do not manually edit generated files.

- [ ] **Step 3: Run full local verification**

Run:

```bash
npm test
npm run test:pages
npm run build:pages
git diff --check
```

Expected: all tests and both site builds pass, with no whitespace errors outside generated snapshots.

- [ ] **Step 4: Verify GitHub Pages**

Confirm the GitHub Actions Pages workflow for the snapshot commit succeeds and `https://1firecracker.github.io/project-radar-docs/` returns HTTP 200. Open a source document containing a standard Mermaid block and verify the page contains a rendered `<svg>` inside `.mermaid-block`.

- [ ] **Step 5: Restore the ten-minute scheduler**

Run `npm run sync:install` and verify:

```text
label: com.baowenzhuo.project-radar-github-pages-sync
run interval: 600 seconds
last exit code: 0
```

Confirm the independent site repository is clean and the source repository has no new site-generated files or Git changes.

- [ ] **Step 6: Record final state**

Update `docs/文档索引.md` only if paths or status changed, then commit documentation with message `docs: record Mermaid support` when necessary.
