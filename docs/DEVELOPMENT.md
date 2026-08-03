# 开发指南

本文档描述当前代码结构、组件职责、状态流转和开发约束。历史方案与实施步骤保存在 `docs/superpowers/`，它们是当时的开发快照，不代表当前文件路径。

## 技术栈

- Electron 39
- React 19
- TypeScript 5
- electron-vite
- react-resizable-panels
- lucide-react

## 当前架构

### Electron 进程架构

应用由 Electron 主进程、preload 桥接层和 React renderer 三部分组成，Java 后端是独立运行的外部服务：

```text
React renderer
└─ window.api.login() / window.api.getSubscription()
   ↓ contextBridge
preload
└─ ipcRenderer.invoke()
   ↓ IPC
Electron 主进程
├─ BrowserWindow 与应用生命周期
├─ auth:login / subscription:get-current
├─ 仅在内存中保存登录 Token
└─ net.fetch()
   ↓ HTTP
Java 后端（当前为 http://localhost:8080）
```

各层边界如下：

| 层级 | 主要文件 | 职责 |
| --- | --- | --- |
| 主进程 | `src/main/index.ts` | 创建窗口、管理 Electron 生命周期、注册 IPC、请求 Java 后端和保存登录会话 |
| preload | `src/preload/index.ts`、`index.d.ts` | 通过 `contextBridge` 暴露经过允许的业务 API，并为 renderer 提供类型 |
| renderer | `src/renderer/src/` | React 页面、总工作区、视频编辑工作区和界面状态 |
| 共享契约 | `src/shared/auth.ts` | 主进程、preload 共用的登录和订阅 TypeScript 类型 |
| Java 后端 | 独立服务 | 处理用户登录和订阅查询，当前开发地址为 `http://localhost:8080` |

当前业务 IPC 只有两项：

| Renderer API | IPC 通道 | 主进程行为 |
| --- | --- | --- |
| `window.api.login(request)` | `auth:login` | 调用登录接口；成功后将 Token 保存在主进程内存中，只向 renderer 返回成功状态和消息 |
| `window.api.getSubscription()` | `subscription:get-current` | 由主进程携带 Token 查询订阅；后端返回 `401` 时清空登录会话 |

renderer 不直接持有 Token，也不直接请求 Java 后端。preload 不向页面直接暴露完整的 `ipcRenderer`；业务功能只能通过 `window.api` 中明确声明的方法调用。`window.electron` 是 electron-toolkit 提供的基础桥接对象，不承载本项目的登录与订阅业务。

目前视频编辑器完全运行在 renderer 中，没有项目读取、保存或媒体文件访问 IPC。草稿持久化属于后续能力，不能在文档中视为已经实现。

### Renderer 分层设计

当前 renderer 采用五层结构，依赖只能从上层指向下层：

| 层级 | 主要文件 | 职责 |
| --- | --- | --- |
| 应用入口层 | `App.tsx` | 登录、全局提示、标题栏以及登录页与工作台的切换 |
| 总工作区层 | `WorkspaceView.tsx`、`Layout.tsx` | 一级菜单导航以及左、中、右三块区域的组合 |
| 智剪页面层 | `SmartEditDraftView.tsx`、`SmartEditEditorView.tsx` | 草稿入口、编辑器页面工具栏以及进入和退出编辑器 |
| 视频编辑层 | `VideoEditorWorkspace.tsx` 与四个内部面板 | 编辑器布局、媒体导入、播放、画布比例、时间线和草稿表格 |
| 状态模型层 | `workspaceNavigation.ts`、`editorProject.ts` | 纯类型、初始状态、reducer 和 selector，不渲染界面 |

依赖方向如下：

```text
App
└─ WorkspaceView
   ├─ Layout + Sidebar + AiPanel
   └─ SmartEditDraftView / SmartEditEditorView
      └─ VideoEditorWorkspace
         ├─ FunctionPanel
         ├─ PlayerPanel
         ├─ ParameterPanel
         ├─ Timeline
         └─ editorProjectReducer
```

下层组件不能反向导入或控制上层组件。例如，`VideoEditorWorkspace` 不能直接切换一级菜单，`FunctionPanel` 也不能自行维护第二份编辑项目状态。

### 运行时页面层级

登录后的界面采用“总工作区 + 视频编辑工作区”两层工作区结构：

```text
App
├─ TitleBar
├─ 登录页面
└─ WorkspaceView（总工作区）
   └─ Layout
      ├─ Sidebar
      ├─ 中间内容
      │  ├─ 首页空白页
      │  ├─ 小说推文空白页
      │  └─ 智剪
      │     ├─ SmartEditDraftView
      │     └─ SmartEditEditorView
      │        └─ VideoEditorWorkspace（视频编辑工作区）
      └─ AiPanel
```

