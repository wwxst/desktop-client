# Electron IPC 契约

> 状态：当前契约
> 适用范围：`src/main`、`src/preload`、Renderer 的 `window.api`
> 事实来源：`src/preload/index.ts`、`src/preload/index.d.ts` 和 Main IPC 注册文件
> 最近验证：当前工作区 / 2026-08-16

## 安全边界

- Renderer 只能调用 `window.api` 中明确声明的方法。
- Preload 不暴露完整 `ipcRenderer`，只暴露业务 allowlist 和事件取消函数。
- 登录 Token 只保存在 Main 进程内存；Renderer 不读取、不保存、不拼接 Bearer Token。
- 需要文件系统、模型、FFmpeg 或网络访问的能力必须在 Main 中执行，通过 IPC 返回结构化结果。
- 新增 IPC 时必须同时更新 Main 注册、Preload 实现、`src/preload/index.d.ts` 和对应测试/文档。

## 当前调用表

| Renderer API                               | IPC 通道                                   | 作用                                                                               |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `window.api.login`                         | `auth:login`                               | 调用 Java 登录接口并在 Main 保存 Token                                             |
| `window.api.getSubscription`               | `subscription:get-current`                 | Main 携带 Token 查询订阅，401 时清空会话                                           |
| `window.api.listProjects`                  | `project:list`                             | 读取 Main 管理的本地项目索引，供侧边栏在应用启动后恢复项目                         |
| `window.api.selectProjectDirectory`        | `project:directory:select`                 | 打开原生目录选择框，并为发起选择的 Renderer 临时授权该项目根目录                   |
| `window.api.createProject`                 | `project:create`                           | 仅在同一 Renderer 已授权的目录中创建项目结构、项目清单和持久化索引                 |
| `window.api.listGlobalMediaLibrary`        | `media-library:list`                       | 读取全局素材索引并刷新本地来源文件状态                                             |
| `window.api.importGlobalMediaFiles`        | `media-library:import`                     | 打开原生多选文件框，将支持的媒体元数据写入全局索引                                 |
| `window.api.addGlobalMediaTag`             | `media-library:tags:add`                   | 为素材添加去重标签并持久化索引                                                     |
| `window.api.removeGlobalMediaTag`          | `media-library:tags:remove`                | 删除素材标签并持久化索引                                                           |
| `window.api.relocateGlobalMediaAsset`      | `media-library:relocate`                   | 打开原生单选文件框，更新失效素材来源并保留原 ID                                    |
| `window.api.listTtsCatalog`                | `tts:catalog:list`                         | 查询本地 TTS 资源和音色                                                            |
| `window.api.installTtsModel`               | `tts:model:install`                        | 安装本地模型                                                                       |
| `window.api.removeTtsModel`                | `tts:model:remove`                         | 卸载本地模型                                                                       |
| `window.api.openTtsModelDirectory`         | `tts:model:open-directory`                 | 打开模型目录                                                                       |
| `window.api.previewTts`                    | `tts:preview`                              | 生成短文本试听                                                                     |
| `window.api.createTtsJob`                  | `tts:job:create`                           | 创建长文本配音任务                                                                 |
| `window.api.cancelTtsJob`                  | `tts:job:cancel`                           | 取消配音任务                                                                       |
| `window.api.saveTtsJob`                    | `tts:job:save`                             | 保存已完成的 WAV                                                                   |
| `window.api.listAgentModelCatalog`         | `agent:model-catalog:list`                 | Main 验证 Java 后台模型目录；失败或无效时返回内置目录，公开结果不含服务商 Base URL |
| `window.api.listAgentModelConfigurations`  | `agent:model-config:list`                  | 列出 Main 从本地安全存储恢复的模型配置，不返回 API Key                             |
| `window.api.createAgentModelConfiguration` | `agent:model-config:create`                | 添加并持久化服务商或自定义模型配置；服务商 Base URL 由 Main 解析                   |
| `window.api.updateAgentModelConfiguration` | `agent:model-config:update`                | 更新并持久化模型配置；API Key 留空时保留原密钥                                     |
| `window.api.deleteAgentModelConfiguration` | `agent:model-config:delete`                | 删除指定配置 ID 并持久化，不维护默认模型                                           |
| `window.api.runAgentChat`                  | `agent:chat:run`                           | 使用显式模型配置运行一轮无工具的通用文本对话；Main 固定系统提示并持有 API Key      |
| `window.api.getCodexStatus`                | `codex:status:get`                         | 启动并初始化 Main 管理的 Codex App Server，返回连接状态和 User Agent               |
| `window.api.listCodexModels`               | `codex:model:list`                         | 读取当前 Codex 运行时公开的可选模型                                                |
| `window.api.listCodexThreads`              | `codex:thread:list`                        | 列出 Codex 专用工作目录中的 App Server 对话                                        |
| `window.api.startCodexThread`              | `codex:thread:start`                       | 在 Main 固定的只读工作目录和审批策略下创建 Codex Thread                            |
| `window.api.resumeCodexThread`             | `codex:thread:resume`                      | 按 Thread ID 恢复已持久化的 Codex 对话                                             |
| `window.api.startCodexTurn`                | `codex:turn:start`                         | 向已加载 Thread 提交纯文本并启动 Turn                                              |
| `window.api.interruptCodexTurn`            | `codex:turn:interrupt`                     | 取消指定 Thread 中的当前 Turn                                                      |
| `window.api.respondCodexApproval`          | `codex:approval:respond`                   | 对 Main 已登记的单次命令、文件或 MCP 工具审批请求允许一次或拒绝                    |
| `window.api.runNovelDecompression`         | `agent:workflow:novel-decompression:start` | 启动多 Agent 工作流                                                                |
| `window.api.getAgentTask`                  | `agent:workflow:get`                       | 查询长任务状态                                                                     |
| `window.api.cancelAgentTask`               | `agent:workflow:cancel`                    | 取消长任务                                                                         |

