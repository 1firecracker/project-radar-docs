# Mermaid Fullscreen Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable “全屏 / 退出全屏” controls to successfully rendered Mermaid diagrams without using the browser Fullscreen API.

**Architecture:** `MermaidBlock` owns fullscreen state, keyboard handling, and scroll locking, and renders the complete `.mermaid-block` container. `MarkdownDocument` delegates Mermaid fences directly to that component. CSS uses a fixed viewport overlay and a separately scrollable canvas.

**Tech Stack:** React 19, TypeScript 5.9, jsdom 26, Node test runner, Mermaid 11, Vite 8, GitHub Pages

## Global Constraints

- Provide only “全屏” and “退出全屏”; do not add collapse behavior.
- Use a page-level fixed overlay, not the browser Fullscreen API.
- Only show the control after a diagram renders successfully.
- Clicking “退出全屏” or pressing `Escape` exits fullscreen.
- Lock background body scrolling only while fullscreen and restore the exact previous inline overflow value on exit or unmount.
- Keep the diagram canvas scrollable in both normal and fullscreen states.
- Preserve Mermaid strict security, failure source fallback, ordinary code blocks, HTML sandboxing, and read-only source isolation.
- Keep the scheduled synchronization interval at 600 seconds.

---

## File Structure

- Modify `app/components/MermaidBlock.tsx`: container ownership, fullscreen state, controls, Escape listener, and scroll restoration.
- Modify `app/components/MarkdownDocument.tsx`: remove the outer Mermaid wrapper and delegate directly.
- Modify `app/globals.css`: toolbar, control button, scrollable canvas, and fixed overlay styles.
- Modify `tests/mermaid-block.test.ts`: real DOM interaction, Escape, cleanup, loading, and error tests.
- Modify `tests/docs-ui.test.tsx`: server-rendered wrapper regression.
- Modify `tests/configuration.test.mjs`: fullscreen CSS selector contract.

### Task 1: Fullscreen component behavior

**Files:**
- Modify: `app/components/MermaidBlock.tsx`
- Modify: `app/components/MarkdownDocument.tsx`
- Modify: `tests/mermaid-block.test.ts`
- Modify: `tests/docs-ui.test.tsx`

**Interfaces:**
- Consumes: existing `MermaidBlock({ source, loadMermaid? })` and `MermaidLoader`.
- Produces: `MermaidBlock` root `.mermaid-block`, `.is-fullscreen` state class, `.mermaid-toolbar`, `.mermaid-canvas`, and a button whose visible text is exactly `全屏` or `退出全屏`.

- [x] **Step 1: Write failing component tests**

Use the existing jsdom mount setup and a resolving loader returning `<svg data-test="diagram"></svg>`. Assert:

```ts
const button = container.querySelector("button");
assert.equal(button?.textContent, "全屏");
assert.equal(container.querySelector(".mermaid-block")?.classList.contains("is-fullscreen"), false);
```

Click the button inside `act`, then assert the text is `退出全屏`, `.is-fullscreen` is present, `aria-pressed="true"`, and `document.body.style.overflow === "hidden"`. Click again and assert the previous body overflow value is restored.

Add a separate test that enters fullscreen, dispatches `new KeyboardEvent("keydown", { key: "Escape" })`, and asserts fullscreen exits and overflow is restored. Unmount while fullscreen and assert overflow is restored. Extend loading and rejection assertions so neither state contains a button.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --import tsx --test tests/mermaid-block.test.ts tests/docs-ui.test.tsx
```

Expected: FAIL because the current component has no fullscreen button or overlay state.

- [x] **Step 3: Implement minimal fullscreen behavior**

Move the `.mermaid-block` root and accessibility label into `MermaidBlock`. Add `isFullscreen` state. On successful render output:

```tsx
<div className={`mermaid-block${isFullscreen ? " is-fullscreen" : ""}`} role="group" aria-label={source}>
  <div className="mermaid-toolbar">
    <button type="button" aria-pressed={isFullscreen} onClick={() => setIsFullscreen((value) => !value)}>
      {isFullscreen ? "退出全屏" : "全屏"}
    </button>
  </div>
  <div className="mermaid-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
</div>
```

Keep loading and failure inside the same `.mermaid-block` root without a toolbar. Add an effect that, only while fullscreen, stores `document.body.style.overflow`, sets it to `hidden`, listens for `keydown`, exits on `Escape`, and restores overflow/removes the listener in cleanup. `MarkdownDocument` must return `<MermaidBlock source={source} />` without an extra wrapper.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the focused command from Step 2. Expected: all tests pass without React act warnings.

- [x] **Step 5: Commit component behavior**

Commit only these files with message:

```text
feat: add Mermaid fullscreen controls
```

### Task 2: Fullscreen presentation and publication

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/configuration.test.mjs`
- Preserve: `public/content/**`

**Interfaces:**
- Consumes: Task 1 class names.
- Produces: responsive toolbar and fixed fullscreen overlay with scrollable canvas.

- [x] **Step 1: Add a failing style contract test**

Extend `tests/configuration.test.mjs` to read `app/globals.css` and assert rules exist for `.mermaid-toolbar`, `.mermaid-canvas`, `.mermaid-block.is-fullscreen`, and `.mermaid-block.is-fullscreen .mermaid-canvas`. Run `node --test tests/configuration.test.mjs` and observe RED before editing CSS.

- [x] **Step 2: Implement the styles**

Change the container to `position: relative; overflow: hidden`. Add a top-right toolbar, a keyboard-focusable neutral button, and `.mermaid-canvas { overflow: auto; }`. For `.mermaid-block.is-fullscreen`, use `position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; border-radius: 0;` with a paper background. Make its canvas `flex: 1; min-height: 0;` and keep the SVG centered without forcing a fixed width.

- [x] **Step 3: Run focused and full verification**

Run:

```bash
npm test
npm run test:pages
npm run build:pages
git diff --check
```

Expected: all tests and builds pass.

- [x] **Step 4: Commit styles**

Commit the style/test changes with message:

```text
style: present Mermaid fullscreen overlay
```

- [x] **Step 5: Publish and verify production**

Pause the LaunchAgent before pushing non-snapshot commits. Push `main`, wait for the Pages workflow, and verify the production Mermaid page shows `全屏`; clicking it changes to `退出全屏`, adds the fullscreen overlay, and `Escape` returns to the normal state. Confirm three Mermaid SVGs remain rendered with zero failures.

- [x] **Step 6: Restore the scheduler and record state**

Run `npm run sync:install`, then verify `run interval = 600 seconds` and `last exit code = 0`. Confirm the independent site repository is clean, `main == origin/main`, and `/Users/baowenzhuo/project/xhxagentv3` has no new changes.