### 工作区边界

两层工作区的职责不能混用：

- `WorkspaceView` 管理登录后的工作台导航，并组合左侧菜单、中间页面和右侧 AI 区域。
- `VideoEditorWorkspace` 只管理视频编辑器内部的功能区、播放器、参数区和时间线。
- 视频编辑功能不能直接修改或重新实现外层 `Sidebar`、`Layout` 和 `AiPanel`。

## 项目目录结构

核心目录按 Electron 运行边界划分：

```text
src/
├─ main/
│  └─ index.ts                 # Electron 主进程
├─ preload/
│  ├─ index.ts                 # 安全桥接实现
│  └─ index.d.ts               # window API 类型声明
├─ shared/
│  └─ auth.ts                  # 跨进程认证与订阅类型
└─ renderer/
   ├─ index.html
   └─ src/                     # React 应用

tests/                         # Node 测试
docs/                          # 当前开发文档与历史设计记录
```

### Renderer 目录结构

```text
src/renderer/src/
├─ App.tsx
├─ workspaceNavigation.ts
├─ layouts/
│  ├─ Layout.tsx
│  └─ Layout.css
└─ components/
   ├─ Activation/
   ├─ AiPanel/
   ├─ Sidebar/
   ├─ TitleBar/
   ├─ Workspace/
   │  └─ WorkspaceView.tsx
   └─ SmartEdit/
      ├─ SmartEdit.css
      ├─ SmartEditDraftView.tsx
      ├─ SmartEditEditorView.tsx
      └─ VideoEditorWorkspace/
         ├─ VideoEditorWorkspace.tsx
         ├─ VideoEditorWorkspace.css
         ├─ editorProject.ts
         ├─ FunctionPanel.tsx
         ├─ PlayerPanel.tsx
         ├─ ParameterPanel.tsx
         ├─ Timeline.tsx
         └─ Timeline.css
```

## 组件职责

### App

`App.tsx` 负责登录状态、登录表单、全局提示和 `TitleBar`。登录成功后只挂载 `WorkspaceView`，不再直接管理工作台菜单或视频编辑器。

开发环境保留免登录入口，但生产环境的 `window.api.login` 认证流程不能删除或绕过。

### WorkspaceView

`components/Workspace/WorkspaceView.tsx` 是总工作区：

- 持有 `workspaceNavigationReducer`。
- 默认显示“首页”。
- 组合 `Layout`、`Sidebar` 和 `AiPanel`。
- 根据菜单与智剪内部页面状态决定中间显示的内容。
- 使用 `import.meta.env.DEV` 控制“智剪”是否可见；生产环境不能显示或进入智剪。

### SmartEdit

- `SmartEditDraftView` 当前只提供“新建草稿”入口。
- `SmartEditEditorView` 提供“返回草稿”工具栏，并挂载 `VideoEditorWorkspace`。
- 点击“返回草稿”或切换其他菜单时，视频编辑工作区会被卸载，当前临时编辑状态随之清空。

### VideoEditorWorkspace

`components/SmartEdit/VideoEditorWorkspace/VideoEditorWorkspace.tsx` 是视频编辑工作区的数据和布局容器：

- 使用 `editorProjectReducer` 持有媒体、时间线片段、画布比例和草稿表格状态。
- 上半部分依次为 `FunctionPanel`、`PlayerPanel` 和 `ParameterPanel`。
- 下半部分为横跨三个上方区域的 `Timeline`。
- 统一记录并在卸载时释放导入媒体产生的 `blob:` URL。

内部组件职责：

- `FunctionPanel`：功能分类、媒体导入、素材预览和“添加到时间线”。
- `PlayerPanel`：当前片段预览、播放控制和画布比例切换。
- `ParameterPanel`：参数区占位，当前内容保持空白。
- `Timeline`：时间线片段选择和草稿表格编辑。
- `editorProject.ts`：编辑项目类型、初始状态、纯 reducer 和活动素材选择器。

## 数据流与生命周期

工作台导航状态和视频编辑状态彼此独立：

```text
workspaceNavigationReducer
└─ activeMenu + smartEditPage

editorProjectReducer
└─ assets + clips + activeClipId + aspectRatio + draftRows
```

### 导航数据流

```text
Sidebar 点击菜单
→ WorkspaceView.handleSidebarItemSelect
→ workspaceNavigationReducer
→ 重新计算 workspaceContent
→ 显示空白页、草稿页或编辑器页
```

`workspaceNavigationReducer` 只处理一级菜单和智剪内部页面，不持有播放器或时间线数据。选择“首页”或“小说推文”时会把 `smartEditPage` 恢复为 `draft-list`。

### 视频编辑数据流

