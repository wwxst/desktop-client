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

| Renderer API                               | IPC 通道                                   | 作用                                                                                                                    |
| ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `window.api.login`                         | `auth:login`                               | 调用 Java 登录接口并在 Main 保存 Token                                                                                  |
| `window.api.getSubscription`               | `subscription:get-current`                 | Main 携带 Token 查询订阅，401 时清空会话                                                                                |
| `window.api.listProjects`                  | `project:list`                             | 读取 Main 管理的本地项目索引，供侧边栏在应用启动后恢复项目                                                              |
| `window.api.selectProjectDirectory`        | `project:directory:select`                 | 打开原生目录选择框，并为发起选择的 Renderer 临时授权该项目根目录                                                        |
| `window.api.createProject`                 | `project:create`                           | 仅在同一 Renderer 已授权的目录中创建项目结构、项目清单和持久化索引                                                      |
| `window.api.listGlobalMediaLibrary`        | `media-library:list`                       | 读取全局素材索引并刷新本地来源文件状态                                                                                  |
| `window.api.importGlobalMediaFiles`        | `media-library:import`                     | 打开原生多选文件框，将支持的媒体元数据写入全局索引                                                                      |
| `window.api.addGlobalMediaTag`             | `media-library:tags:add`                   | 为素材添加去重标签并持久化索引                                                                                          |
| `window.api.removeGlobalMediaTag`          | `media-library:tags:remove`                | 删除素材标签并持久化索引                                                                                                |
| `window.api.relocateGlobalMediaAsset`      | `media-library:relocate`                   | 打开原生单选文件框，更新失效素材来源并保留原 ID                                                                         |
| `window.api.listTtsCatalog`                | `tts:catalog:list`                         | 查询本地 TTS 资源和音色                                                                                                 |
| `window.api.installTtsModel`               | `tts:model:install`                        | 安装本地模型                                                                                                            |
| `window.api.removeTtsModel`                | `tts:model:remove`                         | 卸载本地模型                                                                                                            |
| `window.api.openTtsModelDirectory`         | `tts:model:open-directory`                 | 打开模型目录                                                                                                            |
| `window.api.previewTts`                    | `tts:preview`                              | 生成短文本试听                                                                                                          |
| `window.api.createTtsJob`                  | `tts:job:create`                           | 创建长文本配音任务                                                                                                      |
| `window.api.cancelTtsJob`                  | `tts:job:cancel`                           | 取消配音任务                                                                                                            |
| `window.api.saveTtsJob`                    | `tts:job:save`                             | 保存已完成的 WAV                                                                                                        |
| `window.api.listAgentModelCatalog`         | `agent:model-catalog:list`                 | Main 验证 Java 后台模型目录；失败或无效时返回内置目录，公开结果不含服务商 Base URL                                      |
| `window.api.listAgentModelConfigurations`  | `agent:model-config:list`                  | 列出 Main 从本地安全存储恢复的模型配置，不返回 API Key                                                                  |
| `window.api.createAgentModelConfiguration` | `agent:model-config:create`                | 添加并持久化服务商或自定义模型配置；服务商 Base URL 由 Main 解析                                                        |
| `window.api.updateAgentModelConfiguration` | `agent:model-config:update`                | 更新并持久化模型配置；API Key 留空时保留原密钥                                                                          |
| `window.api.deleteAgentModelConfiguration` | `agent:model-config:delete`                | 删除指定配置 ID 并持久化，不维护默认模型                                                                                |
| `window.api.runAgentChat`                  | `agent:chat:run`                           | 使用显式模型配置运行一轮无工具的通用文本对话；Main 固定系统提示并持有 API Key                                            |
| `window.api.runNovelDecompression`         | `agent:workflow:novel-decompression:start` | 启动多 Agent 工作流                                                                                                     |
| `window.api.getAgentTask`                  | `agent:workflow:get`                       | 查询长任务状态                                                                                                          |
| `window.api.cancelAgentTask`               | `agent:workflow:cancel`                    | 取消长任务                                                                                                              |

## 主进程事件

| Preload 监听方法             | Main 事件通道             | 取消方式       |
| ---------------------------- | ------------------------- | -------------- |
| `onTtsModelDownloadProgress` | `tts:model:progress`      | 调用返回的函数 |
| `onTtsJobProgress`           | `tts:job:progress`        | 调用返回的函数 |
| `onAgentWorkflowProgress`    | `agent:workflow:progress` | 调用返回的函数 |

页面卸载或任务结束时必须移除监听器。Main 发送进度前要检查 `event.sender.isDestroyed()`。

## 项目存储边界

项目列表索引由 Main 写入 Electron `userData/projects/index.json`。创建项目时，Main 在用户通过原生选择框授权的根目录写入版本化 `project.json`，并创建 `text`、`audio`、`subtitles`、`materials`、`output`、`cache`、`backups`、`batches` 和 `logs` 子目录。项目清单与全局索引均采用同目录临时文件加原子替换写入。

`project:create` 只接受 `{ name, rootDirectory }`，且 `rootDirectory` 必须由同一 Renderer 调用 `project:directory:select` 获得；创建成功后该次目录授权立即失效。已有 `project.json`、重复根目录、非绝对路径、非目录路径或损坏的全局索引都会拒绝创建，Main 不覆盖已有项目清单或损坏索引。Renderer 不获得通用文件系统能力。

## 后端边界

当前开发后端地址为 `http://localhost:8080`。认证和模型目录接口由 Main 调用，Renderer 不直接请求 Java 服务。模型目录响应必须经过 Main 严格验证；服务商官方 Base URL 只进入 Main 内部目录，Renderer 仅获得公开目录字段。模型配置元数据持久化到 Electron `userData/agent/model-configurations.json`，API Key 经 `safeStorage` 加密后以 Base64 密文保存；列表、变更和对话响应都不返回密钥。存储写入采用临时文件原子替换，变更在 IPC 返回成功前完成落盘，失败时回滚内存状态；损坏或无法解密的存储不会被新配置覆盖。自定义配置固定使用 OpenAI Chat Completions 兼容协议。模型配置没有启用、停用或默认状态，通用对话和具体工作流必须显式选择配置。

### 通用对话边界

`window.api.runAgentChat` 只接受 `{ configId, messages }`。消息必须从用户开始、以用户结束，并在 `user` 与 `assistant` 之间交替；单条消息最多 20,000 字符，单次请求最多 60 条。Renderer 不能传入 system、tool、工具调用、执行模式、审批模式或额外字段。

Main 添加固定系统提示，明确当前对话没有剪映、文件系统或桌面操作能力。请求不向模型声明工具；如果模型仍返回 `tool_calls`，Main 拒绝整轮响应。AI 面板 UI 已移除并准备重做，当前通道只提供后端和 Preload 基础。

已退役的 `get_editor_context`、`propose_editor_plan` 和内部 Clip 审批执行器不得恢复。剪映 5.9 自动化仍处于计划阶段；新增时必须定义独立的结构化动作、审批策略、取消协议和进度事件，不能开放通用桌面控制或把任意模型工具调用直接传给操作系统。

全局素材库只开放业务级“列出/刷新”“原生导入”“标签修改”和“失效素材重新定位”能力，不开放任意文件系统或通用 IPC。项目引用次数仍等待项目持久化和稳定 ID 映射；当前索引只保存用户源路径，没有可由应用安全删除的托管缓存，因此未引用缓存清理仍未实现。
