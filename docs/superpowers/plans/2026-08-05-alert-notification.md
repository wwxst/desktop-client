# Alert Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable white, square-cornered Alert notification in the bottom-right corner and migrate the TTS and plugin pages away from their duplicated inline notices.

**Architecture:** Keep business notice state local to each page and render it through one controlled `AlertNotification` component mounted into `document.body` with a React Portal. The component owns presentation and accessibility semantics only; TTS and plugin pages continue to own message creation, replacement, and clearing.

**Tech Stack:** React 19, TypeScript, React DOM Portal, Lucide React, Vitest, Testing Library, CSS.

---

### Task 1: Build the shared Alert notification component

**Files:**
- Create: `tests/alert-notification.test.tsx`
- Create: `src/renderer/src/components/ui/AlertNotification.tsx`
- Create: `src/renderer/src/components/ui/AlertNotification.css`

- [ ] **Step 1: Write the failing component and style-contract tests**

Create `tests/alert-notification.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AlertNotification, {
  type AlertNotificationVariant
} from '../src/renderer/src/components/ui/AlertNotification'

describe('AlertNotification', () => {
  it.each<{
    variant: AlertNotificationVariant
    title: string
    role: 'alert' | 'status'
    live: 'assertive' | 'polite'
  }>([
    { variant: 'info', title: '提示', role: 'status', live: 'polite' },
    { variant: 'success', title: '操作成功', role: 'status', live: 'polite' },
    { variant: 'warning', title: '请注意', role: 'alert', live: 'assertive' },
    { variant: 'error', title: '操作失败', role: 'alert', live: 'assertive' }
  ])('renders the $variant notification with accessible semantics', ({ variant, title, role, live }) => {
    render(
      <AlertNotification
        open
        variant={variant}
        message="测试通知内容"
        onClose={() => undefined}
      />
    )

    const notification = screen.getByRole(role)
    expect(notification).toHaveClass(
      'ui-alert-notification',
      `ui-alert-notification--${variant}`
    )
    expect(notification).toHaveAttribute('aria-live', live)
    expect(notification).toHaveTextContent(title)
    expect(notification).toHaveTextContent('测试通知内容')
    expect(notification.querySelector('.ui-alert-notification__status-icon svg')).not.toBeNull()
  })

  it('supports custom copy and both manual close controls', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(
      <AlertNotification
        open
        variant="error"
        title="目录错误"
        message="插件目录打开失败"
        confirmLabel="关闭"
        onClose={onClose}
      />
    )

    expect(screen.getByText('目录错误')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭通知' }))
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    onClose.mockClear()
    render(
      <AlertNotification open variant="info" message="普通提示" onClose={onClose} />
    )
    await user.click(screen.getByRole('button', { name: '知道了' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when closed', () => {
    render(
      <AlertNotification
        open={false}
        variant="success"
        message="不应显示"
        onClose={() => undefined}
      />
    )

    expect(screen.queryByText('不应显示')).not.toBeInTheDocument()
  })

  it('keeps the approved bottom-right white square visual contract', () => {
    const css = readFileSync(
      new URL(
        '../src/renderer/src/components/ui/AlertNotification.css',
        import.meta.url
      ),
      'utf8'
    )
    const rootRule = css.match(/\.ui-alert-notification\s*\{([\s\S]*?)\}/)?.[1] ?? ''

    expect(rootRule).toMatch(/position:\s*fixed/)
    expect(rootRule).toMatch(/right:\s*18px/)
    expect(rootRule).toMatch(/bottom:\s*18px/)
    expect(rootRule).toMatch(/background:\s*#ffffff/)
    expect(rootRule).toMatch(/border-radius:\s*0/)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npx vitest run tests/alert-notification.test.tsx
```

Expected: FAIL because `AlertNotification.tsx` and its stylesheet do not exist.

- [ ] **Step 3: Implement the controlled Portal component**

Create `src/renderer/src/components/ui/AlertNotification.tsx`:

```tsx
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import Button from './Button'
import './AlertNotification.css'

export type AlertNotificationVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertNotificationProps {
  open: boolean
  variant: AlertNotificationVariant
  title?: string
  message: ReactNode
  confirmLabel?: string
  onClose: () => void
}

const variantConfig = {
  info: { title: '提示', icon: Info },
  success: { title: '操作成功', icon: CircleCheck },
  warning: { title: '请注意', icon: TriangleAlert },
  error: { title: '操作失败', icon: CircleX }
} as const

function AlertNotification({
  open,
  variant,
  title,
  message,
  confirmLabel = '知道了',
  onClose
}: AlertNotificationProps): JSX.Element | null {
  if (!open) {
    return null
  }

  const config = variantConfig[variant]
  const StatusIcon = config.icon
  const urgent = variant === 'warning' || variant === 'error'

  return createPortal(
    <aside
      className={`ui-alert-notification ui-alert-notification--${variant}`}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="ui-alert-notification__status-icon" aria-hidden="true">
        <StatusIcon />
      </span>

      <div className="ui-alert-notification__content">
        <strong className="ui-alert-notification__title">{title ?? config.title}</strong>
        <div className="ui-alert-notification__message">{message}</div>
      </div>

      <button
        className="ui-alert-notification__close"
        type="button"
        aria-label="关闭通知"
        title="关闭通知"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>

      <div className="ui-alert-notification__actions">
        <Button size="sm" onClick={onClose}>
          {confirmLabel}
        </Button>
      </div>
    </aside>,
    document.body
  )
}

export default AlertNotification
```

- [ ] **Step 4: Add the approved white, square-cornered styles**

Create `src/renderer/src/components/ui/AlertNotification.css`:

```css
.ui-alert-notification {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 1200;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 28px;
  gap: 10px;
  width: min(360px, calc(100vw - 36px));
  min-width: 0;
  padding: 15px 14px;
  color: #242b34;
  background: #ffffff;
  border: 1px solid #d9dee7;
  border-radius: 0;
  box-shadow: 0 10px 28px rgba(26, 35, 47, 0.2);
  animation: ui-alert-notification-enter 160ms ease-out;
}

.ui-alert-notification__status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #ffffff;
  background: #0052d9;
  border-radius: 50%;
}

.ui-alert-notification__status-icon svg {
  width: 14px;
  height: 14px;
  stroke-width: 2.2;
}

.ui-alert-notification--success .ui-alert-notification__status-icon {
  background: #2ba471;
}

.ui-alert-notification--warning .ui-alert-notification__status-icon {
  background: #e37318;
}

.ui-alert-notification--error .ui-alert-notification__status-icon {
  background: #d54941;
}

.ui-alert-notification__content {
  min-width: 0;
}

.ui-alert-notification__title {
  display: block;
  margin: 1px 0 5px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.ui-alert-notification__message {
  color: #5f6671;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.ui-alert-notification__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #707985;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.ui-alert-notification__close:hover {
  color: #242b34;
  background: #f0f2f5;
}

.ui-alert-notification__close:focus-visible {
  outline: 2px solid rgba(41, 112, 198, 0.35);
  outline-offset: 1px;
}

.ui-alert-notification__close svg {
  width: 16px;
  height: 16px;
}

.ui-alert-notification__actions {
  display: flex;
  grid-column: 2 / 4;
  justify-content: flex-end;
  margin-top: 6px;
}

@keyframes ui-alert-notification-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-alert-notification {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the component test and confirm GREEN**

Run:

```powershell
npx vitest run tests/alert-notification.test.tsx tests/button.test.tsx
```

Expected: both test files pass; all four variants, both close controls, Portal rendering, and the approved CSS contract are covered.

- [ ] **Step 6: Commit the shared component**

```powershell
git add tests/alert-notification.test.tsx src/renderer/src/components/ui/AlertNotification.tsx src/renderer/src/components/ui/AlertNotification.css
git commit -m "feat: add shared alert notification"
```

### Task 2: Migrate TTS notices and remove preview-progress messaging

**Files:**
- Modify: `tests/tts-card-preview.test.tsx`
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx`
- Modify: `src/renderer/src/components/TtsVoiceover/TtsVoiceover.css`

