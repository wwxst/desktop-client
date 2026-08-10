# 当前架构

> 状态：当前事实
> 适用范围：Electron 应用、Renderer 工作区和 Editor V2
> 事实来源：`src/main`、`src/preload`、`src/shared`、`src/renderer/src` 与对应测试
> 最近验证：`74cd55b` / 2026-08-10

## 总体边界

```text
React Renderer
  -> window.api (allowlist)
Preload / contextBridge
  -> ipcRenderer.invoke / ipcRenderer.on
Electron Main
  -> 本地 TTS、Agent 工作流、登录和订阅请求
Java 后端
  -> 当前开发地址 http://localhost:8080
```

### Main

`src/main/index.ts` 创建窗口、管理 Electron 生命周期、注册认证/订阅 IPC，并加载 TTS 和 Agent IPC。登录 Token 只保存在 Main 进程内存，不返回给 Renderer。

### Preload

`src/preload/index.ts` 通过 `contextBridge` 暴露 `window.api`。`src/preload/index.d.ts` 是 Renderer 使用的类型契约。页面不能获得完整 `ipcRenderer`，也不能直接访问文件系统或原生模块。

### Renderer

Renderer 负责 React 页面、总工作区、TTS/插件界面和视频编辑器界面。视频编辑器当前运行在 Renderer 中，项目草稿和媒体预览仍是工作区生命周期内的临时状态；真实项目保存、加载和编辑器媒体文件 IPC 尚未实现。

## Renderer 工作区

```text
App
└─ WorkspaceView                 总工作区导航和页面切换
   ├─ Layout / Sidebar / AiPanel
   └─ SmartEditDraftView
      └─ SmartEditEditorView
         └─ VideoEditorWorkspace   视频编辑器内部状态和布局
            ├─ FunctionPanel
            ├─ PlayerPanel / VideoPlayback / CompositionPreview
            ├─ ParameterPanel
            └─ Timeline
```

`WorkspaceView` 的 `workspaceNavigationReducer` 只管理一级菜单和智剪页面状态。`VideoEditorWorkspace` 通过 `editorHistoryReducer` 管理编辑项目状态。两者不共享第二份导航或项目状态，也不能由编辑器内部直接修改外层菜单和布局。

## Editor V2 状态分层

| 状态 | 当前实现 | 责任 |
| --- | --- | --- |
| 项目状态 | `editorProject.ts` + `editorHistory.ts` | assets、tracks、clips、activeClipId、兼容 playhead 字段、画布比例和草稿表格 |
| 编辑命令 | `editorCommands.ts` | 校验并应用低层 Command，保留 V1/Agent 兼容 |
| 编辑服务 | `core/editorService.ts` | 放置、移动、删除、更新、分割、粘贴等高层动作 |
| 放置规则 | `core/editorPlacementPolicy.ts` | 碰撞检测、复用/新建轨道、磁吸删除和批量放置规划 |
| 播放运行态 | `playback/editorPlaybackController.ts` | playhead、播放、循环、主音量和 animation-frame 时钟 |
| 交互运行态 | `interaction/editorInteractionController.ts` | idle、拖动、空格手势和 pointer ownership |
| Agent 适配 | `editorAgentApi.ts` | 低层命令兼容及推荐的 Service 能力 |

播放时钟和交互控制器是运行时状态，当前播放器以 Playback Controller 的 playhead 为准；Project 中保留的 playhead 字段属于兼容模型，不应通过每帧 dispatch 整个项目 reducer。新的用户或 Agent 编辑动作应尽量通过 EditorService 形成事务；一次事务对应一次 Undo Step。

## 媒体和生命周期

1. `FunctionPanel` 将本地文件交给 `useMediaLibrary`。
2. 媒体库创建 Object URL、派发导入状态并启动检测。
3. 检测成功派发 `asset/ready`，检测或播放失败派发 `asset/failed`。
4. 只有用户执行“添加到时间线”或拖入时间线时，素材才生成 Clip。
5. 工作区卸载时取消未完成检测并释放 Object URL；同一 URL 只能释放一次。

## 当前非目标

- 编辑器草稿尚未写入磁盘或数据库。
- 编辑器尚未通过 Main/Preload 提供“显示文件夹内容”或“从项目移除文件”的 IPC。
- 完整 Ripple Insert/Ripple Trim、音频波形、字幕、关键帧和复杂转场不属于当前已实现边界。

## 代码定位

- Electron 入口：`src/main/index.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`
- 共享契约：`src/shared/auth.ts`、`src/shared/tts.ts`、`src/shared/agent/workflow.ts`
- 总工作区：`src/renderer/src/components/Workspace/WorkspaceView.tsx`
- Editor V2：`src/renderer/src/components/SmartEdit/VideoEditorWorkspace/`
