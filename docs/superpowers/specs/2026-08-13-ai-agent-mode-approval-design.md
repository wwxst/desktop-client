# AI Agent 模式与审批权限设计

> 状态：已批准设计
> 适用范围：AI 对话模式、Agent 多步剪辑计划、审批权限与编辑器执行边界
> 日期：2026-08-13

## 背景

AI 面板当前展示 `Agent` / `Ask` 执行模式和三级审批模式，但两组控件尚未进入聊天请求、工具声明或执行判断。当前对话已经支持结构化工具调用，Renderer 可读取工程摘要并执行删除、分割两个白名单编辑工具；它还不具备模式隔离、多步计划、修改前审批、工程版本失效或整组 Undo 契约。

## 产品定义

AI 面板提供两种能力边界：

- `Agent`：可读取工程、规划多步剪辑任务，并在审批策略允许后执行白名单编辑能力。
- `助手`：只回答问题、分析工程和给出建议；可以读取工程上下文，但不能调用任何修改工具。

执行模式决定能力上限，审批权限只在 `Agent` 模式下决定修改计划是自动执行还是等待用户批准。模型提示词不能替代程序权限判断。

## 审批权限

沿用 AI 面板底部审批控件，提供带说明和当前勾选状态的三级菜单：

### 请求批准

- 读取工程等只读操作可自动执行。
- 任意修改工程的计划必须先展示摘要并等待用户批准。

### 智能审批

- 读取操作可自动执行。
- 单个片段的分割、移动和参数修改可自动执行。
- 删除任意片段、修改多个片段、批量移动、批量参数修改，以及覆盖或替换已有内容必须等待批准。
- 一个计划含有多个修改动作时，即使每个动作单独属于低风险，也按批量计划等待批准。

### 完全访问

- 读取和所有已注册的白名单修改计划可自动执行。
- 仍必须通过工具 schema、审批策略、工程 revision、EditorService / PlacementPolicy、事务和工具轮次限制。
- 不允许任意工具名、任意 IPC、可执行代码、直接 reducer action 或绕过 Main/Preload/Renderer 边界。

## 结构化对话协议

普通回答继续使用自然语言，不要求模型把所有回复包装为 JSON。结构化协议用于模式、计划、审批和工具结果。

聊天请求增加：

- `mode: 'agent' | 'assistant'`
- `approvalMode: 'request' | 'smart' | 'full'`

Main 根据 `mode` 声明不同工具：

- 助手模式只声明 `get_editor_context`。
- Agent 模式声明 `get_editor_context` 和新的 `propose_editor_plan`。

`propose_editor_plan` 返回完整计划，不直接修改工程：

```ts
interface AgentEditorPlan {
  planId: string
  projectRevision: number
  summary: string
  actions: AgentEditorPlanAction[]
}
```

首期动作类型限定为编辑器已经具备 Service / Placement Policy 能力的白名单：

- `clip.delete`
- `clip.split`
- `clip.move`
- `clip.update`

每个动作使用判别联合类型和严格字段白名单，不接受任意 `EditorCommand`。Main 校验计划结构、动作数量、字符串长度、数值范围和未知字段；Renderer 再根据当前工程与编辑器能力验证业务条件。

## 工程 Revision

Editor Agent API 增加单调递增的工程 `revision`。它由编辑器历史/运行边界维护，不写入 `EditorProjectState`，避免成为可撤销的项目数据。任何可能改变计划目标或执行结果的工程变化都使 revision 增加，包括人工或 Agent 命令/事务、Undo/Redo，以及素材导入、Ready/Failed 等外部事实更新；选择变化、纯播放时钟、面板交互、缩放视图和无变化事务不增加 revision。计划动作必须使用明确的片段 ID、轨道 ID 和项目时间，不在批准后重新解释当前选择或播放头。

`get_editor_context` 返回当前 revision，模型计划必须回填该值。计划进入审批或执行前，Renderer 比较计划 revision 与当前 revision：

- 一致时继续审批或执行。
- 不一致时将计划标记为已失效，不执行任何动作，并把结构化 `STALE_CONTEXT` 结果返回模型以重新读取和规划。

等待用户批准期间发生任何工程修改，原计划同样失效。

## 审批状态机

每个会话同一时间最多存在一个运行中或等待批准的计划：

```text
planning -> awaiting_approval -> executing -> completed
         -> rejected
         -> stale
         -> failed
```

Renderer 收到计划后：

