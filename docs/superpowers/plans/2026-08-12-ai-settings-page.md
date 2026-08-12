# AI 模型设置页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 模型连接配置放入参考设置工作区，并通过已有 Agent IPC 完成读取和保存。

**Architecture:** 在业务导航之外增加独立设置工作区状态；设置页由独立 Renderer 组件负责表单和状态，Main/Preload 继续复用现有 `getAgentModelStatus` 与 `configureAgentModel`。设置页显示时隐藏但不卸载普通主侧栏、内容区和 AI 右栏，返回时恢复原工作区及其现有状态。

**Tech Stack:** React 19, TypeScript, Electron contextBridge IPC, Vitest, Testing Library, Lucide icons.

---

### Task 1: Extend navigation and sidebar settings entry

**Files:**
- Modify: `src/renderer/src/workspaceNavigation.ts`
- Modify: `src/renderer/src/components/Sidebar/Sidebar.tsx`
- Test: `tests/workspace-navigation.test.ts`, `tests/sidebar.test.tsx`

- [x] Add a settings-selection callback outside the business menu state while keeping the existing primary menu order unchanged.
- [x] Add failing tests proving the sidebar gear invokes the callback without changing the business navigation reducer.
- [x] Run the focused tests and confirm they fail before implementation.
- [x] Implement the smallest navigation/sidebar change and run the focused tests again.

### Task 2: Build the settings page UI and model form

**Files:**
- Create: `src/renderer/src/components/Settings/SettingsView.tsx`
- Create: `src/renderer/src/components/Settings/SettingsView.css`
- Test: `tests/settings-view.test.tsx`

- [x] Add failing tests for the five-field contract, status loading, successful save, failed save, and API key not being rendered from status.
- [x] Run the focused test and confirm it fails because the component does not exist.
- [x] Implement the reference-inspired two-column settings layout and the five-field form using `window.api.getAgentModelStatus` and `window.api.configureAgentModel`.
- [x] Keep the API key blank on load and clear it after a successful save; display only configured/unconfigured status and returned error messages.
- [x] Run the focused settings tests and confirm they pass.

### Task 3: Wire workspace routing and AI panel navigation

**Files:**
- Modify: `src/renderer/src/components/Workspace/WorkspaceView.tsx`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.css`
- Test: `tests/workspace-view.test.tsx`, `tests/ai-panel.test.tsx`

- [x] Add failing tests for opening settings from the sidebar and AI panel settings button, and for hiding the AI right panel on the settings route.
- [x] Run the focused tests and confirm the expected failures.
- [x] Render `SettingsView` as the independent settings workspace, pass `onOpenSettings` into `AiPanel`, and make the panel settings button navigate instead of opening a global-config popover.
- [x] Return to the existing first-level page with its editor and AI session state intact, without changing the three-column layout used by other routes.
- [x] Run focused Workspace, AI panel, and settings tests.

### Task 4: Update current architecture documentation

**Files:**
- Modify: `docs/architecture/current.md`

- [x] Record the settings route, the five-field AI configuration boundary, and that existing Main-only API-key handling remains unchanged.
- [x] Run `git diff --check` and verify no project persistence, reference counts, or cache cleanup is introduced.

### Task 5: Full verification and publish

- [x] Run `npm test -- --reporter=dot`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `npm run lint` and confirm zero errors.
- [x] Run `git diff --check`.
- [ ] Review the diff, commit the feature, push `main`, and verify local `HEAD` equals `git ls-remote origin refs/heads/main`.
