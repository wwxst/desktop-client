# Editor V2 重构迁移地图

> 目标：明确当前文件在 V2 中如何处理，避免“改着改着同一职责出现两套实现”。

---

## 1. 总原则

状态分为五类：

```text
Project Document
Media Runtime
Playback Runtime
Interaction / Selection
UI Preferences
```

只有 Project Document 进入 Undo / Redo。

---

# 2. 当前文件迁移表

| 当前文件 | V2处理 | 目标 |
|---|---|---|
| `editorProject.ts` | 保留 + 拆职责 | Project Document / Selectors |
| `editorClipMath.ts` | 保留 | Clip Range Math |
| `editorCommands.ts` | 保留为 Low-level Command | Command Core |
| `editorHistory.ts` | 重构 | 只记录 Project Document |
| `editorAgentApi.ts` | 保留 + 升级 | Agent → Editor Service |
| `mediaLibrary.ts` | 保留 + 解耦 | Media Runtime |
| `useMediaLibrary.ts` | 重构 | 不直接写 Project History |
| `Timeline.tsx` | 大拆 | View + Interaction Adapter |
| `Timeline.css` | 大改 | 新时间线视觉 |
| `VideoPlayback.tsx` | 重构 | Playback Controller 驱动 |
| `CompositionPreview.tsx` | 保留 + Coordinate Upgrade | Composition Renderer |
| `PlayerPanel.tsx` | 重构 | Canvas Shell |
| `ParameterPanel.tsx` | 保留功能 + UX重构 | Inspector |
| `FunctionPanel.tsx` | 重构 | Media Library / Drag Source |
| `VideoEditorWorkspace.tsx` | 重构为 Orchestrator | Service / Runtime 装配 |
| `VideoEditorWorkspace.css` | 重做视觉层级 | Editor Layout |
| `DraftRow` / draft actions | 逐步迁出 | Workflow 层 |

---

# 3. editorProject.ts

## 保留

```text
MediaAsset
TimelineClip
ResolvedTimelineClip
ClipTransform
EditorTrack
CanvasAspectRatio
resolveTimelineClip
createTimelineClipFromAsset
getProjectDuration
selectCompositionAtTime
```

## 从 Project 中迁出

```text
playhead
timelineZoom
activeClipId
```

最终进入：

```text
Playback Runtime
Timeline UI State
Selection State
```

第一轮为了兼容：

可以保留字段。

但新代码不再依赖这些字段作为唯一真相。

## 迁出业务数据

```text
draftRows
```

目标：

```text
Novel / Workflow State
```

---

# 4. editorCommands.ts

定位调整：

现在：

```text
UI / Agent 直接 Command
```

V2：

```text
Editor Service
↓
Low-level Command
```

继续保留：

```text
clip/add
clip/addAsset
clip/delete
clip/move
clip/trim
clip/split
clip/update
clip/duplicate
track/add
track/delete
track/update
canvas/setAspectRatio
```

如果上一版已有 `track/add/delete`，继续使用。

---

# 5. 新增 Editor Service

新增：

```text
core/editorService.ts
```

接口建议：

```ts
interface EditorService {
  placeAsset(...)
  moveClip(...)
  moveClips(...)
  trimClip(...)
  splitClip(...)
  deleteClips(...)
  duplicateClips(...)
  paste(...)
  fitClip(...)
  fillClip(...)
  setClipTransform(...)
}
```

内部：

```text
Placement Policy
Collision
Auto Layer
Transaction
Cleanup
```

UI 和 Agent 都只调用这里。

---

# 6. 新增 Placement Policy

新增：

```text
core/editorPlacementPolicy.ts
```

统一解决：

```text
目标层
碰撞
自动建层
主内容插入
视觉 Z-order
空层回收
```

禁止继续：

```text
Timeline 自己算碰撞
Workspace 又算一遍
Agent 完全不算
```

---

# 7. editorHistory.ts

旧行为：

```text
assets/imported
asset/ready
asset/failed
→ clear history
```

删除。

目标：

```text
Media Runtime Update
≠
Project History Update
```

History 只接受：

```text
Command
Transaction
```

UI State：

不写 History。

---

# 8. mediaLibrary.ts / useMediaLibrary.ts

目标：

```text
Media Library Controller
↓
Media Runtime Store
```

项目文档只需要：

```text
asset metadata snapshot
```

但媒体加载状态：

```text
loading / decode / error / objectURL
```

不应该让 Undo 回滚。

第一轮实现可采用：

```text
non-history project patch
```

避免一次性引入复杂外部状态库。

---

# 9. Timeline.tsx

拆成：

```text
timeline/
├── TimelineView.tsx
├── TimelineToolbar.tsx
├── TimelineRuler.tsx
├── TimelineLayerRow.tsx
├── TimelineClipView.tsx
├── TimelineSelectionBox.tsx
├── TimelineGhostClip.tsx
└── timelineGeometry.ts
```

