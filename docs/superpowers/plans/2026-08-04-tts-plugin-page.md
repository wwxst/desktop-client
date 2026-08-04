# TTS Plugin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plugin-management page for local TTS resources and remove model selection from the TTS tool page.

**Architecture:** Keep `TTS 配音` as a workspace tool and add `插件` as a sibling workspace route. `PluginsView` aggregates the existing TTS model catalog into one user-facing plugin and maps three friendly resource names to the existing model IDs. `TtsVoiceoverView` aggregates voices from all installed compatible resources and derives the generation model from the selected voice.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Testing Library, Lucide React, existing preload TTS APIs.

---

### Task 1: Add the plugin workspace route

**Files:**

- Modify: `src/renderer/src/workspaceNavigation.ts`
- Modify: `src/renderer/src/components/Sidebar/Sidebar.tsx`
- Modify: `src/renderer/src/components/Workspace/WorkspaceView.tsx`
- Test: `tests/sidebar.test.tsx`
- Test: `tests/workspace-navigation.test.ts`
- Test: `tests/workspace-view.test.tsx`

- [ ] **Step 1: Write failing navigation tests**

Add assertions that the sidebar exposes a `插件` button, invokes `onItemSelect('plugins')`, and that selecting the new menu resets an open Smart Edit session. Add a workspace test that clicks `插件` and expects a region named `插件中心`.

```tsx
expect(screen.getByRole('button', { name: '插件' })).toBeInTheDocument()
await user.click(screen.getByRole('button', { name: '插件' }))
expect(onItemSelect).toHaveBeenCalledWith('plugins')
expect(screen.getByRole('region', { name: '插件中心' })).toBeInTheDocument()
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/sidebar.test.tsx tests/workspace-navigation.test.ts tests/workspace-view.test.tsx`

Expected: FAIL because `plugins` is not a `WorkspaceMenu`, no sidebar button exists, and no plugin page is rendered.

- [ ] **Step 3: Add the route and sidebar item**

Extend the menu union and sidebar list:

```ts
export type WorkspaceMenu = 'home' | 'novel-promotion' | 'tts-voiceover' | 'plugins' | 'smart-edit'
```

```tsx
import { BookOpen, Home, Mic2, Plug, Scissors, Settings } from 'lucide-react'

{ id: 'plugins', label: '插件', icon: Plug }
```

