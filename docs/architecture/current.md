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
  -> 项目存储、本地 TTS、素材索引、Codex App Server、旧 Agent 工作流、登录和订阅请求
Codex App Server
  -> Thread / Turn / 流式事件 / 审批 / 模型目录
  -> 受控 Jianying MCP（真实草稿只读检查 / 隔离工作副本安全写入）
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

首页当前通过 Main 管理的 Codex App Server 加载官方模型列表，第一次发送创建 Thread，后续消息在同一 Thread 创建 Turn，并通过 `codex:event` 增量渲染助手消息。设置页原有模型配置继续供旧工作流兼容使用，只提供添加、编辑和删除；它不再是首页 Codex 对话的前置条件。

Codex 当前固定在 Electron `userData/codex-workspace` 专用目录内以只读 sandbox 运行。Renderer 不能传入工作目录、sandbox、系统提示或任意协议方法。命令、文件修改和 MCP 工具审批由 Main 登记后以结构化操作区呈现，专用目录之外的命令或文件请求自动拒绝。Main 通过进程级 `-c` 配置注入受控 Jianying MCP，`enabled_tools` 固定九个业务工具；四个会创建或修改隔离数据的工具逐次使用 `prompt` 审批。三档权限偏好不会注册真实草稿写入、启动、桌面控制或导出能力，也不会放宽禁止升级策略。

## Agent 工作流

Main 当前保留模型注册表、无工具的通用 `ModelGateway.chat`、`ModelGateway.completeJson` 和 `NovelDecompressionWorkflow`。工作流可以进行故事分析、TTS、字幕、素材扫描、剪辑计划、审核和导出阶段处理。

当前 `EditorTool` 只把抽象 `EditingPlan` 转成 JSON 命令文件，`ExportTool` 直接调用 FFmpeg；它们都不会读取、启动或控制剪映。接入剪映 5.9 时必须新增独立 Adapter，不能把现有 `editor-staging` 阶段描述为剪映执行。

`AgentWorkspace` 当前使用 Codex App Server 的 `model/list`、`thread/start`、`turn/start` 和流式通知。Codex 负责 Thread/Turn 历史、模型交互和审批协议；Jianying MCP 已能检查本机环境和 5.9 草稿，并在应用隔离工作副本中执行受控字幕修改与回滚，但首页还没有独立的 MCP 连接状态 UI，不得将这一基础描述为已经能启动剪映、自动剪辑或导出。

旧的 `agent:chat:run` 仍只接受显式模型配置和交替的用户/助手纯文本消息，继续作为自研工作流兼容接口。它不再驱动首页，待 Codex 链路和剪映工具覆盖现有使用场景后再删除。

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

## 剪映 5.9 适配状态

> 状态：真实草稿只读检查和隔离工作副本安全写入已实现；启动、UI Automation 和导出仍在计划中。

当前链路：

```text
Codex App Server
  -> Jianying MCP
     -> JianyingReadService
        -> 剪映 5.9 版本白名单
        -> 可执行文件版本 / 进程 / 隔离用户 / 更新开关启动前门禁
        -> 草稿根目录直接子目录约束
        -> draft_content.json / template-2.tmp 只读一致性检查
     -> JianyingWorkingCopyService
        -> 应用隔离目录工作副本
        -> 一次性预览令牌 / 原始字节备份 / SHA256
        -> 白名单字段变更 / 原子替换 / 验证与回滚
```

当前注册三个真实草稿只读工具：`jianying_environment_status`、`jianying_inspect_draft`、`jianying_preview_text_change`；四个工作副本工具：`jianying_prepare_working_copy`、`jianying_preview_working_copy_text_change`、`jianying_apply_text_change`、`jianying_rollback_text_change`；以及 `jianying_preview_no_upgrade_policy`、`jianying_apply_no_upgrade_policy` 两个隔离用户升级策略工具。工作副本固定在 Electron `userData/jianying-working-copies`，不能与真实草稿根互相包含。写入前要求剪映进程关闭、5.9 版本匹配且双镜像一致；写入只允许目标字幕文本和首个样式范围变化，失败恢复原始字节，显式回滚不会覆盖事务后的其他修改。

`capcut-cli` 只复用草稿解析、版本检测和素材查找 API；不使用其写入、restore、轨道排序或字幕范围更新实现。最小修改由 `jsonc-parser` 生成，真实草稿目录不产生备份、标记文件或任何写操作。

`jianying_environment_status` 还会读取 `JianyingPro.exe` 的 Windows 文件版本、确认进程状态，并返回结构化 `launchBlockers`。独立 Windows 用户通过 `JIANYING_ISOLATION_MODE=separate-windows-user` 与 `JIANYING_RUNTIME_PROFILE` 显式配置；该模式读取隔离用户自己的 `AppData/Local/JianyingPro/User Data/Config/globalSetting`。虚拟机执行通道尚未实现，因此选择 `virtual-machine` 仍会阻塞。当前机器已确认版本为 `5.9.0.11632`、进程未运行，但因未配置独立用户且自动更新、静默升级开启，`readyForControlledLaunch=false`，并且 `launchToolsEnabled=false`。

升级策略固定为 `deny`，不提供允许升级的反向配置。策略工具只能读取和修改隔离 Windows 用户的 `globalSetting`，当前共享用户目录或互相包含的目录会被拒绝。应用前必须先预览并审批；写入只把 `enableAutoUpdate` 和 `totalSilentUpgradeSwitch` 设为 `false`，保留其他字节结构，写前保存原始字节备份，失败自动恢复。

后续自动化目标边界如下：

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

- 不提供内置多轨编辑器、时间线、预览合成、内部 Clip 命令或对应 Agent 工具；当前只写应用管理的隔离工作副本，不执行真实草稿写入、启动、桌面控制或导出。
- “小说推文”页面当前仍以浏览器状态和定时器演示批量阶段，尚未真正修改剪映草稿或导出文件。
- 剪映 5.9 受控启动、真实草稿发布、UI Automation、导出验证和跨进程断点恢复尚未实现；启动前 readiness 门禁已实现，但当前主机隔离与升级条件尚未达标。
- Codex 已持久化 Thread，Main 也已开放列表和恢复接口；侧边栏尚未接入这些接口，项目与 Thread 仍未建立关联。
- 当前安装包尚未内置固定版本 Codex 运行时；开发环境使用 `CODEX_BIN`、资源目录或官方 npm 安装中的原生二进制。

## 代码定位

- Electron 入口：`src/main/index.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`
- 共享契约：`src/shared/auth.ts`、`src/shared/project.ts`、`src/shared/tts.ts`、`src/shared/agent/workflow.ts`、`src/shared/agent/chatContract.ts`
- 本地项目：`src/main/project/`、`src/renderer/src/components/Sidebar/Sidebar.tsx`
- 总工作区：`src/renderer/src/components/Workspace/WorkspaceView.tsx`
- 剪辑 Agent 首页：`src/renderer/src/components/AgentWorkspace/`
- Codex App Server：`src/main/codex/`
- 剪映受控 MCP：`src/main/jianying/`
- 小说推文：`src/renderer/src/components/NovelPromotion/`
- Agent 工作流：`src/main/agent/`
- TTS：`src/main/tts/`、`src/renderer/src/components/TtsVoiceover/`
- 素材库：`src/main/mediaLibrary/`、`src/renderer/src/components/MediaLibrary/`
