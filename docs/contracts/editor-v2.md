# Editor V2 退役说明

> 状态：历史记录
> 原适用范围：`src/renderer/src/components/SmartEdit/VideoEditorWorkspace/`
> 退役日期：2026-08-15

内置“智剪”页面、Editor V2、多轨时间线、内部工程状态和编辑器专用 Agent 工具已经从当前产品中移除。

后续剪辑执行面向剪映 5.9 固定版本，通过 Main 进程中的受控业务适配器完成。新的剪映工具不得复用已退役的 `EditorProjectState`、`EditorCommand`、`get_editor_context` 或 `propose_editor_plan` 契约。

历史实现、审计和计划仍可在 `docs/editor-v2/`、`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 中追溯，但不代表当前实现或未来目标。