## 主进程事件

| Preload 监听方法             | Main 事件通道             | 取消方式       |
| ---------------------------- | ------------------------- | -------------- |
| `onTtsModelDownloadProgress` | `tts:model:progress`      | 调用返回的函数 |
| `onTtsJobProgress`           | `tts:job:progress`        | 调用返回的函数 |
| `onAgentWorkflowProgress`    | `agent:workflow:progress` | 调用返回的函数 |
| `onCodexEvent`               | `codex:event`             | 调用返回的函数 |

页面卸载或任务结束时必须移除监听器。Main 发送进度前要检查 `event.sender.isDestroyed()`。

### Codex App Server 边界

Codex 子进程、stdin/stdout JSONL 和原始 JSON-RPC 消息只存在于 Main。Renderer 不能传入任意方法、工作目录、sandbox、系统提示、工具定义或配置覆盖。Main 当前固定使用 Electron `userData/codex-workspace`、`read-only` sandbox 和 `on-request` 审批；命令工作目录或文件授权根超出该专用目录时自动拒绝。

Main 启动 App Server 时通过进程级 `-c mcp_servers.jianying=...` 注入 Jianying MCP，不修改用户的全局 `config.toml`。MCP 进程由 Electron 以 `ELECTRON_RUN_AS_NODE=1` 运行构建产物 `out/main/jianying-mcp.js`，`enabled_tools` 只允许下列业务工具：

- `jianying_environment_status`：读取 5.9 可执行文件真实版本、草稿根、进程状态、隔离配置、自动更新状态和结构化启动阻塞项；该工具不启动剪映。
- `jianying_inspect_draft`：只接受草稿根目录下直接子目录名，读取 5.9 版本、镜像、轨道、片段和字幕。
- `jianying_preview_text_change`：生成字幕替换和 5.9 字符范围预览，返回 `writesPerformed: false`。
- `jianying_prepare_working_copy`：把 5.9 草稿逐字节复制到 Electron `userData/jianying-working-copies`；源草稿不写入。
- `jianying_preview_working_copy_text_change`：为隔离副本生成十分钟有效的一次性预览令牌，不写文件。
- `jianying_apply_text_change`：经单次审批后备份双镜像原始字节，只修改目标字幕文本和样式范围，原子替换并复核 SHA256。
- `jianying_rollback_text_change`：经单次审批后恢复事务备份；当前哈希不是该事务写后哈希时拒绝覆盖。
- `jianying_preview_no_upgrade_policy`：读取隔离用户的 `globalSetting` 并预览固定禁止升级策略，不写文件。
- `jianying_apply_no_upgrade_policy`：经单次审批后只把自动更新和静默升级设为 `false`，写前备份并在失败时恢复原始字节。

草稿名不允许分隔符或路径穿越；Main 侧服务使用 `realpath` 确认最终目录仍是草稿根的直接子目录。只有 `app_source=lv` 且 `app_version=5.9.x` 的明文草稿可通过检查。工作副本 ID、预览令牌和事务 ID 都是应用生成的 UUID；工作副本根与真实草稿根不能相同或互相包含。当前没有真实草稿写入、启动剪映、桌面控制或导出工具。