1. 校验当前模式必须为 Agent。
2. 校验 revision、动作白名单和当前编辑器能力。
3. 根据动作集合计算风险，不信任模型提供风险等级。
4. 根据审批权限得到 `auto_execute`、`require_approval` 或 `reject`。
5. 需要审批时展示计划摘要、动作列表和“批准执行”“拒绝”命令；等待期间不继续向模型请求后续修改动作。
6. 用户批准后重新校验 revision，再执行完整计划；用户拒绝时不修改工程，并把结构化拒绝结果回传模型。

首期只支持整组批准或拒绝，不提供逐条勾选。修改动作的原子性不能因 UI 选择被拆散。

## 计划执行与 Undo

新增专用 Renderer 计划执行器，把严格计划动作解析为 EditorService / PlacementPolicy 的规划结果，并在不改变工程的前提下收集完整命令。全部动作预检成功后，通过一次 `executeTransaction(commands, label)` 提交。

- 整个计划成功时只形成一个 Undo Step。
- 任一动作无效、目标不存在、轨道锁定、发生碰撞或预检失败时，整组不执行。
- 不允许先执行一部分再返回失败。
- 执行结果返回实际是否变化、受影响片段 ID、结果码和用户可读消息。

已有单动作 Service 方法仍供人工编辑和兼容调用使用，但 Agent 多步计划不能逐个调用这些方法形成多个事务。

## 结构化结果

计划和工具结果使用稳定结果码，不要求模型解析中文文案：

```ts
interface AgentToolExecutionResult {
  success: boolean
  code:
    | 'OK'
    | 'AWAITING_APPROVAL'
    | 'REJECTED'
    | 'STALE_CONTEXT'
    | 'INVALID_PLAN'
    | 'UNSUPPORTED_ACTION'
    | 'EDITOR_UNAVAILABLE'
    | 'EXECUTION_FAILED'
  message: string
  changed: boolean
  affectedClipIds: string[]
  data?: unknown
}
```

批准、拒绝、失效和执行结果均进入结构化聊天历史，再由模型生成最终自然语言摘要。

## 持久化与 UI

- 执行模式和 Agent 审批权限分别保存到 Renderer `localStorage`，使用独立键和异常保护。
- 首次使用默认 `Agent + 请求批准`，优先安全。
- 切换到助手模式时审批控件禁用或隐藏，但保留用户上次 Agent 审批权限；切回 Agent 后恢复。
- 模式标签对用户展示为 `Agent` 和 `助手`，不再展示 `Ask`。
- 审批菜单展示三级标题、简短说明和当前选中项，交互参考用户提供的权限菜单。
- 等待批准的计划作为对话中的操作区呈现，不使用浏览器原生确认框。
- 首期不实现审批菜单的独立设置页；AI 面板底部控件是唯一编辑入口。

## Main 与 Renderer 边界

- Main 持有 API Key、模式化系统提示词、工具 schema 和结构校验。
- Renderer 持有当前模式偏好、审批策略、编辑器 revision、计划审批状态与实际执行。
- 助手模式即使模型返回伪造修改工具，Main 解析和 Renderer 策略都必须拒绝。
- 完全访问只放宽白名单修改计划的确认要求，不扩大文件系统、网络、IPC 或模型权限。

## 错误、取消与并发

- 等待批准时禁止发送会触发第二个执行计划的请求；普通新会话会拒绝并清除待审批计划，不修改工程。
- 执行期间禁用模式、审批权限和发送控件，避免同一会话并发修改。
- 计划超过当前动作数量上限、工具循环上限或 schema 限制时直接拒绝。
- 模型请求失败、用户拒绝、计划失效和执行失败都必须恢复可交互状态。
- 首期保留现有非流式聊天；请求级取消和流式输出另行设计。

## 测试

覆盖以下行为：

- 助手模式只获得读取工具，伪造修改调用也不能执行。
- Agent 模式获得读取和计划工具，Main 严格校验结构化计划。
- 请求批准、智能审批、完全访问的完整风险矩阵。
- 智能审批下单项分割/移动/参数修改自动执行，删除和任意多动作计划等待批准。
- 等待批准、批准、拒绝和工程 revision 失效状态。
- 用户批准前后各进行一次 revision 校验。
- 多动作计划成功后只产生一个 Undo Step；任一动作预检失败时工程不发生部分修改。
- 结构化结果码和聊天历史回传。
- 模式与审批权限跨挂载恢复，助手模式不清除 Agent 审批偏好。
- `localStorage` 不可用时回退到安全默认值且不阻断问答。

## 暂不包含

- 流式输出和请求级取消。
- 会话跨重启持久化、历史搜索和长上下文压缩。
- 逐条批准、编辑计划后再批准或一次性临时授权。
- 文件系统、联网或 shell 权限审批。
- AI 新增素材、生成字幕、变速曲线、关键帧或导出等尚未进入首期计划白名单的能力。
