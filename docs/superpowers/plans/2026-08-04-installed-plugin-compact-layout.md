# Installed Plugin Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed plugin area compact without changing plugin behavior.

**Architecture:** Add an installed-only modifier class in the existing presentational component and constrain that section in CSS. No state, API, or navigation changes are required.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library.

---

### Task 1: Constrain The Installed Plugin Section

**Files:**

- Modify: `src/renderer/src/components/Plugins/PluginListView.tsx`
- Modify: `src/renderer/src/components/Plugins/Plugins.css`
- Test: `tests/plugins-view.test.tsx`

- [ ] **Step 1: Add a class-contract test**

Assert that an installed catalog renders `.plugins-catalog-section--compact`, while an uninstalled catalog does not.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/plugins-view.test.tsx`

Expected: FAIL because the compact modifier does not exist.

- [ ] **Step 3: Add the installed-only modifier**

Use `plugins-catalog-section plugins-catalog-section--compact` when `installed` is true.

- [ ] **Step 4: Add the compact width rule**

Set `width: min(100%, 520px)` on `.plugins-catalog-section--compact`. Keep it left aligned and allow narrow viewports to use the available width.

- [ ] **Step 5: Verify the change**

Run `npm test -- tests/plugins-view.test.tsx`, `npm run typecheck`, `npm run lint`, and `git diff --check`.

Expected: all commands exit successfully with no test failures or lint warnings.
