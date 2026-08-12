# Editor V2 契约

> 状态：当前契约
> 适用范围：`src/renderer/src/components/SmartEdit/VideoEditorWorkspace/`
> 事实来源：`editorProject.ts`、`editorCommands.ts`、`core/`、`playback/`、`interaction/` 与 Editor V2 测试
> 最近验证：`e4a63ef` + 当前 AI 对话工具调用改动 / 2026-08-12

## 状态所有权

- `editorHistoryReducer` 持有可撤销的 EditorProjectState：assets、tracks、clips、activeClipId、兼容 playhead 字段、timelineZoom、aspectRatio 和 draftRows。
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

AI 面板通过已注册的 `EditorAgentApi` 读取当前工程摘要并执行白名单工具。当前工具包括读取工程摘要、删除当前选中片段、在播放头处分割当前唯一选中片段；删除和分割分别调用 `EditorService.deleteClips` 与 `EditorService.splitClip`，仍形成单个可撤销事务。模型不能直接持有 Project 状态或派发 reducer action。

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
