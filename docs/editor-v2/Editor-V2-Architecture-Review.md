# Editor V2 当前仓库架构审计

> 仓库：`https://github.com/wwxst/desktop-client`
>
> 审计基线：当前 `main`
>
> 目标：为《desktop-client 视频编辑器交互与界面完整重构计划-完整版.md》正式实施确定“保留 / 拆分 / 迁移 / 重写”边界。

---

## 1. 当前结论

当前仓库已经不是最初的“只有素材列表 + 简单播放器”版本。

最新 `main` 实际已经具备以下 V1 地基：

- `editorProject.ts`
- `editorClipMath.ts`
- `editorCommands.ts`
- `editorHistory.ts`
- `editorAgentApi.ts`
- `CompositionPreview.tsx`
- `VideoEditorWorkspace.tsx`
- 多轨 Timeline
- Clip Move / Trim / Split / Delete / Duplicate
- Track Lock / Hide / Mute
- Project Composition Preview
- Undo / Redo
- Agent API

因此 V2 **不应推翻重写这些能力**。

正确路线是：

```text
保留数据模型和低层 Command
        ↓
拆 Project / Media / UI / Playback 状态
        ↓
增加 Editor Service / Placement Policy
        ↓
统一 Interaction Controller
        ↓
Timeline / Canvas 改为 Service 的 UI Adapter
        ↓
Agent 与人工共用 Service
```

---

# 2. 当前架构

当前核心调用链：

```text
VideoEditorWorkspace
│
├── useReducer(editorHistoryReducer)
│
├── useMediaLibrary()
│
├── execute(EditorCommand)
│
├── executeBatch(EditorCommand[])
│
├── Agent API
│
├── FunctionPanel
│
├── PlayerPanel
│   └── VideoPlayback
│       └── CompositionPreview
│
├── ParameterPanel
│
└── Timeline
```

其中：

```text
EditorProjectState
=
assets
+ tracks
+ clips
+ activeClipId
+ playhead
+ timelineZoom
+ aspectRatio
+ draftRows
```

问题是：

> 工程数据、媒体运行数据、UI状态、播放状态还混在同一个 Project 里。

---

# 3. 当前 Editor Project

现有模型已经包含：

```text
MediaAsset
TimelineClip
ResolvedTimelineClip
EditorTrack
CanvasAspectRatio
TimelineComposition
```

Clip 已有：

```text
trackId
timelineStart
duration
sourceStart
sourceEnd
transform
opacity
volume
muted
speed
```

这部分 **保留**。

原因：

它已经覆盖 V2 基础剪辑的核心数据，不需要重新发明。

---

# 4. 当前 Track 问题

现在：

```text
EditorTrackKind =
video
audio
text
overlay
```

默认轨道：

```text
V2
V1
A1
```

这和我们最终确定的 UX 不一致。

用户不应该理解：

```text
V1 / V2 / A1
```

V2 建议内部逐步收敛为：

```text
visual
audio
```

再用：

```text
role: main
```

表达主内容层。

但为了降低一次迁移风险：

**第一轮不直接删除旧 kind。**

建立兼容函数：

```text
isVisualLayer()
normalizeTrackKind()
```

UI 完全隐藏 V1/V2/A1。

后续 Project Schema 升级时再正式收敛。

---

# 5. 当前 Command 系统

现有 `editorCommands.ts` 已经比较完整：

```text
clip/addAsset
clip/delete
clip/move
clip/trim
clip/split
clip/update
clip/duplicate
track/update
canvas/setAspectRatio
```

并且已有：

```text
EditorCommandResult
EditorBatchCommandResult
EditorExecutionCode
```

这一层 **必须保留**。

它适合作为：

> Low-level Editor Command

而不是继续让 Timeline / Agent 直接使用它完成所有高层业务规则。

---

# 6. 当前 Command 的核心缺口

现在 `clip/move` 主要校验：

```text
Clip 存在
Track 存在
Track 未锁定
素材类型兼容
```

但没有统一解决：

```text
是否碰撞
是否自动创建视觉层
主轨如何插入
空层何时回收
多 Clip 移动策略
```

这些逻辑如果继续放 Timeline / Workspace：

```text
人工操作 ≠ Agent操作
```

所以 V2 必须增加：

```text
EditorPlacementService
EditorPlacementPolicy
```

---

# 7. 当前 History

现在 History：

```text
past
present
future
```

Command 可以正常 Undo / Redo。

问题：

媒体动作：

```text
assets/imported
asset/ready
asset/failed
```

会：

```text
past = []
future = []
```

也就是说：

> 导入一个素材可能清空此前所有剪辑撤销历史。

这是 V2 P0。

---

# 8. V2 History 目标

拆成：

```text
ProjectDocumentState
MediaRuntimeState
EditorUIState
PlaybackState
HistoryState
```

Undo 只记录：

```text
ProjectDocumentState
```

媒体解码完成：

```text
不进入 Undo
也不清空 Undo
```

播放头移动：