- [ ] **Step 1: Add failing TTS notification assertions**

In the existing pending-preview test, assert that only the card state reports work in progress:

```tsx
expect(screen.getByRole('button', { name: '生成中：第二音色' })).toBeDisabled()
expect(screen.queryByText('正在使用本机 CPU 生成试听音频')).not.toBeInTheDocument()
expect(document.querySelector('.tts-notice')).not.toBeInTheDocument()
```

Update the play-rejection test to verify the shared error notification and close behavior:

```tsx
const notification = await screen.findByRole('alert')
expect(notification).toHaveClass('ui-alert-notification--error')
expect(notification).toHaveTextContent('操作失败')
expect(notification).toHaveTextContent('试听播放失败')
await user.click(within(notification).getByRole('button', { name: '知道了' }))
expect(screen.queryByText('试听播放失败')).not.toBeInTheDocument()
```

Update the cancelled-job assertion to preserve polite status semantics:

```tsx
const notification = screen.getByRole('status')
expect(notification).toHaveClass('ui-alert-notification--info')
expect(notification).toHaveTextContent('提示')
expect(notification).toHaveTextContent('正式任务已取消')
```

Expose a `saveTtsJob` mock from the existing `setWindowApi` helper. Extend its return type, replace the inline API mock, and return the function:

```tsx
function setWindowApi(
  previewTts: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(successfulPreview)
): {
  emitJobProgress: (progress: TtsJobProgress) => void
  saveTtsJob: ReturnType<typeof vi.fn>
} {
  const removeListener = vi.fn()
  const saveTtsJob = vi.fn()
  let jobProgressListener: ((progress: TtsJobProgress) => void) | null = null

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      login: vi.fn(),
      getSubscription: vi.fn(),
      listTtsCatalog: vi.fn().mockResolvedValue(catalog),
      installTtsModel: vi.fn(),
      removeTtsModel: vi.fn(),
      openTtsModelDirectory: vi.fn(),
      previewTts,
      createTtsJob: vi.fn(),
      cancelTtsJob: vi.fn(),
      saveTtsJob,
      onTtsModelDownloadProgress: vi.fn(() => removeListener),
      onTtsJobProgress: vi.fn((listener) => {
        jobProgressListener = listener
        return removeListener
      })
    }
  })

  return {
    emitJobProgress: (progress) => jobProgressListener?.(progress),
    saveTtsJob
  }
}
```

Then add coverage for completion, save replacement, and closing without changing task state:

```tsx
it('shows completion and save results without changing the completed task', async () => {
  const { emitJobProgress, saveTtsJob } = setWindowApi()
  saveTtsJob.mockResolvedValue({ success: true, canceled: false, message: 'WAV 文件已保存' })
  const user = userEvent.setup()

  render(<TtsVoiceoverView />)
  act(() => {
    emitJobProgress({
      jobId: 'completed-job',
      modelId: 'resource-one',
      status: 'completed',
      currentSegment: 1,
      totalSegments: 1,
      percent: 100,
      message: '生成完成'
    })
  })

  let notification = screen.getByRole('status')
  expect(notification).toHaveClass('ui-alert-notification--success')
  expect(notification).toHaveTextContent('配音生成完成，可以试听并保存 WAV 文件')
  await user.click(within(notification).getByRole('button', { name: '知道了' }))
  expect(screen.getByRole('button', { name: '保存 WAV' })).toBeEnabled()

  await user.click(screen.getByRole('button', { name: '保存 WAV' }))
  notification = await screen.findByRole('status')
  expect(notification).toHaveClass('ui-alert-notification--success')
  expect(notification).toHaveTextContent('WAV 文件已保存')
})
```

- [ ] **Step 2: Run the focused TTS test and confirm RED**

Run:

```powershell
npx vitest run tests/tts-card-preview.test.tsx
```

Expected: FAIL because the current pending preview creates an info notice, errors have no shared title or controls, and the old `.tts-notice` is still rendered.

