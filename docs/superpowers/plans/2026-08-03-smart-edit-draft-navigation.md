# 智剪草稿导航实施计划

> **面向执行代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按复选框逐项实施本计划。

**目标：** 登录后默认显示空白首页，在开发环境增加“智剪”菜单和草稿入口，并从草稿页进入或退出现有视频编辑器。

**架构：** `App` 继续拥有登录状态，并通过一个纯 reducer 统一拥有一级菜单和智剪内部页面状态。`Sidebar` 改为受控组件；草稿入口与编辑器包装层拆成独立组件，`WorkspaceView` 只在编辑状态挂载，从而利用其现有卸载逻辑清空临时数据并释放媒体地址。

**技术栈：** React 19、TypeScript、Vite 环境变量、Lucide React、CSS、Node test runner

---

## 文件结构

- 新建 `src/renderer/src/workspaceNavigation.ts`：定义菜单、智剪页面、导航状态和纯 reducer。
- 新建 `src/renderer/src/components/SmartEdit/SmartEditDraftView.tsx`：只渲染“新建草稿”入口。
- 新建 `src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx`：渲染“返回草稿”工具栏和现有 `WorkspaceView`。
- 新建 `src/renderer/src/components/SmartEdit/SmartEdit.css`：只负责草稿页和编辑器包装层样式。
- 修改 `src/renderer/src/components/Sidebar/Sidebar.tsx`：改为受控菜单，并按外部开发开关显示“智剪”。
- 修改 `src/renderer/src/App.tsx`：拥有导航状态，只替换 `Layout` 的中间内容。
- 修改 `src/renderer/src/App.css`：增加无可见内容的空白页容器。
- 新建 `tests/workspace-navigation.test.mjs`：行为测试导航 reducer，并检查智剪组件契约。
- 修改 `tests/workspace-layout.test.mjs`：更新登录后布局、受控菜单和开发环境隐藏契约。
- 保持 `Layout`、`AiPanel`、`WorkspaceView` 及其播放器、时间线和面板文件不变。

### 任务 1：建立可测试的导航状态

**文件：**

- 新建：`tests/workspace-navigation.test.mjs`
- 新建：`src/renderer/src/workspaceNavigation.ts`

- [ ] **步骤 1：先写失败的导航行为测试**