启动前门禁要求可执行文件存在且 Windows 文件版本匹配锁定版本、剪映进程状态可确认且未运行、独立 Windows 用户配置目录与当前用户不重叠、自动更新和静默升级均明确关闭。隔离模式和目录只能由 Main 环境配置传入 MCP，Renderer 不能修改。门禁结果只表示具备后续接入受控启动器的前提；当前 `launchToolsEnabled` 固定为 `false`，不构成启动授权。

升级策略固定为 `deny`。策略写入工具只接受预览返回的一次性令牌，只能操作隔离用户目录下固定位置的普通 `globalSetting` 文件，并拒绝当前用户目录、路径重叠、符号链接、重复键、非 UTF-8 文件、预览后变化和剪映运行状态。没有任何工具可以把升级开关改回 `true`。

`codex:event` 只转发连接状态、Turn 生命周期、助手消息增量、结构化错误和审批摘要。Main 只接受当前待处理审批 ID 的 `accept` 或 `decline`。MCP 的 `item/tool/requestUserInput` 只有在恰好包含一个非敏感问题，且选项能明确识别允许和拒绝时才转成权限卡片；响应按原问题 ID 和原选项标签返回。其他 Codex Server Request 暂不开放。权限菜单的三档偏好不会扩大 Jianying MCP 的工具 allowlist，也不会将 Renderer 输入转成任意文件系统、进程或桌面控制能力。

Windows 开发环境优先使用 `CODEX_BIN`、打包资源中的 `codex.exe` 或官方 npm 安装携带的原生二进制。当前安装包尚未内置固定版本 Codex，正式分发方案仍处于计划中。

## 项目存储边界

项目列表索引由 Main 写入 Electron `userData/projects/index.json`。创建项目时，Main 在用户通过原生选择框授权的根目录写入版本化 `project.json`，并创建 `text`、`audio`、`subtitles`、`materials`、`output`、`cache`、`backups`、`batches` 和 `logs` 子目录。项目清单与全局索引均采用同目录临时文件加原子替换写入。

`project:create` 只接受 `{ name, rootDirectory }`，且 `rootDirectory` 必须由同一 Renderer 调用 `project:directory:select` 获得；创建成功后该次目录授权立即失效。已有 `project.json`、重复根目录、非绝对路径、非目录路径或损坏的全局索引都会拒绝创建，Main 不覆盖已有项目清单或损坏索引。Renderer 不获得通用文件系统能力。

## 后端边界

当前开发后端地址为 `http://localhost:8080`。认证和模型目录接口由 Main 调用，Renderer 不直接请求 Java 服务。模型目录响应必须经过 Main 严格验证；服务商官方 Base URL 只进入 Main 内部目录，Renderer 仅获得公开目录字段。模型配置元数据持久化到 Electron `userData/agent/model-configurations.json`，API Key 经 `safeStorage` 加密后以 Base64 密文保存；列表、变更和对话响应都不返回密钥。存储写入采用临时文件原子替换，变更在 IPC 返回成功前完成落盘，失败时回滚内存状态；损坏或无法解密的存储不会被新配置覆盖。自定义配置固定使用 OpenAI Chat Completions 兼容协议。模型配置没有启用、停用或默认状态，通用对话和具体工作流必须显式选择配置。

### 通用对话边界

`window.api.runAgentChat` 只接受 `{ configId, messages }`。消息必须从用户开始、以用户结束，并在 `user` 与 `assistant` 之间交替；单条消息最多 20,000 字符，单次请求最多 60 条。Renderer 不能传入 system、tool、工具调用、执行模式、审批模式或额外字段。该接口继续供旧模型配置和自研工作流兼容使用；首页当前已改用 Codex Thread/Turn 接口。

Main 添加固定系统提示，明确当前对话没有剪映、文件系统或桌面操作能力。请求不向模型声明工具；如果模型仍返回 `tool_calls`，Main 拒绝整轮响应。AI 面板 UI 已移除并准备重做，当前通道只提供后端和 Preload 基础。

已退役的 `get_editor_context`、`propose_editor_plan` 和内部 Clip 审批执行器不得恢复。剪映 5.9 只读检查和变更预览已接入；后续新增草稿写入或自动化时必须定义独立的结构化动作、审批策略、取消协议和进度事件，不能开放通用桌面控制或把任意模型工具调用直接传给操作系统。

全局素材库只开放业务级“列出/刷新”“原生导入”“标签修改”和“失效素材重新定位”能力，不开放任意文件系统或通用 IPC。项目引用次数仍等待项目持久化和稳定 ID 映射；当前索引只保存用户源路径，没有可由应用安全删除的托管缓存，因此未引用缓存清理仍未实现。
