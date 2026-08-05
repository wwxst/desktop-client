# Media Library Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent, UI-only Media Library workspace page and reorder the main menu to 首页、插件、媒体库、智剪、小说推文、TTS 配音.

**Architecture:** Add a standalone `MediaLibraryView` and stylesheet under the renderer components. It owns only static page presentation: heading, empty state, and an import entry; it does not consume or mutate Smart Edit's project media state and does not persist files. Extend the existing workspace menu union/reducer and render the new page from `WorkspaceView`; keep Smart Edit's current `import.meta.env.DEV` visibility gate.

**Tech Stack:** React 19, TypeScript, lucide-react, Vitest, Testing Library, component-owned CSS.

---

### Task 1: Add navigation contract tests

**Files:**
- Modify: `tests/sidebar.test.tsx`
- Modify: `tests/workspace-view.test.tsx`

- [ ] **Step 1: Write failing tests**

Assert the Sidebar button order is exactly `首页`, `插件`, `媒体库`, `智剪`, `小说推文`, `TTS 配音` when Smart Edit is enabled, and assert selecting `媒体库` renders a region named `媒体库`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/sidebar.test.tsx tests/workspace-view.test.tsx`

Expected: FAIL because `媒体库` is not part of `WorkspaceMenu`, the existing menu order differs, and `WorkspaceView` has no media library route.

### Task 2: Implement the standalone Media Library page

**Files:**
- Create: `src/renderer/src/components/MediaLibrary/MediaLibraryView.tsx`
- Create: `src/renderer/src/components/MediaLibrary/MediaLibrary.css`
- Modify: `tests/workspace-view.test.tsx`

- [ ] **Step 1: Write the page contract test**

Render the page through `WorkspaceView`, select `媒体库`, and assert a `region` named `媒体库`, a heading named `媒体库`, an `导入媒体` button, and an empty-state message. The test must not provide or call the Smart Edit media controller.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/workspace-view.test.tsx -t "媒体库"`

Expected: FAIL because no media library page exists.

- [ ] **Step 3: Implement the UI-only page**

Create a component with this accessible structure:

```tsx
<section className="media-library" aria-label="媒体库">
  <header className="media-library__header">
    <div>
      <p className="media-library__eyebrow">MEDIA LIBRARY</p>
      <h1>媒体库</h1>
    </div>
    <button className="media-library__import" type="button">
      <Upload size={16} aria-hidden="true" />
      <span>导入媒体</span>
    </button>
  </header>
  <div className="media-library__empty" role="status">
    <FolderOpen size={30} aria-hidden="true" />
    <strong>媒体库还是空的</strong>
    <span>导入图片、视频或音频后，会集中显示在这里。</span>
  </div>
</section>
```

Keep the import button as a UI entry only; do not add file persistence, IPC, object URLs, or Smart Edit media imports. Scope every selector under `.media-library` and use stable layout dimensions for the empty state.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/workspace-view.test.tsx -t "媒体库"`

Expected: PASS.

### Task 3: Wire the menu order and workspace route

**Files:**
- Modify: `src/renderer/src/workspaceNavigation.ts`
- Modify: `src/renderer/src/components/Sidebar/Sidebar.tsx`
- Modify: `src/renderer/src/components/Workspace/WorkspaceView.tsx`
- Modify: `tests/sidebar.test.tsx`
- Modify: `tests/workspace-view.test.tsx`

- [ ] **Step 1: Extend the menu type and reducer route**

Add `'media-library'` to `WorkspaceMenu`. The existing reducer's generic `menu/selected` handling already resets Smart Edit page state for non-Smart-Edit menus; preserve that behavior.

- [ ] **Step 2: Replace the Sidebar menu arrays with the approved order**

Use Lucide `Home`, `Plug`, `FolderOpen`, `Scissors`, `BookOpen`, and `Mic2` in this order. Keep `smartEditMenuItem` conditional on `showSmartEdit`, but insert it between media library and novel promotion when visible.

- [ ] **Step 3: Render `MediaLibraryView` from `WorkspaceView`**

Import the new component and set `workspaceContent` when `navigation.activeMenu === 'media-library'`. Do not pass Smart Edit callbacks or media state into it.

- [ ] **Step 4: Run navigation tests and verify they pass**

Run: `npm test -- tests/sidebar.test.tsx tests/workspace-view.test.tsx`

Expected: PASS with the approved order and media route.

### Task 4: Validate the complete change

**Files:**
- Modify: none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [ ] **Step 2: Run static checks and build**

Run: `npm run lint -- --quiet`, `npm run typecheck`, `npm run build`, and `git diff --check`.

Expected: every command exits with code 0.

- [ ] **Step 3: Review the final diff**

Run: `git status --short --branch` and `git diff --stat`.

Confirm only the navigation files, new Media Library component/CSS, tests, and this plan are changed; no Smart Edit media controller or IPC files are modified.