创建 `tests/workspace-navigation.test.mjs`，先加入以下完整 reducer 测试：

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const navigationSource = await readFile(
  new URL('../src/renderer/src/workspaceNavigation.ts', import.meta.url),
  'utf8'
)
const navigationJavaScript = ts.transpileModule(navigationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const navigation = await import(
  `data:text/javascript;base64,${Buffer.from(navigationJavaScript).toString('base64')}`
)

test('登录后的工作区默认停留在首页和草稿列表状态', () => {
  assert.deepEqual(navigation.initialWorkspaceNavigationState, {
    activeMenu: 'home',
    smartEditPage: 'draft-list'
  })
})

test('智剪先进入草稿页，创建后进入编辑器', () => {
  let state = navigation.workspaceNavigationReducer(navigation.initialWorkspaceNavigationState, {
    type: 'menu/selected',
    menu: 'smart-edit'
  })
  assert.deepEqual(state, { activeMenu: 'smart-edit', smartEditPage: 'draft-list' })

  state = navigation.workspaceNavigationReducer(state, { type: 'draft/created' })
  assert.deepEqual(state, { activeMenu: 'smart-edit', smartEditPage: 'editor' })
})

test('重复点击智剪不退出编辑器，返回按钮会回到草稿页', () => {
  const editingState = { activeMenu: 'smart-edit', smartEditPage: 'editor' }
  const unchanged = navigation.workspaceNavigationReducer(editingState, {
    type: 'menu/selected',
    menu: 'smart-edit'
  })
  assert.strictEqual(unchanged, editingState)

  assert.deepEqual(navigation.workspaceNavigationReducer(editingState, { type: 'draft/closed' }), {
    activeMenu: 'smart-edit',
    smartEditPage: 'draft-list'
  })
})

test('离开智剪会清除编辑页面状态，再次进入时回到草稿页', () => {
  const editingState = { activeMenu: 'smart-edit', smartEditPage: 'editor' }
  const homeState = navigation.workspaceNavigationReducer(editingState, {
    type: 'menu/selected',
    menu: 'home'
  })
  assert.deepEqual(homeState, { activeMenu: 'home', smartEditPage: 'draft-list' })

  assert.deepEqual(
    navigation.workspaceNavigationReducer(homeState, {
      type: 'menu/selected',
      menu: 'smart-edit'
    }),
    { activeMenu: 'smart-edit', smartEditPage: 'draft-list' }
  )
})

test('不在智剪时不能直接创建或关闭草稿', () => {
  const initial = navigation.initialWorkspaceNavigationState
  assert.strictEqual(
    navigation.workspaceNavigationReducer(initial, { type: 'draft/created' }),
    initial
  )
  assert.strictEqual(
    navigation.workspaceNavigationReducer(initial, { type: 'draft/closed' }),
    initial
  )
})
```

- [ ] **步骤 2：运行测试并确认红灯**

运行：

```powershell
node --test tests/workspace-navigation.test.mjs
```

预期：测试因 `workspaceNavigation.ts` 不存在而失败，证明失败来自待实现功能。

- [ ] **步骤 3：实现最小导航 reducer**

创建 `src/renderer/src/workspaceNavigation.ts`：

```ts
export type WorkspaceMenu = 'home' | 'novel-promotion' | 'smart-edit'
export type SmartEditPage = 'draft-list' | 'editor'

export interface WorkspaceNavigationState {
  activeMenu: WorkspaceMenu
  smartEditPage: SmartEditPage
}

export type WorkspaceNavigationAction =
  | { type: 'menu/selected'; menu: WorkspaceMenu }
  | { type: 'draft/created' }
  | { type: 'draft/closed' }

export const initialWorkspaceNavigationState: WorkspaceNavigationState = {
  activeMenu: 'home',
  smartEditPage: 'draft-list'
}

export function workspaceNavigationReducer(
  state: WorkspaceNavigationState,
  action: WorkspaceNavigationAction
): WorkspaceNavigationState {
  switch (action.type) {
    case 'menu/selected':
      if (action.menu === 'smart-edit') {
        return state.activeMenu === 'smart-edit' ? state : { ...state, activeMenu: 'smart-edit' }
      }

      if (state.activeMenu === action.menu && state.smartEditPage === 'draft-list') {
        return state
      }

      return { activeMenu: action.menu, smartEditPage: 'draft-list' }

    case 'draft/created':
      if (state.activeMenu !== 'smart-edit' || state.smartEditPage === 'editor') {
        return state
      }

      return { ...state, smartEditPage: 'editor' }

    case 'draft/closed':
      if (state.activeMenu !== 'smart-edit' || state.smartEditPage === 'draft-list') {
        return state
      }

      return { ...state, smartEditPage: 'draft-list' }
  }
}
```

- [ ] **步骤 4：运行测试并确认绿灯**

运行：

```powershell
node --test tests/workspace-navigation.test.mjs
npm run typecheck:web
```

预期：5 项导航测试全部通过，渲染端类型检查退出码为 0。

- [ ] **步骤 5：提交导航模型**

```powershell
git add src/renderer/src/workspaceNavigation.ts tests/workspace-navigation.test.mjs
git commit -m "feat: 添加工作区导航状态"
```

### 任务 2：建立草稿页和编辑器包装层

**文件：**

- 修改：`tests/workspace-navigation.test.mjs`
- 新建：`src/renderer/src/components/SmartEdit/SmartEditDraftView.tsx`
- 新建：`src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx`
- 新建：`src/renderer/src/components/SmartEdit/SmartEdit.css`

- [ ] **步骤 1：先加入失败的组件契约测试**

在 `tests/workspace-navigation.test.mjs` 顶部读取三个新文件，并增加：

```js
const [draftViewSource, editorViewSource, smartEditStyles] = await Promise.all([
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEditDraftView.tsx', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEditEditorView.tsx', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../src/renderer/src/components/SmartEdit/SmartEdit.css', import.meta.url),
    'utf8'
  )
])

test('草稿页只提供新建草稿入口', () => {
  assert.match(draftViewSource, /aria-label="新建草稿"/)
  assert.match(draftViewSource, /onClick=\{onCreateDraft\}/)
  assert.doesNotMatch(draftViewSource, /草稿列表|最近编辑|删除草稿|重命名/)
})