```text
不进入 Undo
```

时间线 Zoom：

```text
不进入 Undo
```

选中状态：

```text
不进入 Undo
```

---

# 9. 当前 Agent API

当前已有：

```text
getProjectSnapshot
getCapabilities
execute
executeBatch
undo
redo
```

并通过轻量注册中心：

```text
registerEditorAgentApi()
getActiveEditorAgentApi()
```

这是正确方向。

**V2 保留。**

---

# 10. Agent V2 的变化

当前 Agent：

```text
Agent
↓
Low-level Command
```

V2：

```text
Agent
↓
Editor Service
↓
Placement Policy
↓
Transaction
↓
Low-level Command
```

新增高层能力：

```text
placeAsset()
moveClips()
deleteClips()
paste()
fitClipToCanvas()
fillClipToCanvas()
setTransform()
```

Agent 不需要知道：

```text
应该创建哪条 Layer
应该先删空 Layer 还是后删
碰撞以后应该换到哪里
```

这些由 Service 统一处理。

---

# 11. 当前 Timeline

现有 Timeline 已经有：

- 多 Track
- 横向 Clip Move
- Y 轴 Track 判断
- Trim
- Split
- Delete
- Zoom
- Playhead
- Undo / Redo Toolbar
- Track Lock / Hide / Mute
- 基础跨轨拖动

这部分不应全部推倒。

---

# 12. Timeline 当前问题

当前交互主要靠：

```text
Timeline.tsx
内部 useState
+
window pointermove
+
window pointerup
```

自己维护：

```text
DragState
```

以后再加入：

- Box Select
- Pan
- Playhead Scrub
- External Drop
- Multi Drag
- Snap
- Ghost
- Auto Scroll

Timeline 会继续膨胀。

所以 V2 必须把：

```text
交互状态
```

移出纯 View。

---

# 13. Interaction 问题

已经存在 `editorInteraction.ts` 的 helper：

```text
Drag Threshold
Edge Auto Scroll
isTextEditingTarget
```

这是好地基。

但当前还没有真正：

```text
EditorInteractionController
```

Timeline、Canvas、Playback 仍会分别持有自己的 Pointer State。

这是 Space、Esc、Pan、Drag 冲突的根源。

---

# 14. V2 Interaction 目标

建立：

```text
EditorInteractionController
```

统一：

```text
idle
box-selecting
moving-clip
trimming-left
trimming-right
scrubbing-playhead
panning-timeline
moving-canvas-item
scaling-canvas-item
rotating-canvas-item
external-drag
```

规则：

```text
一次只允许一个 active interaction
```

并统一：

```text
begin()
update()
commit()
cancel()
```

---

# 15. 当前 Playback

现有新版播放器已经：

```text
project
↓
selectCompositionAtTime()
↓
CompositionPreview
```

所以：

> 已经不是纯 activeClip 播放器。

这部分方向正确，保留。

---

# 16. Playback 当前问题

播放时：

```text
requestAnimationFrame
↓
onPlayheadChange
↓
Project reducer
↓
Workspace render
```

也就是播放 60fps 时，可能 60 次/秒修改整个 Project。

这在少量 Clip 时能跑。

未来：

```text
100 Clip
300字幕
波形
多层
```

会明显放大 React 压力。

---

# 17. V2 Playback 目标

建立独立：

```text
PlaybackController
```

持有：

```text
playhead
isPlaying
rate
loop
volume
```

Project 不再保存高频播放位置。

Project 只保存真正工程内容。

需要保存播放位置时：

```text
显式 snapshot
```

而不是每帧更新。

---

# 18. 当前 Composition Preview

现有：

```text
selectCompositionAtTime()
```

会按照当前时间筛选可见 Clip。

这是正确的 Core Selector。

保留。

当前 CompositionPreview 已支持：

```text
多个 video layer
audio layer
speed
mute
volume
source time sync
```

继续复用。

---

# 19. Composition Preview 当前问题

Transform 当前主要直接使用：

```text
translate(px)
scale
rotate
```

也就是说：

> Transform X/Y 仍接近“预览 DOM 像素”。

V2 必须引入工程坐标。

---

# 20. Canvas Coordinate V2

定义工程画布：

```text
canvasWidth
canvasHeight
```

例如：

```text
9:16
→ 1080 × 1920
```

存储：

```text
x/y = project coordinate
```

渲染：

```text
Project Coordinate
↓
Viewport Scale
↓
Screen Coordinate
```

这样：

```text
预览缩放
窗口大小
全屏
导出
模板
Agent
```

全部一致。

---

# 21. 当前 Media Library

现有媒体链路：

```text
File
↓
URL.createObjectURL
↓
video metadata detection
↓
assets/imported
↓
asset/ready
```

这部分可以保留。

---

# 22. Media V2 的变化

媒体资产不能继续作为 Undo History 的一部分。

改为：

```text
MediaLibraryState
```

负责：

```text
asset metadata
object URL lifecycle
thumbnail cache
runtime decode state
```

