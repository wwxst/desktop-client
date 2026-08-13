# AI Panel Last-Used Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI conversation model selector choose the only/first available model by default and restore the user's last selected model across panel mounts and application restarts.

**Architecture:** Keep the preference entirely in Renderer because it contains only a non-sensitive model configuration ID. A focused module beside `AiPanel` owns selection resolution and exception-safe `localStorage` access; `AiPanel` applies the resolved selection after each model-list refresh and saves every user selection immediately. Main, Preload, IPC contracts, Settings model entities, layout, and copy remain unchanged.

**Tech Stack:** React 19, TypeScript, browser `localStorage`, Vitest, Testing Library, user-event.

---

## File Map

- Create `src/renderer/src/components/AiPanel/aiPanelModelPreference.ts`: storage key, exception-safe read/write, and pure selection-resolution rule.
- Modify `src/renderer/src/components/AiPanel/AiPanel.tsx`: resolve a valid model after list loading and persist dropdown changes.
- Create `tests/ai-panel-model-preference.test.ts`: focused tests for precedence and unavailable storage.
- Modify `tests/ai-panel.test.tsx`: mounted behavior for default selection, remount restoration, deleted-model fallback, and empty-list cleanup.
- Modify `docs/verification.md`: update the verification snapshot only if the final full-suite counts or lint baseline differ from the current documented values.

### Task 1: Lock the model preference contract with failing tests

**Files:**
- Create: `tests/ai-panel-model-preference.test.ts`
- Modify: `tests/ai-panel.test.tsx:3-6`
- Modify: `tests/ai-panel.test.tsx:115-156`

- [ ] **Step 1: Add isolated preference setup to the mounted test suite**

Import `beforeEach` and the storage key, then clear only this feature's record before each test so tests do not leak model choices:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentModelRegistryItem } from '../src/shared/agent/workflow'
import { LAST_USED_AGENT_MODEL_CONFIG_KEY } from '../src/renderer/src/components/AiPanel/aiPanelModelPreference'

function setAgentModels(configurations: AgentModelRegistryItem[]): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listAgentModelConfigurations: vi.fn().mockResolvedValue({
        success: true,
        message: '模型配置加载成功',
        configurations
      })
    }
  })
}

describe('AiPanel', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)
  })
```

- [ ] **Step 2: Write the failing pure resolver and storage tests**

Create `tests/ai-panel-model-preference.test.ts` with these cases:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  LAST_USED_AGENT_MODEL_CONFIG_KEY,
  readLastUsedAgentModelConfigId,
  resolveAgentModelConfigId,
  writeLastUsedAgentModelConfigId
} from '../src/renderer/src/components/AiPanel/aiPanelModelPreference'

const configurations = [{ id: 'config-1' }, { id: 'config-2' }]

describe('AI panel model preference', () => {
  it('keeps a valid current selection before the stored preference', () => {
    expect(resolveAgentModelConfigId(configurations, 'config-2', 'config-1')).toBe('config-2')
  })

  it('uses a valid stored preference before the first model', () => {
    expect(resolveAgentModelConfigId(configurations, '', 'config-2')).toBe('config-2')
  })

  it('falls back to the first model and returns empty for an empty list', () => {
    expect(resolveAgentModelConfigId(configurations, '', 'deleted-config')).toBe('config-1')
    expect(resolveAgentModelConfigId([], '', 'deleted-config')).toBe('')
  })

  it('does not throw when preference storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('blocked') }),
      removeItem: vi.fn(() => { throw new Error('blocked') })
    } as unknown as Storage

    expect(readLastUsedAgentModelConfigId(storage)).toBe('')
    expect(() => writeLastUsedAgentModelConfigId('config-1', storage)).not.toThrow()
    expect(() => writeLastUsedAgentModelConfigId('', storage)).not.toThrow()
  })

  it('writes and clears the dedicated preference key', () => {
    const storage = window.localStorage
    writeLastUsedAgentModelConfigId('config-2', storage)
    expect(storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-2')
    writeLastUsedAgentModelConfigId('', storage)
    expect(storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBeNull()
  })
})
```

- [ ] **Step 3: Write failing mounted behavior tests**

Add four tests to `tests/ai-panel.test.tsx`. Use `Object.defineProperty(window, 'api', ...)` with successful `listAgentModelConfigurations` responses, and assert:

```tsx
it('selects the only configured model by default', async () => {
  setAgentModels([{ id: 'config-1', kind: 'custom', modelId: 'chat-model' }])
  render(<AiPanel />)

  expect(await screen.findByRole('combobox', { name: '模型' })).toHaveValue('config-1')
  expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-1')
})

it('restores the model selected during the previous mount', async () => {
  const user = userEvent.setup()
  setAgentModels([
    { id: 'config-1', kind: 'custom', modelId: 'first-model' },
    { id: 'config-2', kind: 'custom', modelId: 'second-model' }
  ])
  const firstMount = render(<AiPanel />)
  await user.selectOptions(await screen.findByRole('combobox', { name: '模型' }), 'config-2')
  firstMount.unmount()
  render(<AiPanel />)

  expect(await screen.findByRole('combobox', { name: '模型' })).toHaveValue('config-2')
})

it('replaces a deleted stored model with the first available model', async () => {
  window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'deleted-config')
  setAgentModels([{ id: 'config-1', kind: 'custom', modelId: 'first-model' }])
  render(<AiPanel />)

  expect(await screen.findByRole('combobox', { name: '模型' })).toHaveValue('config-1')
  expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBe('config-1')
})

it('clears a deleted stored model when no models remain', async () => {
  window.localStorage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, 'deleted-config')
  setAgentModels([])
  render(<AiPanel />)

  expect(await screen.findByRole('combobox', { name: '模型' })).toHaveValue('')
  expect(window.localStorage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)).toBeNull()
})
```

