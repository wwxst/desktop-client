# desktop-client 视频编辑器 V1（第一阶段）

本代码包基于 `wwxst/desktop-client` 当前 `main` 分支的 `VideoEditorWorkspace` 结构制作。

## 这一阶段已经落地

- Editor Project 新数据模型
  - 轨道 `EditorTrack`
  - 时间线片段 `TimelineClip`
  - 素材入点 / 出点
  - 时间线开始位置 / 时长
  - 位置 / 缩放 / 旋转
  - 透明度 / 音量 / 静音 / 速度
  - 播放头 / 时间线缩放
- Editor Command
  - `clip/addAsset`
  - `clip/delete`
  - `clip/move`
  - `clip/trim`
  - `clip/split`
  - `clip/update`
  - `clip/duplicate`
  - `track/update`
  - `canvas/setAspectRatio`
- Undo / Redo
  - 最多 100 步编辑历史
  - 支持批量 Command 作为一次历史操作
- Agent API
  - `getProjectSnapshot()`
  - `getCapabilities()`
  - `execute()`
  - `executeBatch()`
  - `undo()` / `redo()`
  - `getActiveEditorAgentApi()` 供未来 `AiPanel` / MCP / Agent 调用
- 真正时间线 V1
  - V2 / V1 / A1 默认轨道
  - 时间刻度
  - 播放头
  - 片段拖动
  - 左右裁剪
  - 分割
  - 删除
  - 时间线缩放
  - 轨道锁定 / 隐藏 / 静音
- 参数面板 V1
  - 时间线开始时间
  - 素材入点 / 出点
  - X / Y
  - Scale X / Y
  - Rotation
  - Opacity
  - Speed
  - Volume
  - Mute
- 播放器同步 V1
  - 根据 Clip 的 sourceStart/sourceEnd 播放
  - 播放速度同步
  - 音量/静音同步
  - 位置/缩放/旋转/透明度预览
  - 播放头与当前片段时间同步
- 键盘快捷键
  - Ctrl/Cmd + Z：撤销
  - Ctrl/Cmd + Shift + Z：重做
  - Delete / Backspace：删除选中片段

## 覆盖方式

把本压缩包内的 `src` 目录覆盖到仓库根目录对应的 `src` 目录即可。

新增文件：

- `editorCommands.ts`
- `editorHistory.ts`
- `editorAgentApi.ts`

替换文件：

- `editorProject.ts`
- `Timeline.tsx`
- `Timeline.css`
- `ParameterPanel.tsx`
- `ParameterPanel.css`
- `PlayerPanel.tsx`
- `VideoPlayback.tsx`
- `VideoEditorWorkspace.tsx`

新增测试：

- `tests/editor-commands.test.ts`
- `tests/editor-history.test.ts`

## 本地验证

覆盖后在仓库根目录运行：

```bash
npm test
npm run typecheck
npm run lint -- --quiet
npm run dev
```

## 这次还没有做

这次是“编辑器地基 + 第一版核心剪辑交互”，以下继续放在后续阶段：

1. 图片 / 音频真正导入与媒体元数据统一
2. 视频多层合成预览（目前播放器先预览当前选中 Clip）
3. 文本 Clip / 字幕 Clip
4. 音频波形
5. 吸附 / 磁吸 / 多选 / 复制粘贴
6. 项目保存和打开
7. FFmpeg 最终 MP4 导出
8. TTS 直接进入音轨
9. 自动字幕
10. 模板系统
11. Agent 对话 UI / MCP

## 架构约束

后续新增任何“编辑动作”优先增加为 `EditorCommand`，UI、模板、Agent 都调用 Command，不允许三套逻辑各写一遍。
