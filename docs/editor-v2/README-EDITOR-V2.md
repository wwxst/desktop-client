# desktop-client Editor V2 正式重构覆盖包

本包以当前 `desktop-client` 主线 Editor V1 地基为兼容基准，按照《视频编辑器交互与界面完整重构计划-完整版》重新整理，不依赖此前未合并的实验包。

## 覆盖方法

将压缩包内容解压到 `desktop-client` 仓库根目录，保持目录结构覆盖：

```text
src/
tests/
docs/
```

建议覆盖前创建 Git 分支：

```bash
git checkout -b editor-v2-refactor
```

覆盖后必须在完整仓库执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

本生成环境缺少你的完整仓库依赖树，因此我没有把“完整 npm build 已通过”当成事实。

## 本包最重要的变化

- 用户侧不再显示 V1/V2/A1 轨道编号，视觉内容自由叠层，声音内容在声音区域组织。
- 素材卡片、Windows/Finder 文件均可直接拖到时间线。
- 碰撞/自动选层下沉到 `EditorPlacementPolicy`，人工和 Agent 使用同一规则。
- 增加 `EditorService`，人工 UI、Agent、Workflow 不再各自重复实现“放置/移动/删除/粘贴”逻辑。
- Media Ready/Import 不再清空剪辑 Undo。
- Command Transaction 原子执行，一次用户动作只形成一个 Undo Step。
- Timeline 支持拖动、上下层、裁剪、播放头、Pan/Zoom、四边自动滚动、基础吸附、多选、框选、剪贴板、右键、Ghost Origin。
- 视频 Clip 使用多帧 Thumbnail Strip，并增加可见时间范围渲染，降低长时间线 DOM 压力。
- Canvas Transform 改为稳定工程坐标，不再把预览 DOM px 写入工程。
- Canvas 支持移动、四角缩放、旋转、中心/四边吸附、Fit、Fill、Zoom/Pan、右键。
- Playback Clock 独立于 Project reducer，播放不再每帧修改整个工程状态。
- 视频原声、主音量、循环、逐帧、全屏预览保留。
- 面板尺寸可拖动，并通过 `react-resizable-panels` 持久布局。
- Agent API 保留 Low-level Command 兼容，同时增加推荐的 High-level Service API。

## 明确仍然没有冒充完成的内容

- “在文件夹中显示/从项目移除”需要 Electron Main/Preload 文件 IPC，本包没有伪造。
- 主内容磁吸实现了基础删除前贴，完整 Ripple Insert/Ripple Trim 仍是下一轮高级编辑行为。
- Timeline 已做可见时间范围裁剪，但不是无限规模的完整虚拟列表引擎。
- 音频波形属于下一阶段正式音频能力。
- 字幕、TTS、滤镜、关键帧、复杂转场按计划没有混进本轮。
