# Project Radar Architecture HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone HTML/SVG presentation of the approved Project Radar V0 architecture with deterministic arrows and readable Chinese labels.

**Architecture:** The artifact is self-contained and does not connect to the existing React app or backend. Inline SVG owns the diagram geometry, while CSS provides the three-layer visual system, user-visible/server-hidden lanes, responsive scaling, and a print-friendly surface.

**Tech Stack:** Plain HTML, CSS, inline SVG; no external dependencies.

## Global Constraints

- The diagram must use the current `Project → Tracked Item → Activity Event` model.
- `Re-entry` only queries existing Radar and must not run Organizer or Analyzer.
- `Context Bundle` is server-hidden and is rebuilt after user acceptance.
- `context_snapshot` belongs to the persisted Radar Item.
- Agent output returns through a new Activity Event and Post-run Organizer.
- The artifact must remain independent from `frontend/src` and the running chat application.

---

### Task 1: Create the standalone architecture diagram

**Files:**
- Create: `docs/bwz/project-radar-architecture.html`

**Interfaces:**
- Opens directly in a browser without a server.
- Uses SVG marker IDs for solid, dashed, and feedback arrows.
- Includes a small toolbar for fit-to-window and print behavior, without changing diagram semantics.

- [ ] **Step 1: Add the document shell and semantic layer containers**

Create a single HTML file with a title, three labeled layer containers, and explicit user-visible/server-hidden lane labels.

- [ ] **Step 2: Add the deterministic SVG nodes and connectors**

Implement the exact flows:

```text
Post-run → Activity Event → Post-run Organizer → State Store
State Store → Proactive Analyzer → Policy Gate → Radar Item
Re-entry → Radar 查询
Radar Item → Radar 查询 → Action Bar → 用户接受
用户接受 → 校验 → Context Bundle（隐藏）→ AgentV3
AgentV3 → 新 Activity Event → Post-run Organizer
```

- [ ] **Step 3: Add explanatory labels and visual distinction**

Keep Memory/Todo as an Organizer input, render Context Bundle with a dashed subdued style, and show the State Store hierarchy inside the database node.

- [ ] **Step 4: Add responsive and print styling**

Use a fixed 1600×900 viewBox with `width: 100%`, `max-width`, overflow scrolling on narrow screens, and print rules that hide the toolbar and preserve the diagram.

### Task 2: Verify the diagram in a browser

**Files:**
- Verify: `docs/bwz/project-radar-architecture.html`

- [ ] **Step 1: Open the HTML directly in the browser**

Confirm the document renders without a development server or console errors.

- [ ] **Step 2: Check the five critical paths visually**

Confirm that Re-entry terminates at Radar 查询, the first Activity Event enters Organizer, Radar Item reaches Radar 查询, Memory/Todo has no query arrow, and the new Activity Event returns to Organizer.

- [ ] **Step 3: Check narrow viewport behavior**

Confirm the diagram remains readable through horizontal scrolling and that no labels overlap or become clipped.

## Verification Commands

```bash
test -f docs/bwz/project-radar-architecture.html
rg -n "Re-entry|Post-run Organizer|Context Bundle|Activity Event|Radar 查询" docs/bwz/project-radar-architecture.html
```
