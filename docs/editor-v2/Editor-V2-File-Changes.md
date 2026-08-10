# Editor V2 文件变更清单

## 新增核心层

```text
core/editorCoordinate.ts
core/editorPlacementPolicy.ts
core/editorService.ts
interaction/editorInteractionController.ts
playback/editorPlaybackController.ts
playback/useEditorPlayback.ts
timeline/useVideoThumbnailStrip.ts
timeline/VideoThumbnailStrip.tsx
```

## 重点重构

```text
VideoEditorWorkspace.tsx
Timeline.tsx
VideoPlayback.tsx
CompositionPreview.tsx
FunctionPanel.tsx
ParameterPanel.tsx
PlayerPanel.tsx
editorProject.ts
editorCommands.ts
editorHistory.ts
editorAgentApi.ts
mediaLibrary.ts
```

## UI 视觉重构

```text
VideoEditorWorkspace.css
Timeline.css
CompositionPreview.css
FunctionPanel.css
ParameterPanel.css
PlayerPanel.css
EditorContextMenu.css
```

## 新增专项测试

```text
tests/editor-v2-history.test.ts
tests/editor-v2-placement.test.ts
tests/editor-v2-coordinate.test.ts
tests/editor-v2-interaction.test.ts
tests/editor-v2-playback.test.ts
```

## 兼容策略

没有一次性把 Editor 全部搬到新的顶级目录，也没有删除现有 Low-level Commands / Agent Registry / Composition Selector。新层通过 Facade 逐步接管高层规则，降低覆盖当前主仓库后的 import 冲突和返工风险。