test('编辑器包装层在工具栏下挂载现有工作区', () => {
  assert.match(editorViewSource, /aria-label="返回草稿"/)
  assert.match(editorViewSource, /onClick=\{onReturnToDrafts\}/)
  assert.match(editorViewSource, /<WorkspaceView\s*\/>/)
  assert.match(smartEditStyles, /grid-template-rows:\s*40px minmax\(0, 1fr\)/)
})
```

- [ ] **步骤 2：运行聚焦测试并确认红灯**

运行 `node --test tests/workspace-navigation.test.mjs`。

预期：原有 5 项 reducer 测试通过，新增文件读取失败。

- [ ] **步骤 3：实现草稿入口组件**

创建 `SmartEditDraftView.tsx`：

```tsx
import { Plus } from 'lucide-react'
import type { JSX } from 'react'
import './SmartEdit.css'

interface SmartEditDraftViewProps {
  onCreateDraft: () => void
}

function SmartEditDraftView({ onCreateDraft }: SmartEditDraftViewProps): JSX.Element {
  return (
    <section className="smart-edit-drafts" aria-label="智剪草稿">
      <button
        className="smart-edit-drafts__create"
        type="button"
        aria-label="新建草稿"
        onClick={onCreateDraft}
      >
        <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>新建草稿</span>
      </button>
    </section>
  )
}

export default SmartEditDraftView
```

- [ ] **步骤 4：实现编辑器包装层**

创建 `SmartEditEditorView.tsx`：

```tsx
import { ArrowLeft } from 'lucide-react'
import type { JSX } from 'react'
import WorkspaceView from '../WorkspaceView/WorkspaceView'
import './SmartEdit.css'

interface SmartEditEditorViewProps {
  onReturnToDrafts: () => void
}

function SmartEditEditorView({ onReturnToDrafts }: SmartEditEditorViewProps): JSX.Element {
  return (
    <section className="smart-edit-editor" aria-label="智剪编辑器">
      <header className="smart-edit-editor__toolbar">
        <button
          className="smart-edit-editor__back"
          type="button"
          aria-label="返回草稿"
          onClick={onReturnToDrafts}
        >
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>返回草稿</span>
        </button>
      </header>

      <div className="smart-edit-editor__workspace">
        <WorkspaceView />
      </div>
    </section>
  )
}

export default SmartEditEditorView
```

- [ ] **步骤 5：实现稳定、不嵌套卡片的浅色样式**

创建 `SmartEdit.css`，使用以下完整规则：

```css
.smart-edit-drafts,
.smart-edit-editor,
.smart-edit-editor__workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.smart-edit-drafts {
  padding: 20px;
  background: #ffffff;
}

.smart-edit-drafts__create,
.smart-edit-editor__back {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}

.smart-edit-drafts__create {
  color: #ffffff;
  background: #1f1f1f;
}

.smart-edit-drafts__create:hover {
  background: #353535;
}

.smart-edit-editor {
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  overflow: hidden;
  background: #f5f5f5;
}

.smart-edit-editor__toolbar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: #ffffff;
  border-bottom: 1px solid #e1e1e1;
}

.smart-edit-editor__back {
  color: #333333;
  background: transparent;
}

.smart-edit-editor__back:hover,
.smart-edit-editor__back:focus-visible {
  background: #ededed;
}

.smart-edit-drafts__create:focus-visible,
.smart-edit-editor__back:focus-visible {
  outline: 1px solid #707070;
  outline-offset: 2px;
}

