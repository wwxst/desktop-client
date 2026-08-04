# Plugin List And Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline TTS plugin management with a compact plugin list and a separate plugin detail page.

**Architecture:** Keep catalog loading, download progress, installation, and removal orchestration in `PluginsView`. Add focused presentational components for the list, detail page, and reusable gear menu; list/detail navigation remains local React state and requires no Electron or backend changes.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Testing Library, Lucide React, existing TTS preload APIs.

---

### Task 1: Add The Reusable Gear Action Menu

**Files:**

- Create: `src/renderer/src/components/Plugins/PluginActionMenu.tsx`
- Modify: `src/renderer/src/components/Plugins/Plugins.css`
- Test: `tests/plugin-action-menu.test.tsx`

- [ ] **Step 1: Write the failing action-menu tests**

Test the accessible gear button, menu expansion, unload callback, Escape closing, and focus leaving the menu:

```tsx
render(<PluginActionMenu label="本地 TTS 配音" disabled={false} onRemove={onRemove} />)
await user.click(screen.getByRole('button', { name: '管理本地 TTS 配音' }))
expect(screen.getByRole('menu')).toBeInTheDocument()
await user.click(screen.getByRole('menuitem', { name: '卸载' }))
expect(onRemove).toHaveBeenCalledOnce()
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/plugin-action-menu.test.tsx`

Expected: FAIL because `PluginActionMenu` does not exist.

- [ ] **Step 3: Implement the accessible menu**

Create a component using Lucide `Settings` and `Trash2`. Keep the gear as an icon-only button with a tooltip, use `aria-haspopup="menu"`, close after removal, close on Escape, and close when focus leaves its wrapper.

