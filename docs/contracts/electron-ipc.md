# Electron IPC 契约

> 状态：当前契约
> 适用范围：`src/main`、`src/preload`、Renderer 的 `window.api`
> 事实来源：`src/preload/index.ts`、`src/preload/index.d.ts` 和 Main IPC 注册文件
> 最近验证：`a53b152` + 当前 AI 模型管理改动 / 2026-08-12

## 安全边界

- Renderer 只能调用 `window.api` 中明确声明的方法。
- Preload 不暴露完整 `ipcRenderer`，只暴露业务 allowlist 和事件取消函数。
- 登录 Token 只保存在 Main 进程内存；Renderer 不读取、不保存、不拼接 Bearer Token。
- 需要文件系统、模型、FFmpeg 或网络访问的能力必须在 Main 中执行，通过 IPC 返回结构化结果。
- 新增 IPC 时必须同时更新 Main 注册、Preload 实现、`src/preload/index.d.ts` 和对应测试/文档。

## 当前调用表

| Renderer API | IPC 通道 | 作用 |
| --- | --- | --- |
| `window.api.login` | `auth:login` | 调用 Java 登录接口并在 Main 保存 Token |
| `window.api.getSubscription` | `subscription:get-current` | Main 携带 Token 查询订阅，401 时清空会话 |
| `window.api.listGlobalMediaLibrary` | `media-library:list` | 读取全局素材索引并刷新本地来源文件状态 |
| `window.api.importGlobalMediaFiles` | `media-library:import` | 打开原生多选文件框，将支持的媒体元数据写入全局索引 |
| `window.api.addGlobalMediaTag` | `media-library:tags:add` | 为素材添加去重标签并持久化索引 |
| `window.api.removeGlobalMediaTag` | `media-library:tags:remove` | 删除素材标签并持久化索引 |
| `window.api.relocateGlobalMediaAsset` | `media-library:relocate` | 打开原生单选文件框，更新失效素材来源并保留原 ID |
| `window.api.listTtsCatalog` | `tts:catalog:list` | 查询本地 TTS 资源和音色 |
| `window.api.installTtsModel` | `tts:model:install` | 安装本地模型 |
| `window.api.removeTtsModel` | `tts:model:remove` | 卸载本地模型 |
| `window.api.openTtsModelDirectory` | `tts:model:open-directory` | 打开模型目录 |
| `window.api.previewTts` | `tts:preview` | 生成短文本试听 |
| `window.api.createTtsJob` | `tts:job:create` | 创建长文本配音任务 |
| `window.api.cancelTtsJob` | `tts:job:cancel` | 取消配音任务 |
| `window.api.saveTtsJob` | `tts:job:save` | 保存已完成的 WAV |
| `window.api.listAgentModelCatalog` | `agent:model-catalog:list` | Main 验证 Java 后台模型目录；失败或无效时返回内置目录，公开结果不含服务商 Base URL |
| `window.api.listAgentModelConfigurations` | `agent:model-config:list` | 列出 Main 内存中的模型配置，不返回 API Key |
| `window.api.createAgentModelConfiguration` | `agent:model-config:create` | 添加服务商或自定义模型配置；服务商 Base URL 由 Main 解析 |
| `window.api.updateAgentModelConfiguration` | `agent:model-config:update` | 更新模型配置；API Key 留空时保留原密钥 |
| `window.api.deleteAgentModelConfiguration` | `agent:model-config:delete` | 删除指定配置 ID，不维护默认模型 |
| `window.api.runNovelDecompression` | `agent:workflow:novel-decompression:start` | 启动多 Agent 工作流 |
| `window.api.getAgentTask` | `agent:workflow:get` | 查询长任务状态 |
| `window.api.cancelAgentTask` | `agent:workflow:cancel` | 取消长任务 |

## 主进程事件

| Preload 监听方法 | Main 事件通道 | 取消方式 |
| --- | --- | --- |
| `onTtsModelDownloadProgress` | `tts:model:progress` | 调用返回的函数 |
| `onTtsJobProgress` | `tts:job:progress` | 调用返回的函数 |
| `onAgentWorkflowProgress` | `agent:workflow:progress` | 调用返回的函数 |

页面卸载或任务结束时必须移除监听器。Main 发送进度前要检查 `event.sender.isDestroyed()`。

## 后端边界

当前开发后端地址为 `http://localhost:8080`。认证和模型目录接口由 Main 调用，Renderer 不直接请求 Java 服务。模型目录响应必须经过 Main 严格验证；服务商官方 Base URL 只进入 Main 内部目录，Renderer 仅获得公开目录字段。模型配置注册表和 API Key 只保存在 Main 内存，列表和变更响应不返回密钥；自定义配置固定使用 OpenAI Chat Completions 兼容协议。模型配置没有启用、停用或默认状态，具体工作流后续必须显式提供配置 ID。

全局素材库只开放业务级“列出/刷新”“原生导入”“标签修改”和“失效素材重新定位”能力，不开放任意文件系统或通用 IPC。项目引用次数仍等待项目持久化和稳定 ID 映射；当前索引只保存用户源路径，没有可由应用安全删除的托管缓存，因此未引用缓存清理仍未实现。