The helper deliberately exposes only `listAgentModelConfigurations`; these selection tests do not need `runAgentChat` and therefore keep the IPC mock narrow.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
npm test -- tests/ai-panel-model-preference.test.ts tests/ai-panel.test.tsx
```

Expected: FAIL because `aiPanelModelPreference.ts` does not exist and the current `AiPanel` leaves `selectedConfigId` empty after loading configurations. Fix only test syntax or fixtures if execution errors before reaching those missing behaviors.

- [ ] **Step 5: Commit the red tests**

```powershell
git add -- tests/ai-panel-model-preference.test.ts tests/ai-panel.test.tsx
git commit -m "test: define AI model selection preference"
```

### Task 2: Implement preference resolution and connect it to AiPanel

**Files:**
- Create: `src/renderer/src/components/AiPanel/aiPanelModelPreference.ts`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx:34-37`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx:130-155`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx:604-623`

- [ ] **Step 1: Add the focused preference module**

Create `aiPanelModelPreference.ts`:

```ts
export const LAST_USED_AGENT_MODEL_CONFIG_KEY = 'desktop-client.ai.last-used-model-config-id'

interface ModelConfigurationIdentity {
  id: string
}

export function resolveAgentModelConfigId(
  configurations: readonly ModelConfigurationIdentity[],
  currentConfigId: string,
  lastUsedConfigId: string
): string {
  if (configurations.some(({ id }) => id === currentConfigId)) return currentConfigId
  if (configurations.some(({ id }) => id === lastUsedConfigId)) return lastUsedConfigId
  return configurations[0]?.id ?? ''
}

export function readLastUsedAgentModelConfigId(storage: Storage = window.localStorage): string {
  try {
    return storage.getItem(LAST_USED_AGENT_MODEL_CONFIG_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeLastUsedAgentModelConfigId(
  configId: string,
  storage: Storage = window.localStorage
): void {
  try {
    if (configId) storage.setItem(LAST_USED_AGENT_MODEL_CONFIG_KEY, configId)
    else storage.removeItem(LAST_USED_AGENT_MODEL_CONFIG_KEY)
  } catch {
    // The current selection remains usable when persistent storage is unavailable.
  }
}
```

- [ ] **Step 2: Resolve and persist the selection after model loading**

Import the three functions used by the component. Replace the current state updater in the successful list response with:

```tsx
setModelConfigurations(response.configurations)
setSelectedConfigId((current) => {
  const next = resolveAgentModelConfigId(
    response.configurations,
    current,
    readLastUsedAgentModelConfigId()
  )
  writeLastUsedAgentModelConfigId(next)
  return next
})
setModelError(response.configurations.length ? '' : '请先在设置中添加模型')
```

Do not read or write the preference when the model-list request fails because Main remains the model-list fact source and the previous valid selection should not be discarded on transient errors.

- [ ] **Step 3: Save explicit dropdown changes immediately**

Replace the model `select` handler body with:

```tsx
onChange={(event) => {
  const configId = event.target.value
  setSelectedConfigId(configId)
  writeLastUsedAgentModelConfigId(configId)
  setModelError('')
}}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- tests/ai-panel-model-preference.test.ts tests/ai-panel.test.tsx
```

Expected: both test files PASS, including default, remount, deleted-model, empty-list, precedence, and storage-exception cases.

- [ ] **Step 5: Run focused type and lint checks**

```powershell
npm run typecheck:web
npx eslint src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/aiPanelModelPreference.ts tests/ai-panel.test.tsx tests/ai-panel-model-preference.test.ts
```

Expected: both commands exit `0` with no ESLint errors. Apply project formatting only to the touched files if Prettier warnings appear.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/aiPanelModelPreference.ts
git commit -m "feat: remember the AI conversation model"
```

### Task 3: Run repository verification and record the current baseline

**Files:**
- Modify only if results changed: `docs/verification.md`

- [ ] **Step 1: Run the complete test suite**

```powershell
npm test -- --reporter=dot
```

Expected: exit `0`; all test files and tests pass. Record exact file/test counts and any known jsdom notices.

- [ ] **Step 2: Run full typecheck and lint**

```powershell
npm run typecheck
npm run lint
```

Expected: both exit `0`; lint has zero errors. Do not describe warnings as errors or claim cleaner output than the command reports.

- [ ] **Step 3: Build the Electron application**

```powershell
npm run build
```

Expected: exit `0` and Electron Vite emits Main, Preload, and Renderer outputs.

- [ ] **Step 4: Check the patch**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the intended implementation, tests, plan, and any evidence-based verification-doc update are present.

- [ ] **Step 5: Update verification documentation only when evidence changed**

If full-suite counts, lint baseline, or documented notices differ, update `docs/verification.md` with the exact fresh output and date `2026-08-13`. If no documented baseline fact changed, leave the file untouched.

- [ ] **Step 6: Commit verification documentation if modified**

```powershell
git add -- docs/verification.md
git commit -m "docs: refresh verification baseline"
```

Skip this commit when `docs/verification.md` did not change. Do not push unless the user explicitly requests publication.
