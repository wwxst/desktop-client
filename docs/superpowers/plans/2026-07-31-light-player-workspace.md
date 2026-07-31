# Light Editor Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resizable light editing interface entirely inside `WorkspaceView`, with 功能区, 播放器, and 参数区 above a timeline that spans those three internal regions.

**Architecture:** Preserve the outer `App` and `Layout` composition. Nest a vertical and horizontal `react-resizable-panels` group inside `WorkspaceView`, keep player markup in the main component, and place the bounded timeline surface in `components/WorkspaceView/Timeline.tsx`.

**Tech Stack:** React 19, TypeScript, react-resizable-panels, Lucide React, CSS, Node test runner

---

### Task 1: Lock The Correct Middle-Workspace Boundary

**Files:**

- Modify: `tests/workspace-player.test.mjs`
- Create: `tests/workspace-timeline.test.mjs`
- Verify: `tests/workspace-layout.test.mjs`

- [ ] **Step 1: Add failing workspace-structure assertions**

Require `WorkspaceView` to contain a vertical outer group, a horizontal upper group, 功能区, 播放器, 参数区, and a timeline below the upper panel. Require three internal accessible resize handles.

- [ ] **Step 2: Add failing timeline assertions**

Require the internal timeline component to render its toolbar, ruler, playhead, video/audio headers, and fixed alignment dimensions.

- [ ] **Step 3: Verify RED**

Run `node --test tests/workspace-player.test.mjs tests/workspace-timeline.test.mjs`. The new assertions must fail because `WorkspaceView` currently renders only the player.

### Task 2: Build The Internal Editor Layout

**Files:**

- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.tsx`
- Modify: `src/renderer/src/components/WorkspaceView/WorkspaceView.css`
- Create: `src/renderer/src/components/WorkspaceView/Timeline.tsx`
- Create: `src/renderer/src/components/WorkspaceView/Timeline.css`

- [ ] **Step 1: Add nested resizable groups**

Wrap the middle workspace in a vertical group. Put a horizontal group with the three upper regions in the first panel and the timeline in the second panel. Add accessible column and row separators with compact minimum sizes.

- [ ] **Step 2: Add the upper region shells**

Render a compact function tool list on the left, retain the player in the center, and render disabled visual-parameter controls on the right.

- [ ] **Step 3: Add the timeline subcomponent**

Render the toolbar, zoom control, ruler, playhead, and empty video/audio lanes with stable dimensions and disabled behavior-dependent controls.

- [ ] **Step 4: Style the internal editor**

Use component-scoped light surfaces, subtle structural borders, zero minimum dimensions, and stable control sizes. Keep all new CSS under `WorkspaceView` ownership.

- [ ] **Step 5: Verify GREEN**

Run `node --test tests/workspace-player.test.mjs tests/workspace-timeline.test.mjs tests/workspace-layout.test.mjs`. The new workspace tests must pass; the pre-existing TitleBar text assertion may remain independently failed.

### Task 3: Verify Scope And Rendering

- [ ] **Step 1:** Run `npm run lint -- --quiet`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] **Step 2:** Inspect the default desktop window and confirm that the internal timeline spans 功能区, 播放器, and 参数区 only.
- [ ] **Step 3:** Review the focused diff and confirm no new changes remain in `App`, `Layout`, `Sidebar`, `AiPanel`, or `TitleBar` from this correction.