```tsx
interface PluginActionMenuProps {
  label: string
  disabled: boolean
  onRemove: () => void
}

function PluginActionMenu({ label, disabled, onRemove }: PluginActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
    }
  }

  const handleRemove = (): void => {
    setOpen(false)
    onRemove()
  }

  return (
    <div className="plugin-action-menu" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        type="button"
        aria-label={`管理${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`管理${label}`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="plugin-action-menu__popover" role="menu">
          <button type="button" role="menuitem" onClick={handleRemove}>
            <Trash2 size={14} aria-hidden="true" />
            卸载
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add compact popover styling**

Position the menu below the gear, keep the menu above following rows, and use a white surface with a one-pixel border and no button shadow.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- tests/plugin-action-menu.test.tsx`

Expected: PASS.

### Task 2: Replace The Inline Manager With A Clickable Plugin List

**Files:**

- Create: `src/renderer/src/components/Plugins/PluginListView.tsx`
- Modify: `src/renderer/src/components/Plugins/PluginsView.tsx`
- Modify: `src/renderer/src/components/Plugins/Plugins.css`
- Modify: `tests/plugins-view.test.tsx`

- [ ] **Step 1: Write failing list-interaction tests**

Cover these separate interaction zones:

```tsx
await user.click(screen.getByRole('button', { name: '查看本地 TTS 配音详情' }))
expect(screen.getByRole('region', { name: '本地 TTS 配音详情' })).toBeInTheDocument()

await user.click(screen.getByRole('button', { name: '安装' }))
expect(installTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_1')
expect(screen.queryByRole('region', { name: '本地 TTS 配音详情' })).not.toBeInTheDocument()

await user.click(screen.getByRole('button', { name: '管理本地 TTS 配音' }))
await user.click(screen.getByRole('menuitem', { name: '卸载' }))
expect(removeTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_1')
expect(screen.queryByRole('region', { name: '本地 TTS 配音详情' })).not.toBeInTheDocument()
```

Use two installed resources in the plugin-level unload test and assert that both IDs are removed after one confirmation.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/plugins-view.test.tsx`

Expected: FAIL because the list still exposes a `管理` expansion button and has no detail navigation.

- [ ] **Step 3: Create the presentational list component**

Use an `article` with a wide, accessible detail button and a separate action cell so interactive controls are never nested:

```tsx
<article className="plugin-list-item">
  <button
    className="plugin-list-item__open"
    type="button"
    aria-label="查看本地 TTS 配音详情"
    onClick={onOpenDetail}
  >
    <span className="plugin-list-item__icon" aria-hidden="true">
      <Mic2 size={20} strokeWidth={1.7} />
    </span>
    <span className="plugin-list-item__copy">...</span>
    <span className="plugin-list-item__status">{statusLabel}</span>
  </button>
  <div className="plugin-list-item__action">
    {installed ? (
      <PluginActionMenu label="本地 TTS 配音" disabled={busy} onRemove={onRemovePlugin} />
    ) : (
      <button type="button" disabled={busy || !canInstall} onClick={onInstallDefault}>
        {failed ? '重试' : '安装'}
      </button>
    )}
  </div>
</article>
```

- [ ] **Step 4: Add plugin-level unload orchestration**

In `PluginsView`, confirm once, then remove all currently installed resource IDs sequentially. Always refresh the catalog after the attempt and report full or partial failure without exposing model branding.

```tsx
const handleRemovePlugin = async (): Promise<void> => {
  const installedResources = models.filter((model) => model.status === 'installed')
  if (!window.confirm('确定卸载“本地 TTS 配音”吗？已下载的语音资源将一并删除。')) return

  setPluginActionRunning(true)
  try {
    const results: TtsModelActionResponse[] = []
    for (const resource of installedResources) {
      results.push(await window.api.removeTtsModel(resource.id))
    }
    const removedAll = results.every((result) => result.success)
    setNotice({
      type: removedAll ? 'success' : 'error',
      text: removedAll ? '本地 TTS 配音已卸载' : '部分语音资源卸载失败，请重试'
    })
  } catch {
    setNotice({ type: 'error', text: '部分语音资源卸载失败，请重试' })
  } finally {
    await refreshCatalog()
    setPluginActionRunning(false)
  }
}
```

- [ ] **Step 5: Remove inline-manager state and markup**

Delete `managerOpen`, the `管理` button, chevrons, and the inline `.plugins-resource-manager` block from the list page. Add `selectedPluginId` state and render the list while it is `null`.

- [ ] **Step 6: Style the compact list and verify GREEN**

Keep a stable 64-72px row, 42px icon, truncating copy, and a 34px action column. Use the project blue for install/retry and no shadows.

Run: `npm test -- tests/plugins-view.test.tsx tests/plugin-action-menu.test.tsx`

Expected: PASS.

### Task 3: Add The Separate Plugin Detail Page

**Files:**

- Create: `src/renderer/src/components/Plugins/PluginDetailView.tsx`
- Modify: `src/renderer/src/components/Plugins/PluginsView.tsx`
- Modify: `src/renderer/src/components/Plugins/Plugins.css`
- Modify: `tests/plugins-view.test.tsx`

- [ ] **Step 1: Write failing detail-page tests**

Verify the approved hierarchy and the absence of the rejected command:

```tsx
expect(screen.getByRole('region', { name: '本地 TTS 配音详情' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '返回插件列表' })).toBeInTheDocument()
expect(screen.queryByRole('button', { name: '打开配音' })).not.toBeInTheDocument()
expect(screen.getByRole('heading', { name: '语音资源' })).toBeInTheDocument()
expect(screen.getByRole('heading', { name: '信息' })).toBeInTheDocument()
```

Add tests for uninstalled detail installation, installed plugin gear unload, resource installation, resource gear unload, and breadcrumb return.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/plugins-view.test.tsx`

Expected: FAIL because the detail component does not exist.

- [ ] **Step 3: Implement the detail header and breadcrumb**

Create `PluginDetailView` with these props:

```tsx
interface PluginDetailViewProps {
  models: TtsModelInfo[]
  installed: boolean
  failed: boolean
  busyResourceId: string | null
  pluginActionRunning: boolean
  defaultResource: TtsModelInfo | null
  downloadProgress: TtsModelDownloadProgress | null
  onBack: () => void
  onInstall: (modelId: string) => void
  onRemoveResource: (model: TtsModelInfo) => void
  onRemovePlugin: () => void
}
```

The header contains `插件 > 本地 TTS 配音`, icon, name, description, and only one contextual action: install/retry while uninstalled or `PluginActionMenu` while installed. Do not render an `打开配音` command.

- [ ] **Step 4: Implement the resource and information sections**

Render friendly resource names, voice counts, download sizes, progress, retry, and per-resource gear menus. The information section uses simple definition rows:

```tsx
<section className="plugin-detail__section" aria-labelledby="plugin-information-title">
  <h2 id="plugin-information-title">信息</h2>
  <dl className="plugin-information">
    <div><dt>处理方式</dt><dd>本地离线处理</dd></div>
    <div><dt>文本传输</dt><dd>无需上传服务器</dd></div>
    <div>
      <dt>资源占用</dt>
      <dd>
        {models
          .filter((model) => model.status === 'installed')
          .reduce((total, model) => total + model.estimatedDownloadMb, 0)} MB
      </dd>
    </div>
  </dl>
</section>
```

- [ ] **Step 5: Wire local list/detail navigation**

Render `PluginDetailView` when `selectedPluginId === 'local-tts'`. Returning sets it to `null`. Switching to the Skills tab also resets detail state so reopening Plugins starts at the list.

- [ ] **Step 6: Add responsive detail styling**

Use a centered content column, compact breadcrumb, unframed full-width sections separated by rules, and a mobile layout that wraps the header action without overlapping text.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `npm test -- tests/plugins-view.test.tsx tests/workspace-view.test.tsx`

Expected: PASS.

### Task 4: Full Verification And Review

**Files:**

- Verify all modified plugin components, CSS, tests, and design documents.

- [ ] **Step 1: Run all automated checks**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0; Vitest reports zero failures; ESLint reports no warnings.

- [ ] **Step 2: Inspect both plugin states**

At the normal desktop width and minimum supported content width, verify:

- Uninstalled list action installs without entering detail.
- Installed gear opens an unload menu without entering detail.
- Clicking list content enters detail.
- Detail breadcrumb returns to the list.
- Detail has no `打开配音` button.
- Plugin-level unload removes all installed resources.
- Resource-level unload removes only that resource.
- Menus, progress, notices, and text do not overlap.
- No Kokoro, Supertonic, sherpa, or “模型” branding appears in visible plugin UI.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` against the current working-tree diff. Fix all Critical and Important findings, then rerun Step 1.
