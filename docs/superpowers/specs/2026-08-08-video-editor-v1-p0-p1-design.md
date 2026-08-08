# 视频编辑器 V1 P0/P1 修复设计

## 目标

在不推倒现有 `VideoEditorWorkspace` 架构的前提下，修复 Editor Core 的 Clip 数据边界和重复素材实例化问题，补齐 Timeline 的跨轨拖动，并把播放器升级为由工程播放头驱动的 Composition Preview。人工操作、Agent、模板和后续 Workflow 继续共用同一套 Editor Command。

本轮不实现图片/音频正式导入、字幕/文本编辑、关键帧、转场、滤镜、磁性时间线、Ripple Delete、自动字幕、TTS 接入、工程保存和 FFmpeg 导出。

## 方案选择

采用增量加固现有架构：保留 `editorProject`、`editorCommands`、`editorHistory`、`Timeline` 和 `PlayerPanel` 的现有边界，新增纯函数的 Clip 数学与 Composition selector，并将预览渲染拆到 `CompositionPreview`。这样可以最大限度保留当前 V1 的导入、选择、分割、删除、参数、比例和历史行为。

不采用重做 State/Player 的方案，因为它会扩大历史和 UI 回归范围；也不采用只在 UI 层限制的方案，因为 Core 和 Agent 仍可能写入非法数据。

## Core 数据与命令

### Clip 时间不变量

新增 `editorClipMath.ts`：

- `normalizeSourceRange({ sourceStart, sourceEnd, assetDuration, minDuration })` 统一限制入点、出点和最小时长。
- 有效媒体时长小于 `MIN_CLIP_DURATION` 时使用真实时长；时长小于等于零的媒体不能创建 Clip。
- 左裁剪辅助函数同时考虑源素材 0 秒和时间线 0 秒。
- `canMoveClipToTrack(assetKind, targetTrackKind)` 统一轨道兼容规则。

`resolveTimelineClip`、`clip/trim`、`clip/update`、`clip/split` 和旧数据读取都经过同一套归一化逻辑。所有写入的 `timelineStart` 均不小于 0，`duration` 按 `(sourceEnd - sourceStart) / speed` 重算，速度限制为 `0.1..8`。

### 重复 Asset 实例

`clip/addAsset` 只拒绝重复 `clipId`，每次生成新的 Clip 实例。兼容 Action `timeline/assetAdded` 不再按 `assetId` 去重，并通过唯一 ID 工厂生成 Clip；新 UI 只使用 Command 入口。

### 统一执行结果

`applyEditorCommand` 和批量执行共享 `EditorExecutionResult`：

```ts
interface EditorExecutionResult {
  state: EditorProjectState
  success: boolean
  changed: boolean
  code:
    | 'OK'
    | 'NOT_FOUND'
    | 'INVALID_RANGE'
    | 'TRACK_LOCKED'
    | 'INCOMPATIBLE_TRACK'
    | 'NO_CHANGE'
  message?: string
  command?: EditorCommand
}
```

History 只记录 `changed === true` 的结果。`EditorAgentApi.execute` 和 `executeBatch` 返回同一结果类型，不直接暴露 React state。

## Timeline

拖动状态增加 `startClientY`、`previewTrackId` 和有效性标志。每条 Track Row 标记 `data-track-id`，通过其 DOM `getBoundingClientRect()` 根据指针 Y 坐标查找目标轨道。X 坐标继续换算为时间并按现有 0.1 秒规则吸附。

跨轨预览同时检查当前轨道、目标轨道的锁定状态和素材类型兼容性：有效目标标记 `data-drop-target="true"`，无效目标标记 `data-drop-invalid="true"`；无效 Pointer Up 不提交 Command。有效 Pointer Up 传回 `(clipId, timelineStart, trackId)`，一次拖动只产生一个 History Step。

左裁剪使用 `max(-sourceStart / speed, -timelineStart)` 作为最小 Delta，右裁剪不能越过源素材时长；预览值和提交给 Core 的值完全一致。

## Composition Preview

新增 `selectCompositionAtTime(project, time)`，返回：

```ts
interface TimelineComposition {
  time: number
  videoLayers: ResolvedTimelineClip[]
  audioLayers: ResolvedTimelineClip[]
}
```

selector 只返回 `timelineStart <= time < timelineStart + duration` 且轨道未隐藏的 Clip；音频层额外排除静音轨道和静音片段。同一轨道发生重叠时按 clips 数组后加入者优先。视频层按轨道从底到顶排序，V1 先渲染、V2 后渲染。

`PlayerPanel` 传递完整项目数据，`CompositionPreview` 负责 DOM media layer（当前 V1 只要求视频层；音频层保留 selector 和媒体控制接口）。`activeClipId` 只用于编辑选中，不参与画面选择。每个可见 Layer 使用 Clip 的 `sourceStart/sourceEnd/speed/transform/opacity/volume/muted` 映射到对应媒体元素。

播放采用工程时钟：`requestAnimationFrame` 推进 project playhead，按 playhead 重新计算 composition，并把每个媒体元素 seek 到其源素材时间；达到 `getProjectDuration(project)` 后停止。播放器时间显示使用工程总时长，播放可连续跨越同轨多个 Clip。

## 测试与验收

- `tests/editor-commands.test.ts`：重复 Asset、时间范围、速度重算、轨道兼容/锁定、split 连续性和结构化结果。
- `tests/editor-project.test.ts`：兼容 Action 重复实例和旧数据归一化。
- `tests/timeline.test.tsx`：左右裁剪边界、Y 到 Track、无效/锁定目标不提交、有效跨轨提交。
- `tests/function-panel.test.tsx`：同一 ready 素材可连续点击添加，非 ready 仍禁用。
- `tests/video-playback.test.tsx` 或 `player-panel.test.tsx`：playhead 选择 composition、跨 Clip、hidden、层级、transform/opacity、工程总时长。

每个新增行为遵循 TDD 的 Red-Green-Refactor：先写并运行会因缺失行为而失败的测试，再写最小实现，最后运行受影响测试和全量验收。

最终验收命令：

```text
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

并检查重复添加、横向拖动、V1/V2 跨轨、左右裁剪、分割、删除、参数更新、播放、Undo/Redo 的人工回归。
