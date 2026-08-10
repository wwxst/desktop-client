# Electron IPC 契约

> 状态：当前契约
> 适用范围：`src/main`、`src/preload`、Renderer 的 `window.api`
> 事实来源：`src/preload/index.ts`、`src/preload/index.d.ts` 和 Main IPC 注册文件
> 最近验证：`74cd55b` / 2026-08-10

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
| `window.api.listTtsCatalog` | `tts:catalog:list` | 查询本地 TTS 资源和音色 |
| `window.api.installTtsModel` | `tts:model:install` | 安装本地模型 |
| `window.api.removeTtsModel` | `tts:model:remove` | 卸载本地模型 |
| `window.api.openTtsModelDirectory` | `tts:model:open-directory` | 打开模型目录 |
| `window.api.previewTts` | `tts:preview` | 生成短文本试听 |
| `window.api.createTtsJob` | `tts:job:create` | 创建长文本配音任务 |
| `window.api.cancelTtsJob` | `tts:job:cancel` | 取消配音任务 |
| `window.api.saveTtsJob` | `tts:job:save` | 保存已完成的 WAV |
| `window.api.configureAgentModel` | `agent:model:configure` | 将模型配置加载到 Main 内存 |
| `window.api.getAgentModelStatus` | `agent:model:status` | 查询模型状态，不返回 API Key |
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

当前开发后端地址为 `http://localhost:8080`。认证接口由 Main 调用，Renderer 不直接请求 Java 服务。真实部署地址、持久化会话和编辑器文件 IPC 属于后续能力，不能在当前文档中描述为已完成。
