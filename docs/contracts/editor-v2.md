# Editor V2 契约

> 状态：当前契约
> 适用范围：`src/renderer/src/components/SmartEdit/VideoEditorWorkspace/`
> 事实来源：`editorProject.ts`、`editorCommands.ts`、`core/`、`playback/`、`interaction/` 与 Editor V2 测试
> 最近验证：`16a55be5` / 2026-08-14

## 状态所有权

- `editorHistoryReducer` 持有可撤销的 `EditorProjectState` 以及独立、单调递增的工程 `revision`。revision 是运行边界状态，不写入可撤销的 Project 快照。
- `EditorPlaybackController` 持有当前播放器使用的运行态：playhead、isPlaying、duration、revision 和 animation-frame 时钟；播放到工程末尾后停止，不提供循环播放或预览总音量状态。
- `EditorInteractionController` 持有交互运行态：当前 mode、pointerId、空格手势和 revision。
- 组件通过 props 和回调组合这些状态，不在 `FunctionPanel`、`PlayerPanel`、`Timeline` 中创建第二份项目状态。

## 编辑动作

`EditorService` 当前提供：

- `placeAsset`、`placeAssetsSequential`
- `moveClips`
- `deleteClips`
- `updateClip`
- `splitClip`
- `paste`

这些能力通过 `EditorPlacementPolicy` 规划轨道、碰撞和磁吸行为，再以 `executeTransaction` 提交。低层 `EditorCommand` 仍保留给已有 Agent 和兼容调用，但新自动化不应绕过 Placement Policy 直接拼接移动/放置规则。

AI 面板通过已注册的 `EditorAgentApi` 读取工程快照、当前 revision、选择和播放头。模型只能读取上下文或提交结构化 `AgentEditorPlan`；计划动作限定为删除、分割、移动和参数修改，不接收任意 `EditorCommand`、代码或 reducer action。

Renderer 的计划执行器先在工程快照上逐项编译并预检完整计划：移动和删除复用 `EditorPlacementPolicy`，所有生成命令都经过编辑事务规则模拟。任一目标不存在、轨道锁定、碰撞、参数非法或动作不受支持时，整组计划不执行。全部动作预检成功且 revision 在预检前后都一致时，执行器只调用一次 `executeTransaction`；因此多步计划只形成一个 Undo Step，不会出现部分提交。

## 工程 Revision

- 初始 revision 为 `0`，成功改变版本化工程内容的命令、批处理或事务会递增。
- 成功的 Undo、Redo，以及素材导入、Ready、Failed 等会改变工程事实的外部更新会递增。
- 选择、播放头、时间线缩放、纯播放/交互运行态、无变化事务和仅清空历史栈不会递增。
- `EditorAgentApi.getRevision()` 暴露当前值；`get_editor_context` 在工具结果的 `data.revision` 中返回该值，模型生成 `AgentEditorPlan` 时将它回填到 `projectRevision`。
- 计划在进入审批/自动执行以及用户批准后执行前都必须匹配当前 revision。等待期间工程变化会使计划失效，返回结构化 `STALE_CONTEXT`，且不执行任何动作。

## 不变量

- 同一轨道上的视觉片段不能发生非法碰撞；锁定轨道不能被自动放置或移动。
- 音频素材进入音频轨道，视觉素材进入视频/overlay 轨道；素材没有 `kind` 时按旧项目 video 兼容处理。
- `timelineStart` 不小于 0；sourceStart/sourceEnd 必须落在素材时长内，并保留最小有效片段时长。
- `hidden` 轨道不参与画面合成，`muted` 轨道/片段不产生可听播放，但静音片段仍保留在项目的 `audioLayers`/clips 数据中。
- 工程变换使用稳定工程坐标；预览 DOM 尺寸只参与渲染和映射，不写回 Project。
- 一个用户动作形成一个事务和一个 Undo Step；媒体 Ready/Import 不得清空已有编辑历史。

## 生命周期

- `VideoEditorWorkspace` 挂载时创建 history、playback controller 和 interaction controller。
- 离开编辑器时清理 playback controller、媒体检测和 Object URL；临时项目状态随工作区卸载消失。
- `crypto.randomUUID()` 只能在组件事件/初始化或 ID factory 中生成，纯 reducer 必须保持确定性。

## 兼容和非目标

- 旧版缺少 `kind`、尺寸或轨道字段时由解析/选择器提供兼容默认值。
- 旧版播放器仍可显示单个 active clip；V2 Composition Preview 负责按项目时间解析可见视觉层和音频层。
- 真实项目保存/加载、编辑器文件 IPC、完整 Ripple 行为、音频波形、字幕和关键帧不属于当前契约。

## 素材身份边界

- Editor V2 的 `MediaAsset.id` 只在当前 `VideoEditorWorkspace` 内有效；`MediaAsset.url` 是运行时 `blob:` URL，随工作区卸载而失效。
- 全局素材库的 `GlobalMediaAsset.id` 是 Main 持久化索引身份。文件重新定位只更新 `sourcePath` 和文件元数据，不改变该 ID。
- 当前两套素材模型没有项目持久化映射，因此不能从编辑器临时 Clip 计算跨项目引用次数；该能力保持未实现。
