# Codex App Server 基础接入设计

> 状态：当前实现设计
> 适用范围：Codex 进程、线程对话、流式事件和审批边界
> 日期：2026-08-16

## 目标

首页通用对话改由官方 Codex App Server 驱动，不再继续扩建自研 Agent 循环。当前阶段建立 Thread、Turn、模型列表、流式消息、取消和审批基础，为后续剪映 5.9 MCP 工具提供宿主。

## 当前链路

```text
AgentWorkspace
  -> window.api Codex 业务方法
Preload allowlist
  -> codex:* IPC
Electron Main / CodexService
  -> CodexAppServerClient
  -> codex app-server --listen stdio://
     -> process-scoped Jianying MCP config
```

Main 使用无 `jsonrpc` 字段的 JSON-RPC 2.0 JSONL 协议。连接后先发送 `initialize` 和 `initialized`，再调用 `model/list`、`thread/*` 与 `turn/*`。Renderer 不接触子进程、stdin/stdout、原始协议消息或 Codex 配置文件。

## 安全边界

- Codex 当前固定运行在 Electron `userData/codex-workspace` 专用目录。
- Renderer 不能传入 `cwd`、sandbox、系统提示、工具声明或任意 JSON-RPC 方法。
- Thread 和 Turn 固定使用 `read-only` sandbox 与 `on-request` 审批策略。
- 三档权限偏好随请求进入 Main，但不会改变 Jianying MCP 的九工具 allowlist；四个隔离数据写工具仍逐次请求审批，禁止升级策略不可放宽。
- Main 只向 Renderer转发命令和文件修改审批的结构化摘要；其他 Server Request 直接拒绝。
- 请求在专用工作目录之外执行命令或申请文件写入时，Main 自动拒绝。
- 用户批准只响应当前 Codex Server Request，不转化为 Renderer 任意进程或文件系统能力。

## Windows 可执行文件解析

开发和部署按以下顺序解析 Codex：

1. `CODEX_BIN` 显式路径。
2. Electron `resources/codex.exe`。
3. Windows npm 全局安装的官方 Codex 原生二进制。

当前仓库没有把 Codex 二进制复制进安装包。正式分发前仍需确定固定版本、升级策略、认证流程和分发条款。

## Renderer 行为

- 启动时连接 App Server 并读取官方模型列表。
- 第一次发送创建 Thread，后续消息在同一 Thread 创建新 Turn。
- `item/agentMessage/delta` 增量拼接为助手消息。
- `turn/completed` 结束发送状态；失败显示结构化错误。
- 新建对话会取消当前 Turn 并清空本地视图，下次发送创建新 Thread。
- 命令或文件修改审批以内联操作区展示，只允许“允许一次”或“拒绝”。

## 暂未完成

- 侧边栏对话列表尚未调用 `listCodexThreads`，应用重启后的历史恢复 UI 尚未接通。
- 项目 ID 尚未和 Codex Thread ID 关联。
- 剪映 MCP Server 的真实草稿只读检查、隔离工作副本安全写入和启动前 readiness 门禁已实现；受控启动、UI Automation 和导出工具尚未实现。
- 旧模型配置和自研工作流仍作为兼容路径保留，尚未删除。
- 安装包尚未内置固定版本 Codex 运行时。
