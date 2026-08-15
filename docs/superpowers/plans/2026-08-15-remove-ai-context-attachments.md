# AI 对话附件入口移除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 AI 对话输入区彻底移除默认 PRD 标签、附件标签、隐藏文件输入和“添加上下文”按钮。

**Architecture:** 改动只发生在 Renderer 的 `AiPanel` 展示层；删除没有进入 `AgentChatRequest` 的本地文件名状态和对应 DOM/CSS。现有聊天、Agent 工具、审批与编辑器上下文数据流保持不变。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、CSS、ESLint、Prettier

---

## 文件结构

- 修改 `tests/ai-panel.test.tsx`：把聊天外壳契约改为附件入口不存在。
- 修改 `src/renderer/src/components/AiPanel/AiPanel.tsx`：删除附件状态、事件、引用、图标与 JSX。
- 修改 `src/renderer/src/components/AiPanel/AiPanel.css`：删除附件标签和隐藏文件输入样式。
- 按实测结果修改 `docs/verification.md`：只在完整构建产物尺寸发生变化时同步当前基线。

### Task 1: 用测试驱动移除附件入口

**Files:**

- Modify: `tests/ai-panel.test.tsx:1094-1113`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.tsx:1-33,107-108,251-295,473-508,732-741,1070-1132`
- Modify: `src/renderer/src/components/AiPanel/AiPanel.css:627-669,720-722`

- [ ] **Step 1: 将聊天外壳测试改为附件入口不存在**

在 `renders the chat shell and switches to Codex mode` 测试中，用以下断言替换默认 PRD 存在断言：

```tsx
expect(screen.queryByText('桌面端自动剪辑产品PRD.md')).not.toBeInTheDocument()
expect(screen.queryByRole('button', { name: '添加上下文' })).not.toBeInTheDocument()
```

保留输入框、发送按钮、模式切换和空状态断言，确保删除附件入口不会缩减其他聊天外壳契约。

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
npm test -- tests/ai-panel.test.tsx --reporter=dot
```

Expected: `renders the chat shell and switches to Codex mode` 失败；失败原因是页面仍显示 `桌面端自动剪辑产品PRD.md` 或仍存在“添加上下文”按钮，而不是测试配置错误。

- [ ] **Step 3: 删除 AiPanel 附件状态与事件**

从 `AiPanel.tsx` 删除：

```tsx
FileText,
```

```tsx
const DEFAULT_CONTEXT_FILE = '桌面端自动剪辑产品PRD.md'
```

```tsx
const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
const [autoAttachProject, setAutoAttachProject] = useState(true)
const fileInputRef = useRef<HTMLInputElement>(null)
const attachmentName = selectedFileName ?? (autoAttachProject ? DEFAULT_CONTEXT_FILE : null)
```

删除 `resetConversation` 和 `changeExecutionMode` 中的 `setSelectedFileName` / `setAutoAttachProject` 调用，并完整删除：

```tsx
const handleFileSelected = (event: ChangeEvent<HTMLInputElement>): void => {
  setSelectedFileName(event.target.files?.[0]?.name ?? null)
  event.target.value = ''
}
```

保留 `ChangeEvent`，因为 `handleComposerInput` 仍使用该类型；保留 `Plus`，因为新建会话按钮仍使用该图标。

- [ ] **Step 4: 删除附件 JSX**

让 composer 从 textarea 直接开始，不再渲染 `attachmentName` 条件块：

```tsx
<form className="studio-ai-panel__composer" onSubmit={handleSubmit}>
  <textarea
    ref={textareaRef}
    value={composerValue}
    rows={1}
    aria-label="描述要构建的内容"
    placeholder="描述要构建的内容"
    onChange={handleComposerInput}
    onKeyDown={handleComposerKeyDown}
  />
```

让 composer toolbar 从执行模式选择器直接开始，删除隐藏 `<input type="file">` 和“添加上下文”按钮：

```tsx
<div className="studio-ai-panel__composer-toolbar">
  <label className="studio-ai-panel__select" title="选择执行模式">
```

- [ ] **Step 5: 删除附件专用 CSS**

从 `AiPanel.css` 完整删除以下选择器块，不修改 composer 和其他 toolbar 控件：

```css
.studio-ai-panel__attachment
.studio-ai-panel__attachment > svg
.studio-ai-panel__attachment span
.studio-ai-panel__attachment button
.studio-ai-panel__attachment button:hover
.studio-ai-panel__file-input
```

- [ ] **Step 6: 验证源码没有附件残留**

Run:

```bash
rg -n "DEFAULT_CONTEXT_FILE|selectedFileName|autoAttachProject|fileInputRef|handleFileSelected|attachmentName|studio-ai-panel__attachment|studio-ai-panel__file-input|添加上下文|移除附件|FileText" src/renderer/src/components/AiPanel
```

Expected: 无匹配，退出码 `1`。

- [ ] **Step 7: 运行 AI 面板测试并确认 GREEN**

Run:

```bash
npm test -- tests/ai-panel.test.tsx --reporter=dot
```

Expected: `1` 个测试文件、`46/46` 测试通过。

- [ ] **Step 8: 提交行为改动**

```bash
git add tests/ai-panel.test.tsx src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/AiPanel.css
git commit -m "fix: remove AI context attachments"
```

### Task 2: 完整验证并同步基线

**Files:**

- Modify only if measured output changes: `docs/verification.md:21-25`

- [ ] **Step 1: 执行完整验证**

Run:

```bash
npm test -- --reporter=dot
npm run typecheck
npm run lint -- --no-cache
npm run build
git diff --check
```

Expected:

- Vitest：`58/58` 测试文件、`406/406` 测试通过；4 条 jsdom `HTMLMediaElement.load()` 提示和 1 条离线目录回退 warning 仍是预期输出。
- TypeScript：Node 与 Web 检查退出码 `0`。
- ESLint：退出码 `0`，0 error、0 warning。
- Build：Main、Preload、Renderer 均成功生成。
- `git diff --check`：退出码 `0`。

- [ ] **Step 2: 同步验证文档中的实测产物尺寸**

比较 `npm run build` 输出与 `docs/verification.md` 第 23 行。若 Main、Preload、Renderer JS 或 Renderer CSS 任一尺寸不同，只把该行对应的数值更新为刚才 stdout 中的实测值；测试数量保持 `58/58` 和 `406/406`，lint 保持 0 error、0 warning。

- [ ] **Step 3: 在最终文档状态下复验格式与差异**

Run:

```bash
npx prettier --check src/renderer/src/components/AiPanel/AiPanel.tsx src/renderer/src/components/AiPanel/AiPanel.css tests/ai-panel.test.tsx docs/verification.md
npm run lint -- --no-cache
git diff --check
```

Expected: 三条命令均退出码 `0`，lint 无告警。

- [ ] **Step 4: 提交验证基线（仅在文档发生变化时）**

```bash
git add docs/verification.md
git commit -m "docs: update attachment removal verification"
```

若 `docs/verification.md` 没有差异，则跳过该提交，并用 `git status --short` 确认工作区干净。