Project Clip 只引用：

```text
assetId
```

---

# 23. DraftRow 必须迁出 Editor Core

当前：

```text
EditorProjectState
```

里面还有：

```text
draftRows
```

这是小说推文业务旧表格数据。

注释本身也写着：

> 后续迁到 workflow 层。

V2 正式把它视为：

```text
Workflow State
```

不是 Editor Core。

为了兼容旧测试：

第一轮可以继续读取。

但 Editor 新模块不得依赖它。

---

# 24. 当前 ParameterPanel

ParameterPanel 已经接 Clip：

```text
transform
opacity
speed
volume
mute
```

这部分功能可以保留。

需要重构的是：

```text
UI Style
Preview / Commit
Number Scrub
Fit / Fill
Reset
```

不是重新写基础字段。

---

# 25. 当前 Panel Layout

当前已经使用：

```text
react-resizable-panels
```

左右区、时间线上下高度都能调整。

因此 V2 不需要重造 Resizer。

只需要增加：

```text
Layout Preference Persistence
```

保存用户上次布局。

---

# 26. 当前测试基础

仓库已有：

```text
editor-commands.test.ts
editor-history.test.ts
editor-project.test.ts
editor-agent-api.test.ts
editor-clip-math.test.ts
composition-selector.test.ts
timeline.test.tsx
player-panel.test.tsx
video-playback.test.tsx
function-panel.test.tsx
media-library.test.ts
```

说明：

> 当前 V1 已经有较完整的基础回归测试。

V2 要在此基础上增加 Interaction / Service / Canvas 测试。

---

# 27. 这次不应该做的事情

不要：

1. 把现有 `editorCommands.ts` 全部删除重写。
2. 重做 `resolveTimelineClip()`。
3. 重做 Source Range 算法。
4. 删除 Agent API。
5. 放弃 Composition Selector。
6. 重造 react-resizable-panels。
7. 把 Timeline 完全重写成另一个互不兼容的项目。

---

# 28. 这次应该做的事情

真正需要新增的层：

```text
Editor Service
Placement Policy
Interaction Controller
Playback Controller
Coordinate System
Selection Store
Clipboard Service
UI Preferences
Thumbnail Strip Service
```

---

# 29. 推荐 V2 模块结构

为了减少一次性 import path 大迁移，建议先放：

```text
VideoEditorWorkspace/
│
├── core/
│   ├── editorDocument.ts
│   ├── editorService.ts
│   ├── editorPlacementPolicy.ts
│   ├── editorTransaction.ts
│   └── editorCoordinate.ts
│
├── interaction/
│   ├── editorInteractionController.ts
│   └── editorShortcuts.ts
│
├── playback/
│   └── usePlaybackController.ts
│
├── timeline/
│   ├── TimelineClipView.tsx
│   ├── TimelineRuler.tsx
│   ├── timelineGeometry.ts
│   └── thumbnailStrip.ts
│
├── canvas/
│   ├── EditorCanvas.tsx
│   ├── CanvasTransformBox.tsx
│   └── canvasGeometry.ts
│
└── ui/
    ├── EditorContextMenu.tsx
    └── editorDesignTokens.css
```

旧文件可以先做 Facade。

待 V2 稳定后再决定是否把整个 Editor 提升到：

```text
src/renderer/src/editor/
```

避免一次性迁移路径造成大量无意义冲突。

---

# 30. 架构评分

当前仓库 V1 地基：

| 模块 | 当前 |
|---|---:|
| Project Model | 80% |
| Clip Math | 90% |
| Low-level Commands | 85% |
| History | 65% |
| Agent API | 80% |
| Timeline Core | 70% |
| Composition Preview | 75% |
| Interaction Architecture | 40% |
| Playback Architecture | 50% |
| Canvas Coordinate | 30% |
| UX / Timeline Feel | 45% |
| Performance Foundation | 40% |

当前不是从 0 开始。

正确理解是：

> **Core 已有约 70% 地基，真正欠缺的是 Service / Interaction / Coordinate / Playback 分层和成熟 UX。**

---

# 31. V2 重构原则定版

最终调用链：

```text
Human UI
Toolbar
Keyboard
Context Menu
Timeline Drag
Canvas Drag
           ┐
           │
Agent ─────┼──> Editor Service
Workflow ──┘         │
                     ├── Placement Policy
                     ├── Collision Policy
                     ├── Transaction
                     └── Coordinate Rules
                            │
                            ▼
                     Low-level Command
                            │
                            ▼
                     Project Document
                            │
                            ▼
                         History
```

高频运行状态：

```text
Playback
Selection
Interaction
Panel Layout
Media Decode
```

不再全部塞进 Project Document。

---

# 32. 阶段一审计结论

**可以进入正式代码重构。**

但不是：

> “再造一个新 Editor”。

而是：

> **把现有 V1 的低层核心保住，在它上面补齐现代桌面编辑器真正缺失的中间层。**

这会比推翻重写风险更低，也更符合当前仓库实际状态。