Add a temporary accessible `插件中心` region in `WorkspaceView`; Task 2 replaces it with `PluginsView`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/sidebar.test.tsx tests/workspace-navigation.test.ts tests/workspace-view.test.tsx`

Expected: PASS.

### Task 2: Build the plugin catalog page

**Files:**

- Create: `src/renderer/src/components/Plugins/PluginsView.tsx`
- Create: `src/renderer/src/components/Plugins/Plugins.css`
- Create: `tests/plugins-view.test.tsx`
- Modify: `src/renderer/src/components/Workspace/WorkspaceView.tsx`

- [ ] **Step 1: Write failing plugin-page tests**

Render `PluginsView` with mocked `window.api` and verify:

```tsx
expect(screen.getByRole('tab', { name: '插件' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByRole('heading', { name: '插件' })).toBeInTheDocument()
expect(screen.getByRole('searchbox', { name: '搜索插件' })).toBeInTheDocument()
expect(await screen.findByText('本地 TTS 配音')).toBeInTheDocument()
```

Add tests for search filtering, the clickable `技能` tab with `暂无可用技能`, default installation using `kokoro-multi-lang-v1_1`, and an installed plugin opening its resource manager.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/plugins-view.test.tsx`

Expected: FAIL because `PluginsView` does not exist.

- [ ] **Step 3: Implement catalog aggregation and interactions**

Create `PluginsView` with these stable mappings:

```ts
const DEFAULT_TTS_RESOURCE_ID = 'kokoro-multi-lang-v1_1'

const RESOURCE_NAMES: Record<string, string> = {
  'kokoro-multi-lang-v1_1': '中文高品质音色',
  'kokoro-multi-lang-v1_0': '中英通用音色',
  'supertonic-3-int8-2026-05-11': '多语言音色'
}
```

On mount, call `listTtsCatalog()`, subscribe to model download progress, and remove the listener on unmount. Aggregate plugin status as installed when any model is installed. The main row uses `安装`, `管理`, or `重试`; the expanded manager uses existing install/remove APIs. Confirm deletion with `window.confirm`, refresh the catalog after successful actions, and expose loading, error, retry, empty-search, and skills-empty states.

- [ ] **Step 4: Implement restrained project-native styling**

Use a full-height white page, a centered content column, compact tabs, a 42px search field, unframed sections separated by 1px rules, and stable action-button widths. Use the existing project blue for primary actions and Lucide icons; do not add gradients, shadows, nested cards, or model branding.

- [ ] **Step 5: Replace the temporary workspace region and verify GREEN**

Import and render `PluginsView` when `navigation.activeMenu === 'plugins'`.

Run: `npm test -- tests/plugins-view.test.tsx tests/workspace-view.test.tsx`

Expected: PASS.

### Task 3: Remove model UI and aggregate installed voices

**Files:**

- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx`
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceover.css`
- Modify: `src/renderer/src/components/Workspace/WorkspaceView.tsx`
- Modify: `tests/workspace-view.test.tsx`
- Modify: `tests/tts-preview-samples.test.tsx`

- [ ] **Step 1: Write failing TTS behavior tests**

Update the installed-model workspace test to assert:

```tsx
expect(within(preview).queryByText('本地语音模型')).not.toBeInTheDocument()
expect(within(preview).queryByText('Kokoro 测试模型')).not.toBeInTheDocument()
expect(await within(preview).findByRole('radio')).toBeChecked()
```

Add a test with two installed models and select a voice from the second model. Trigger preview and assert that the request contains the selected voice's `modelId`. Add a no-compatible-resource test that clicks `前往插件` and expects the plugin page.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/workspace-view.test.tsx tests/tts-preview-samples.test.tsx`

Expected: FAIL because the model section is still visible, voices come from only one model, and no navigation callback exists.

- [ ] **Step 3: Aggregate voices and derive the request model**

Replace single-model voice selection with installed-compatible aggregation:

```ts
const availableVoices = useMemo(
  () =>
    languageModels
      .filter((model) => model.status === 'installed')
      .flatMap((model) => model.voices.filter((voice) => voice.languageCodes.includes(language))),
  [language, languageModels]
)
```

Build preview and generation requests with `selectedVoice.modelId`. Remove model selection state, model cards, installation/removal handlers, model-directory controls, and their unused Lucide imports. Keep catalog loading, language selection, voice filtering, preview, generation, progress, cancellation, and save behavior unchanged.

- [ ] **Step 4: Add plugin-page navigation for missing resources**

Add `onOpenPlugins?: () => void` to `TtsVoiceoverView`. When no compatible voice exists after loading, render `当前语言需要安装配音插件` and a `前往插件` button. Pass a callback from `WorkspaceView` that dispatches `menu/selected` with `plugins`.

- [ ] **Step 5: Remove obsolete model CSS and verify GREEN**

Delete `.tts-model-*` selectors and retain only the compact missing-plugin state styles required by the TTS page.

Run: `npm test -- tests/workspace-view.test.tsx tests/tts-preview-samples.test.tsx tests/plugins-view.test.tsx`

Expected: PASS.

### Task 4: Full verification and visual inspection

**Files:**

- Verify all modified renderer and test files.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0 with no TypeScript, ESLint, Vitest, or production-build errors.

- [ ] **Step 2: Start the development app**

Run: `npm run dev`

Expected: Electron opens the workspace without renderer or main-process startup errors.

- [ ] **Step 3: Inspect the plugin workflow**

Verify at the normal desktop viewport and the layout minimum width:

- `插件` is visible and selected in the sidebar.
- Header, tabs, search, installed/available sections, and plugin row do not overlap.
- Search and skill-tab states work.
- Resource management shows existing installation state and progress.
- TTS page contains no model title or model card.
- Missing language resources link back to the plugin page.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check` and `git diff --stat`.

Expected: no whitespace errors and no unrelated file changes introduced by this implementation.