Timeline 主组件只负责：

```text
布局
可视区域
把 Pointer 输入交给 Interaction Controller
```

---

# 10. Timeline Interaction

新增：

```text
interaction/editorInteractionController.ts
```

Timeline 不再自己维护完整 DragState。

Controller 返回：

```text
preview state
```

PointerUp：

```text
Service Commit
```

Esc：

```text
Controller Cancel
```

---

# 11. Selection

新增：

```text
interaction/editorSelection.ts
```

维护：

```text
selectedClipIds
activeClipId
anchorClipId
```

支持：

```text
single
Ctrl/Cmd toggle
Shift range
box
clear
```

Selection 不进入 Undo。

---

# 12. Clipboard

新增 / 保留：

```text
editorClipboard.ts
```

升级为 Service：

```text
copy
cut
paste
duplicate
```

Paste 通过：

```text
Editor Placement Service
```

而不是自己重复写 collision。

---

# 13. Playback

新增：

```text
playback/usePlaybackController.ts
```

状态：

```text
playhead
playing
rate
loop
masterVolume
```

高频 tick：

```text
ref / external store
```

不更新 Project Reducer。

Timeline 和 Preview 订阅播放时间。

---

# 14. Composition Preview

保留现有：

```text
selectCompositionAtTime
```

增加：

```text
project-coordinate transform
```

不要再：

```text
transform.x px
=
screen px
```

---

# 15. Canvas Coordinate

新增：

```text
core/editorCoordinate.ts
```

至少提供：

```text
getProjectCanvasSize()
projectToViewport()
viewportToProject()
screenDeltaToProjectDelta()
fitRect()
fillRect()
```

---

# 16. Canvas UI

拆：

```text
canvas/
├── EditorCanvas.tsx
├── CanvasMediaLayer.tsx
├── CanvasTransformBox.tsx
├── CanvasSnapGuides.tsx
└── canvasGeometry.ts
```

所有 Transform：

```text
Preview
↓
Project Coordinate
↓
Service Commit
```

---

# 17. FunctionPanel

升级：

```text
素材卡片
+
Drag Source
+
系统文件 Drop
+
Context Menu
```

素材只负责：

```text
Asset
```

不应该自己创建 Clip。

创建 Clip 委托：

```text
Editor Service
```

---

# 18. ParameterPanel

保留现有参数能力。

改成：

```text
Inspector
```

区分：

```text
Preview value
Committed value
```

Slider / Scrub：

鼠标移动中不推 100 次 History。

PointerUp 只提交一次。

---

# 19. Agent API

旧 API：

```text
execute low-level command
```

继续保留，兼容已有 Agent。

增加：

```text
service API
```

例如：

```text
placeAsset
moveClip
deleteClips
fitClip
fillClip
```

最终 Agent 默认走 Service。

---

# 20. AiPanel

当前 AiPanel 保持独立。

不要把模型逻辑塞 Editor。

连接方式：

```text
AiPanel
↓
getActiveEditorAgentApi()
↓
Editor Service
```

保持原 Agent 接口边界。

---

# 21. 文件迁移阶段

## Phase A

不移动现有文件。

新增：

```text
core/
interaction/
playback/
timeline/
canvas/
ui/
```

旧文件变成 Facade。

## Phase B

V2 稳定后：

将通用 Editor 提升：

```text
src/renderer/src/editor/
```

不要现在一次改完所有 import。

---

# 22. 删除计划

第一轮不直接删除旧兼容代码。

标记 Deprecated：

```text
timeline/assetAdded
LegacyVideoPlayback
DraftRow editor dependency
V1/V2/A1 labels
```

等新测试稳定后再删。

---

# 23. 测试迁移

现有测试全部保留。

新增：

```text
editor-service.test.ts
editor-placement-policy.test.ts
editor-interaction-controller.test.ts
editor-selection.test.ts
editor-coordinate.test.ts
playback-controller.test.ts
timeline-drag.test.tsx
timeline-box-selection.test.tsx
canvas-transform.test.tsx
editor-context-menu.test.tsx
```

---

# 24. 最终依赖方向

必须保证：

```text
editorProject
editorClipMath
editorCommands
        ↑
Editor Service / Policy
        ↑
Timeline / Canvas / Agent / Workflow
```

禁止：

```text
Core import React
Core import Timeline
Core import AiPanel
```

---

# 25. 下一步代码实施顺序

```text
1. History 非破坏性 Media Update
2. Editor Service
3. Placement Policy
4. Interaction Controller
5. Selection / Clipboard 接 Service
6. Playback Controller
7. Coordinate System
8. Timeline UI 重构
9. Canvas UI 重构
10. Inspector
11. Agent Service Bridge
12. Performance
13. Tests
```

这就是正式 V2 的迁移地图。
