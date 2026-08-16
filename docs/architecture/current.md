# 当前架构

> 状态：当前事实
> 适用范围：Electron 应用、Renderer 业务工作区、TTS、素材库和 Agent 工作流
> 事实来源：`src/main`、`src/preload`、`src/shared`、`src/renderer/src` 与对应测试
> 最近验证：当前工作区 / 2026-08-16

## 总体边界

```text
React Renderer
  -> window.api (业务能力 allowlist)
Preload / contextBridge
  -> ipcRenderer.invoke / ipcRenderer.on
Electron Main
  -> 项目存储、本地 TTS、素材索引、Agent 工作流、登录和订阅请求
Java 后端
  -> 当前开发地址 http://localhost:8080
```

Renderer 不直接访问文件系统、进程、桌面自动化或完整 `ipcRenderer`。登录 Token 只保存在 Main 内存；Agent API Key 由 Main 使用 `safeStorage` 加密后持久化，列表和变更响应不返回密钥。

## Renderer 工作区

```text
App
└─ WorkspaceView
   ├─ Layout / Sidebar
   ├─ AgentWorkspace
   ├─ NovelPromotionView / NovelPromotionSidePanel
   ├─ TtsVoiceoverView
   ├─ MediaLibraryView
   ├─ PluginsView
   └─ SettingsView
```

`WorkspaceView` 只管理一级菜单和设置页显隐。首页由全尺寸 `AgentWorkspace` 占据，不再把 AI 对话嵌入右侧窄栏；空白态提供视频任务快捷提示，对话态展示用户和助手消息，底部输入区负责模型选择、当前上下文和发送。内置“智剪”页面、Editor V2、多轨时间线和旧编辑器 AI 面板已退役，不再存在开发环境专用入口。右侧区域是可选页面槽位，当前只由小说推文页面使用。

侧边栏在启动时通过 `window.api.listProjects` 恢复 Main 持久化的项目列表。新建项目使用原生目录选择框，不再读取浏览器文件输入或只保存 React 会话状态；创建成功后立即显示持久化记录，应用重启后从全局项目索引恢复。

设置页以单一表格管理多个模型配置，只提供添加、编辑和删除，不提供启用、停用或默认模型。“模型服务商”模式通过 Main 获取 Java 后台目录，后台不可用或返回无效数据时使用桌面端内置目录；Renderer 不获得服务商官方 Base URL。自定义配置固定使用 OpenAI Chat Completions 兼容协议，API Key 不回填到 Renderer。

## Agent 工作流

Main 当前保留模型注册表、无工具的通用 `ModelGateway.chat`、`ModelGateway.completeJson` 和 `NovelDecompressionWorkflow`。工作流可以进行故事分析、TTS、字幕、素材扫描、剪辑计划、审核和导出阶段处理。

当前 `EditorTool` 只把抽象 `EditingPlan` 转成 JSON 命令文件，`ExportTool` 直接调用 FFmpeg；它们都不会读取、启动或控制剪映。接入剪映 5.9 时必须新增独立 Adapter，不能把现有 `editor-staging` 阶段描述为剪映执行。

`agent:chat:run` 当前只接受显式模型配置和交替的用户/助手纯文本消息。Main 固定系统提示并拒绝 system、tool、额外字段和模型返回的工具调用；首页 `AgentWorkspace` 通过 Preload 暴露的 `window.api.runAgentChat` 调用该通道，支持多轮纯文本对话和模型选择。页面明确显示“仅对话”和“剪映 5.9 未连接”，不把计划中的自动化描述为当前能力。

旧的内部编辑器工具链已经移除，包括 `get_editor_context`、`propose_editor_plan`、Renderer 审批状态和内部 Clip 事务执行器。这些协议只适用于已删除的内置 Project 模型，不能代表剪映 5.9 的真实状态。

## 媒体和 TTS

### 本地项目