.smart-edit-editor__workspace {
  overflow: hidden;
}
```

- [ ] **步骤 6：运行聚焦测试并提交组件**

运行：

```powershell
node --test tests/workspace-navigation.test.mjs
npm run typecheck:web
```

预期：7 项导航与组件测试全部通过，类型检查退出码为 0。随后提交：

```powershell
git add src/renderer/src/components/SmartEdit tests/workspace-navigation.test.mjs
git commit -m "feat: 添加智剪草稿入口"
```

### 任务 3：接入受控菜单和中间内容切换

**文件：**

- 修改：`tests/workspace-layout.test.mjs`
- 修改：`src/renderer/src/components/Sidebar/Sidebar.tsx`
- 修改：`src/renderer/src/App.tsx`
- 修改：`src/renderer/src/App.css`

- [ ] **步骤 1：先更新布局测试并确认红灯**

把 `tests/workspace-layout.test.mjs` 中“工作区直接渲染播放器”的旧断言替换为以下契约：

```js
assert.match(app, /useReducer\(workspaceNavigationReducer/)
assert.match(app, /const smartEditEnabled = import\.meta\.env\.DEV/)
assert.match(app, /className="workspace-empty-page"/)
assert.match(app, /<SmartEditDraftView/)
assert.match(app, /<SmartEditEditorView/)
assert.match(app, /showSmartEdit=\{smartEditEnabled\}/)
assert.match(app, /aiPanel=\{<AiPanel\s*\/>\}/)
assert.doesNotMatch(app, /content=\{<WorkspaceView\s*\/>\}/)
```

把“菜单拥有本地激活状态”的断言替换为：

```js
assert.match(sidebar, /interface SidebarProps/)
assert.match(sidebar, /activeItem:\s*WorkspaceMenu/)
assert.match(sidebar, /showSmartEdit:\s*boolean/)
assert.match(sidebar, /onItemSelect:\s*\(item: WorkspaceMenu\) => void/)
assert.match(sidebar, /showSmartEdit\s*\?\s*\[\.\.\.baseMenuItems, smartEditMenuItem\]/)
assert.match(sidebar, /onClick=\{\(\) => onItemSelect\(item\.id\)\}/)
assert.doesNotMatch(sidebar, /useState/)
assert.ok(sidebar.indexOf('首页') < sidebar.indexOf('小说推文'))
assert.ok(sidebar.indexOf('小说推文') < sidebar.indexOf('智剪'))
```

保留头像、昵称、设置按钮、左右默认最小宽度、拖动栏、标题栏和编辑器内部布局的全部既有断言。

运行 `node --test tests/workspace-layout.test.mjs`。

预期：新断言失败，因为 `Sidebar` 仍保存本地状态，`App` 仍把 `WorkspaceView` 直接传给中间内容。

- [ ] **步骤 2：把 Sidebar 改为受控组件**

在 `Sidebar.tsx` 中删除 `useState`，增加 `Scissors` 图标，并采用：

```tsx
import type { JSX } from 'react'
import { BookOpen, Home, Scissors, Settings, type LucideIcon } from 'lucide-react'
import type { WorkspaceMenu } from '../../workspaceNavigation'
import './Sidebar.css'

interface SidebarMenuItem {
  id: WorkspaceMenu
  label: string
  icon: LucideIcon
}

interface SidebarProps {
  activeItem: WorkspaceMenu
  showSmartEdit: boolean
  onItemSelect: (item: WorkspaceMenu) => void
}

const baseMenuItems: SidebarMenuItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'novel-promotion', label: '小说推文', icon: BookOpen }
]

const smartEditMenuItem: SidebarMenuItem = {
  id: 'smart-edit',
  label: '智剪',
  icon: Scissors
}

