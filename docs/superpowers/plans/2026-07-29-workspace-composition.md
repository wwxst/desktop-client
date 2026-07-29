# Workspace Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose `Sidebar`, `WorkspaceView`, and `AiPanel` through `Layout` in `App`, with each component owning only its region.

**Architecture:** `App` owns the selected navigation key and passes derived state and callbacks into three sibling business components. `Layout` remains a business-free slot component and owns the entire three-column grid.

**Tech Stack:** React 19, TypeScript 5.9, plain CSS, Electron Vite

---

### Task 1: Establish Shared Navigation Data

**Files:**
- Create: `src/renderer/src/components/workspaceNavigation.ts`

- [ ] Export `MenuKey`, `MenuItem`, and `workspaceMenuItems` containing the six existing menu entries.
- [ ] Keep display labels and descriptions unchanged.

### Task 2: Extract the Three Business Regions

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/components/Sidebar.css`
- Create: `src/renderer/src/components/WorkspaceView.tsx`
- Create: `src/renderer/src/components/WorkspaceView.css`
- Create: `src/renderer/src/components/AiPanel.tsx`
- Create: `src/renderer/src/components/AiPanel.css`

- [ ] Move left navigation and account markup into `Sidebar`.
- [ ] Move only the center header, actions, and body into `WorkspaceView`.
- [ ] Move the AI header, context, body, and input into `AiPanel`.
- [ ] Move each active CSS selector to the stylesheet of the component that renders it.
- [ ] Preserve existing behavior, labels, class names, and module-level Chinese comments.

### Task 3: Make App Own Composition

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] Import `Layout`, `Sidebar`, `WorkspaceView`, `AiPanel`, and the shared menu configuration.
- [ ] Add `activeMenu` state and derive `currentMenu` in `App`.
- [ ] Render the authenticated view as `Layout` with the three components passed through its slots.
- [ ] Keep existing login, activation, subscription, and toast behavior unchanged.

### Task 4: Move Layout Rules and Remove the Old Container

**Files:**
- Modify: `src/renderer/src/layouts/Layout.css`
- Delete: `src/renderer/src/components/Workspace.tsx`
- Delete: `src/renderer/src/components/Workspace.css`

- [ ] Move shared box sizing, control font inheritance, responsive grid columns, and three-column shell sizing into `Layout.css`.
- [ ] Remove duplicated child borders now owned by `Layout`.
- [ ] Delete the old component only after all active markup and styles have migrated.

### Task 5: Verify Responsibilities and Build

- [ ] Confirm `App.tsx` contains `Layout`, `Sidebar`, `WorkspaceView`, and `AiPanel`.
- [ ] Confirm `WorkspaceView.tsx` contains no `studio-sidebar`, `studio-ai-panel`, or `studio-shell` reference.
- [ ] Confirm all CSS class names used by TSX have definitions and no component CSS classes are unused.
- [ ] Run `npm run lint -- --quiet` and expect exit code 0.
- [ ] Run `npm run build` and expect exit code 0.

### Task 6: Organize Component Directories

**Files:**
- Move: `src/renderer/src/components/Activation.*` to `components/Activation/`
- Move: `src/renderer/src/components/AiPanel.*` to `components/AiPanel/`
- Move: `src/renderer/src/components/Sidebar.*` to `components/Sidebar/`
- Move: `src/renderer/src/components/WorkspaceView.*` to `components/WorkspaceView/`
- Move: `src/renderer/src/components/workspaceNavigation.ts` to `components/shared/`

- [ ] Keep same-named TSX and CSS files without adding barrel files.
- [ ] Update all imports to explicit component file paths.
- [ ] Verify no component TSX or CSS files remain directly under `components/`.
- [ ] Run `npm run lint -- --quiet` and `npm run build`.