- [ ] **Step 3: Replace the inline TTS notice with `AlertNotification`**

Import the component and shared variant type:

```tsx
import AlertNotification, {
  type AlertNotificationVariant
} from '../ui/AlertNotification'
```

Update the local notice type and remove preview-progress ownership fields that are no longer needed:

```tsx
interface NoticeState {
  type: AlertNotificationVariant
  text: string
  previewPlaybackUrl?: string
}
```

Delete `PREVIEW_GENERATING_NOTICE`. In `handlePreview`, keep `setPreviewingVoiceId(voice.id)` but remove the following call entirely:

```tsx
setNotice({
  type: 'info',
  text: PREVIEW_GENERATING_NOTICE,
  previewEpoch: requestEpoch
})
```

In the `finally` block, keep only the card state cleanup:

```tsx
} finally {
  if (mountedRef.current) {
    setPreviewingVoiceId(null)
  }
}
```

Replace the inline notification markup with:

```tsx
{notice && (
  <AlertNotification
    open
    variant={notice.type}
    message={notice.text}
    onClose={() => setNotice(null)}
  />
)}
```

Do not change `previewEpochRef`; it still protects async preview and media lifecycles. Keep `previewPlaybackUrl` because successful cached retry uses it to clear only the matching playback error.

- [ ] **Step 4: Remove the obsolete TTS notice CSS**

Delete the complete `.tts-notice`, `.tts-notice--success`, `.tts-notice--error`, and `.tts-notice--info` selector blocks from `TtsVoiceover.css`.

Do not change voice-card, footer, progress, or responsive layout rules.

- [ ] **Step 5: Run TTS and shared-component regression tests**

Run:

```powershell
npx vitest run tests/alert-notification.test.tsx tests/tts-card-preview.test.tsx tests/tts-preview-samples.test.tsx tests/tts-voice-selection.test.tsx tests/workspace-view.test.tsx
```

Expected: all listed tests pass; pending preview uses only card loading state, success remains silent, and result/error messages use the shared bottom-right component.

- [ ] **Step 6: Commit the TTS migration**

```powershell
git add tests/tts-card-preview.test.tsx src/renderer/src/components/TtsVoiceover/TtsVoiceoverView.tsx src/renderer/src/components/TtsVoiceover/TtsVoiceover.css
git commit -m "refactor: use shared TTS notifications"
```

### Task 3: Migrate plugin notices and remove install-progress messaging

**Files:**
- Modify: `tests/plugins-view.test.tsx`
- Modify: `src/renderer/src/components/Plugins/PluginsView.tsx`
- Modify: `src/renderer/src/components/Plugins/Plugins.css`

- [ ] **Step 1: Add a deferred helper and failing plugin notification tests**

Add this helper near the existing catalog factories in `tests/plugins-view.test.tsx`:

```tsx
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
```

Add a test that keeps installation progress in the card and shows only the final result:

```tsx
it('uses card progress during install and shows only the result notification', async () => {
  const { installTtsModel } = setWindowApi(createCatalog())
  const pending = deferred<{ success: boolean; message: string }>()
  installTtsModel.mockReturnValueOnce(pending.promise)
  const user = userEvent.setup()

  render(<PluginsView />)
  await user.click(await screen.findByRole('button', { name: '安装中文高品质音色' }))

  expect(screen.queryByText('正在下载中文高品质音色，请保持网络连接')).not.toBeInTheDocument()
  expect(document.querySelector('.plugins-notice')).not.toBeInTheDocument()

  pending.resolve({ success: true, message: '安装完成' })
  const notification = await screen.findByRole('status')
  expect(notification).toHaveClass('ui-alert-notification--success')
  expect(notification).toHaveTextContent('操作成功')
  expect(notification).toHaveTextContent('中文高品质音色安装完成')

  await user.click(within(notification).getByRole('button', { name: '知道了' }))
  expect(screen.queryByText('中文高品质音色安装完成')).not.toBeInTheDocument()
})
```

Add a detail-page failure test:

```tsx
it('shows a shared error notification when the plugin directory cannot open', async () => {
  const { openTtsModelDirectory } = setWindowApi(
    createCatalog([createModel(0, { status: 'installed', statusMessage: '已安装' })])
  )
  openTtsModelDirectory.mockResolvedValueOnce({ success: false, message: '打开失败' })
  const user = userEvent.setup()

  render(<PluginsView />)
  await user.click(await screen.findByRole('button', { name: '查看中文高品质音色详情' }))
  await user.click(screen.getByRole('button', { name: '打开中文高品质音色目录' }))

  const notification = await screen.findByRole('alert')
  expect(notification).toHaveClass('ui-alert-notification--error')
  expect(notification).toHaveTextContent('操作失败')
expect(notification).toHaveTextContent('插件目录打开失败，请重试')
})
```

Extend the existing unload test with result-notification assertions:

```tsx
const notification = await screen.findByRole('status')
expect(notification).toHaveClass('ui-alert-notification--success')
expect(notification).toHaveTextContent('操作成功')
expect(notification).toHaveTextContent('中英通用音色已卸载')
```

- [ ] **Step 2: Run the plugin test and confirm RED**

Run:

```powershell
npx vitest run tests/plugins-view.test.tsx
```

Expected: FAIL because install start still creates an inline info notice and plugin results do not use `AlertNotification`.

- [ ] **Step 3: Replace both plugin-page notice render sites**

Import the component and shared type:

```tsx
import AlertNotification, {
  type AlertNotificationVariant
} from '../ui/AlertNotification'
```

Use the shared variant type:

```tsx
interface PluginsNotice {
  type: AlertNotificationVariant
  text: string
}
```

Before the selected-model branch, define one controlled notification element:

```tsx
const notification = notice ? (
  <AlertNotification
    open
    variant={notice.type}
    message={notice.text}
    onClose={() => setNotice(null)}
  />
) : null
```

Replace both old `plugins-notice` blocks with `{notification}`. The Portal ensures the component stays fixed to the window rather than affecting either list or detail layout.

- [ ] **Step 4: Remove the install-progress notice and old plugin CSS**

In `handleInstall`, preserve progress state and remove only the notice call:

```tsx
setDownloadProgress(null)
setActiveActionId(model.id)
```

Delete:

```tsx
setNotice({ type: 'info', text: `正在下载${pluginName}，请保持网络连接` })
```

Delete the complete `.plugins-notice`, `.plugins-notice--success`, `.plugins-notice--error`, and `.plugins-notice--info` selector blocks from `Plugins.css`.

Keep the existing card-level download progress, active action, install, remove, and catalog-refresh logic unchanged.

- [ ] **Step 5: Run plugin and shared-component regression tests**

Run:

```powershell
npx vitest run tests/alert-notification.test.tsx tests/plugins-view.test.tsx tests/plugin-action-menu.test.tsx tests/workspace-view.test.tsx
```

Expected: all listed tests pass; installation shows no intermediate notice, result notifications work in list and detail views, and existing plugin interactions remain intact.

- [ ] **Step 6: Commit the plugin migration**

```powershell
git add tests/plugins-view.test.tsx src/renderer/src/components/Plugins/PluginsView.tsx src/renderer/src/components/Plugins/Plugins.css
git commit -m "refactor: use shared plugin notifications"
```

### Task 4: Verify the complete application

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run all tests**

```powershell
npm test
```

Expected: all Vitest files and assertions pass.

- [ ] **Step 2: Run lint and both TypeScript projects**

```powershell
npm run lint -- --quiet
npm run typecheck
```

Expected: ESLint exits 0 and both node/web TypeScript checks pass.

- [ ] **Step 3: Run the production build and whitespace validation**

```powershell
npm run build
git diff --check
```

Expected: Electron Vite production build exits 0 and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Inspect the final branch state**

```powershell
git status --short --branch
git log -8 --oneline
```

Expected: the worktree is clean; the component, TTS migration, and plugin migration commits follow the design and plan commits.