function Sidebar({ activeItem, showSmartEdit, onItemSelect }: SidebarProps): JSX.Element {
  const menuItems = showSmartEdit ? [...baseMenuItems, smartEditMenuItem] : baseMenuItems

  return (
    <nav className="studio-sidebar" aria-label="主菜单">
      <ul className="studio-sidebar__menu">
        {menuItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.id}>
              <button
                className="studio-sidebar__menu-item"
                type="button"
                aria-current={activeItem === item.id ? 'page' : undefined}
                onClick={() => onItemSelect(item.id)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="studio-sidebar__user">
        <div className="studio-sidebar__avatar" aria-hidden="true">
          KA
        </div>

        <div className="studio-sidebar__identity">
          <span className="studio-sidebar__nickname">kasixmb</span>
          <span className="studio-sidebar__plan">Plus</span>
        </div>

        <button className="studio-sidebar__settings" type="button" aria-label="设置" title="设置">
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}

export default Sidebar
```

- [ ] **步骤 3：在 App 中统一管理页面状态**

在 `App.tsx` 中增加 `useReducer`、两个智剪组件和导航模型导入；删除对 `WorkspaceView` 的直接导入。保留登录表单和生产认证逻辑原样。

在 `App` 状态区增加：

```tsx
const [navigation, dispatchNavigation] = useReducer(
  workspaceNavigationReducer,
  initialWorkspaceNavigationState
)
const smartEditEnabled = import.meta.env.DEV
```

在 `return` 前增加完整的页面切换逻辑：

```tsx
const handleSidebarItemSelect = (menu: WorkspaceMenu): void => {
  dispatchNavigation({
    type: 'menu/selected',
    menu: menu === 'smart-edit' && !smartEditEnabled ? 'home' : menu
  })
}

const activeSidebarItem =
  navigation.activeMenu === 'smart-edit' && !smartEditEnabled ? 'home' : navigation.activeMenu

let workspaceContent: JSX.Element = <div className="workspace-empty-page" aria-hidden="true" />

if (smartEditEnabled && navigation.activeMenu === 'smart-edit') {
  workspaceContent =
    navigation.smartEditPage === 'editor' ? (
      <SmartEditEditorView onReturnToDrafts={() => dispatchNavigation({ type: 'draft/closed' })} />
    ) : (
      <SmartEditDraftView onCreateDraft={() => dispatchNavigation({ type: 'draft/created' })} />
    )
}
```

把工作台 `Layout` 改为：

```tsx
<Layout
  sidebar={
    <Sidebar
      activeItem={activeSidebarItem}
      showSmartEdit={smartEditEnabled}
      onItemSelect={handleSidebarItemSelect}
    />
  }
  content={workspaceContent}
  aiPanel={<AiPanel />}
/>
```

这会保证首页和小说推文都只得到同一个空白中间容器；只有开发环境的智剪编辑状态会挂载 `WorkspaceView`。

- [ ] **步骤 4：补充空白页稳定尺寸**

在 `App.css` 末尾增加：

```css
.workspace-empty-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: #ffffff;
}
```

- [ ] **步骤 5：运行聚焦测试并确认绿灯**

运行：

```powershell
node --test tests/workspace-navigation.test.mjs tests/workspace-layout.test.mjs tests/sidebar-user-area.test.mjs
npm run typecheck:web
```

预期：新增导航测试与所有既有菜单、布局测试全部通过；类型检查退出码为 0。

- [ ] **步骤 6：提交菜单与页面接入**

```powershell
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/components/Sidebar/Sidebar.tsx tests/workspace-layout.test.mjs
git commit -m "feat: 接入智剪草稿导航"
```

### 任务 4：完整验证与生产隐藏检查

**文件：**

- 验证：任务 1 至任务 3 的全部改动
- 不修改：`src/renderer/src/layouts/Layout.tsx`
- 不修改：`src/renderer/src/layouts/Layout.css`
- 不修改：`src/renderer/src/components/AiPanel/AiPanel.tsx`
- 不修改：`src/renderer/src/components/WorkspaceView/**`

- [ ] **步骤 1：运行完整自动化检查**

依次运行，每条命令都必须以退出码 0 结束：

```powershell
npm test
npm run lint -- --quiet
npm run typecheck
npm run build
git diff --check
```

- [ ] **步骤 2：核对生产包不包含智剪界面入口**

生产构建完成后，在 `out/renderer` 中搜索菜单文案与智剪页面类名：

```powershell
rg -n "智剪|smart-edit-drafts|smart-edit-editor" out/renderer
```

预期：没有匹配结果。若打包器保留不可达字符串，则不得据此声称功能暴露；应进一步检查生成代码中不存在通向智剪组件的可执行分支，并在验收记录中说明结果。

- [ ] **步骤 3：核对改动范围**

运行：

```powershell
git diff --stat 4d89cfc..HEAD
git diff --name-only 4d89cfc..HEAD
git status --short
```

预期：只出现本计划列出的导航、智剪、`App`、`Sidebar`、测试和计划文件；`Layout`、`AiPanel`、`WorkspaceView`、主进程和 preload 均不在差异中。

- [ ] **步骤 4：真实界面验收**

启动开发版并逐项确认：

1. 登录后默认高亮“首页”，中间区域完全空白，左侧菜单和右侧 AI 区保持最小默认宽度。
2. 点击“小说推文”后只改变菜单高亮，中间仍为空白。
3. 点击“智剪”后先显示唯一的“新建草稿”入口，不显示编辑器。
4. 点击“新建草稿”后显示现有完整编辑器和“返回草稿”按钮。
5. 导入一个媒体并修改草稿表单，点击“返回草稿”，再次新建后确认媒体、时间线和表单均恢复初始状态。
6. 在编辑器中切换到首页，再回到智剪，确认先显示草稿页而不是旧编辑器。
7. 编辑器中的播放器、时间线、功能区和参数区行为保持不变，左右两栏仍可拖动。

- [ ] **步骤 5：记录最终状态**

运行：

```powershell
git log -6 --oneline --decorate
git status --short --branch
```

预期：实现提交完整存在，工作树干净。除非用户明确要求，本计划不推送远端。
