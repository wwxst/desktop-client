# Editor V2 目录规则

> 状态：当前路径规则
> 适用范围：本目录及其 `core/`、`interaction/`、`playback/`、`timeline/` 子目录

- Project 状态只能由 `editorHistoryReducer` 持有；面板组件通过 props、回调和 controller 协作。
- 新的放置、移动、删除、分割、粘贴行为优先使用 `core/editorService.ts`，碰撞和建层规则集中在 `core/editorPlacementPolicy.ts`。
- `editorCommands.ts` 是低层兼容层；不要在 UI、Agent、Workflow 中复制一套相同的放置规则。
- Playback controller 和 interaction controller 不能通过每帧修改整个 Project 状态。
- 预览尺寸和 DOM 坐标必须经过工程坐标映射；不要把 CSS 像素直接持久化到 Clip。
- 导入媒体的检测、取消和 Object URL 释放统一由 media library 管理。
- 变更编辑器行为时先更新对应契约测试，再更新 `docs/contracts/editor-v2.md`；旧测试与 V2 契约冲突时保留 V2 行为。