1. Renderer 先请求 Main 打开原生目录选择框，目录授权只属于发起选择的 Renderer。
2. Main 在已授权根目录生成版本化 `project.json`，并建立文本、音频、字幕、素材、输出、缓存、备份、批次和日志目录。
3. Main 将项目摘要写入 Electron `userData/projects/index.json`；项目清单与索引都通过临时文件原子替换。
4. 已有 `project.json`、重复目录或损坏索引会阻止创建，不覆盖用户已有配置。

### 全局素材库

1. `MediaLibraryView` 通过 Preload 请求 Main 打开原生文件选择框，并调用标签修改和失效素材重新定位业务 IPC。
2. Main 仅接受视频、音频和图片扩展名，按规范化来源路径去重，并将基础元数据与标签写入版本化 JSON 索引。
3. 页面加载或手动刷新时，Main 重新检查来源文件；无法访问的条目标记为 `missing`，不会被静默删除。
4. 全局索引尚未接入项目引用次数；当前索引只保存用户源路径，不存在可由应用清理的托管素材副本。

### 本地 TTS

TTS 模型管理、试听、长文本任务、取消、进度事件和 WAV 保存均通过 Main/Preload 业务 IPC。Renderer 不直接加载原生模型或写入目标文件。

## 剪映 5.9 自动化方向

> 状态：计划中，当前尚未实现或暴露对应 IPC。

剪辑执行目标是固定版本的剪映 5.9，不再建设内置视频编辑器。建议边界如下：

```text
NovelPromotionView
  -> 提交结构化批次任务
Main Task Runner
  -> Jianying 5.9 Adapter
     -> 草稿校验 / 备份 / 原子替换 / 回滚
     -> UI Automation Driver（仅打开、导出等必要步骤）
  -> 输出文件稳定性验证
  -> 检查点、日志、重试和人工接管
```

- Agent 只生成或选择高层任务动作，不直接输出鼠标坐标、任意脚本、文件路径写入或通用 IPC 调用。
- 确定性的 Adapter 负责参数校验、版本白名单、草稿锁定、备份、原子写入和输出验证。
- 草稿文件可稳定完成的替换优先直接适配；只有剪映导出等无法稳定离线完成的步骤才使用 UI Automation。
- 每次执行绑定剪映进程、窗口、草稿路径和批次 revision；状态不一致时停止，不猜测继续点击。
- “完全自动”也只能执行注册工具，不能扩展成 Renderer 任意控制桌面。

## 当前非目标和缺口

- 不提供内置多轨编辑器、时间线、预览合成、内部 Clip 命令或对应 Agent 工具；通用对话暂时也不执行任何工具。
- “小说推文”页面当前仍以浏览器状态和定时器演示批量阶段，尚未真正修改剪映草稿或导出文件。
- 剪映 5.9 版本检测、草稿适配、UI Automation、导出验证和断点恢复尚未实现。
- 项目与对话目前尚未建立关联；对话历史仍未持久化，项目项点击后的项目工作区切换也尚未接入。

## 代码定位

- Electron 入口：`src/main/index.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`
- 共享契约：`src/shared/auth.ts`、`src/shared/project.ts`、`src/shared/tts.ts`、`src/shared/agent/workflow.ts`、`src/shared/agent/chatContract.ts`
- 本地项目：`src/main/project/`、`src/renderer/src/components/Sidebar/Sidebar.tsx`
- 总工作区：`src/renderer/src/components/Workspace/WorkspaceView.tsx`
- 剪辑 Agent 首页：`src/renderer/src/components/AgentWorkspace/`
- 小说推文：`src/renderer/src/components/NovelPromotion/`
- Agent 工作流：`src/main/agent/`
- TTS：`src/main/tts/`、`src/renderer/src/components/TtsVoiceover/`
- 素材库：`src/main/mediaLibrary/`、`src/renderer/src/components/MediaLibrary/`