```text
FunctionPanel / PlayerPanel / Timeline 触发事件
→ VideoEditorWorkspace 将事件转换为 editorProject action
→ editorProjectReducer 生成新的项目状态
→ props 向下更新功能区、播放器和时间线
```

典型媒体链路：

1. `FunctionPanel` 选择本地视频并创建预览 URL。
2. `VideoEditorWorkspace` 记录 URL，并派发 `assets/imported`。
3. 视频元数据可读时派发 `asset/ready`；解码或预览失败时派发 `asset/failed`。
4. 用户点击“添加”后派发 `timeline/assetAdded`，素材才会生成片段并成为播放器活动素材。
5. 用户选择其他片段时派发 `timeline/clipSelected`，播放器根据 `selectActiveAsset` 切换视频。

### 页面生命周期

主要页面流程：

1. 登录后挂载总工作区，默认显示首页空白页。
2. 开发环境点击“智剪”，显示草稿页。
3. 点击“新建草稿”，挂载新的 `VideoEditorWorkspace` 和新的编辑状态。
4. 导入媒体只进入素材区；点击“添加”后才创建时间线片段并进入播放器。
5. 返回草稿或离开智剪时卸载视频编辑工作区，reducer 状态和媒体预览地址一并清理。

当前草稿仍是临时状态，没有写入磁盘或数据库。`blob:` URL 不能作为以后草稿持久化的数据格式；实现真实草稿保存时应保存文件路径或稳定的素材 ID。

## 样式归属

- `App.css`：登录页、全局提示和当前空白页面样式。
- `Layout.css`：登录后左、中、右三栏布局。
- 各顶层组件目录中的同名 CSS：对应组件样式。
- `Timeline.css`：时间线与草稿表格样式。
- `VideoEditorWorkspace.css`：当前仍包含视频编辑工作区布局以及功能区、播放器、参数区的内部样式。

`VideoEditorWorkspace.css` 的内部样式拆分尚未进行。后续拆分时应分别建立 `FunctionPanel.css`、`PlayerPanel.css` 和 `ParameterPanel.css`，但不能借机改变现有视觉效果。

React 组件文件和导入路径必须保持完全一致的 PascalCase 大小写；CSS 选择器继续使用小写 kebab-case。大小写不一致会在 TypeScript 中触发 `TS1261`。

## 测试现状

- `tests/editor-project.test.mjs` 和 `tests/workspace-navigation.test.mjs` 会实际执行 reducer，验证状态转换。
- `tests/workspace-layout.test.mjs` 验证总工作区与视频编辑工作区的组件边界。
- `tests/workspace-player.test.mjs` 验证功能区、播放器、比例菜单和媒体链路的源码契约。
- `tests/workspace-timeline.test.mjs` 验证时间线和草稿表格的源码契约。

当前部分界面测试通过正则匹配源码和 CSS，能够保护既定结构，但不能代替真实挂载、点击、播放和卸载测试。拆组件或移动 CSS 前，应先调整对应测试，避免把文件位置误当成用户行为。

## 开发约束

- 修改视频编辑器时，不得连带调整菜单栏、AI 区域或外层三栏布局。
- 智剪功能在开发完成前继续由 `import.meta.env.DEV` 控制。
- 媒体导入和播放器之间通过 `VideoEditorWorkspace` 的受控状态通信，不在子组件中建立第二份项目状态。
- `crypto.randomUUID()` 在组件事件或初始化阶段生成，不放入纯 reducer。
- 不引入 Redux、Zustand 或 Context，除非现有 reducer 和显式 props 已经无法维持清晰边界。
- 保持改动范围集中，不进行全仓格式化或无关文件重命名。

## 常用命令

```bash
# 启动 Electron 开发环境
npm run dev

# 运行全部测试
npm test

# 仅报告 lint 错误
npm run lint -- --quiet

# 检查主进程、preload 和 renderer 类型
npm run typecheck

# 类型检查并生成生产构建
npm run build

# 检查 Git 差异中的空白错误
git diff --check
```

提交前至少执行 `npm test`、`npm run lint -- --quiet`、`npm run typecheck` 和 `git diff --check`。涉及构建配置、Electron 入口或组件路径调整时，再执行 `npm run build`。

## 后续结构调整顺序

当前建议按以下顺序继续整理，避免同时改变结构和行为：

1. 将源码正则测试逐步替换为真实组件交互测试。
2. 把 `VideoEditorWorkspace.css` 中的子面板样式移回各自组件。
3. 拆分 `PlayerPanel` 的视频播放逻辑与画布比例菜单。
4. 集中管理媒体检测和 Object URL 生命周期。
5. 实现真实时间线前扩充 clip 的轨道、起止时间和裁剪区间模型。
6. 实现草稿持久化时增加项目加载与保存边界。
