# 剪映 5.9 隔离工作副本安全写入设计

> 状态：当前实现设计
> 适用范围：`src/main/jianying/`、Codex App Server MCP 注入、真实草稿只读检查和隔离工作副本写入
> 日期：2026-08-16

## 目标

在不自研 Agent 循环的前提下，让 Codex App Server 能检查本机剪映 5.9 环境、读取真实草稿，并在应用管理的隔离工作副本中安全修改字幕。本阶段不启动剪映、不控制桌面、不写真实草稿，也不自动导出。

## 链路

```text
AgentWorkspace
  -> codex:* business IPC
Electron Main
  -> Codex App Server
     -> Jianying MCP (stdio)
        -> JianyingReadService
           -> 剪映 5.9 真实明文草稿（只读）
        -> JianyingWorkingCopyService
           -> 应用管理的隔离副本（受控写入）
```

MCP 作为独立 Main 构建入口输出到 `out/main/jianying-mcp.js`。Main 使用 Electron 可执行文件和 `ELECTRON_RUN_AS_NODE=1` 启动该 stdio Server，不向 Renderer 暴露进程参数、环境变量或 MCP 协议。

## 工具面

| 工具                                        | 输入                                 | 输出                                 | 当前副作用                 |
| ------------------------------------------- | ------------------------------------ | ------------------------------------ | -------------------------- |
| `jianying_environment_status`               | 无                                   | 5.9 路径、草稿根、自动更新和安全开关 | 无                         |
| `jianying_inspect_draft`                    | 草稿直接子目录名                     | 版本、镜像状态、轨道顺序、片段和字幕 | 无                         |
| `jianying_preview_text_change`              | 草稿名、字幕片段 ID/唯一前缀、新文本 | 真实草稿修改预览和保护清单           | 无                         |
| `jianying_prepare_working_copy`             | 真实草稿名                           | 工作副本 ID、源文件 SHA256           | 创建隔离副本，源草稿零写入 |
| `jianying_preview_working_copy_text_change` | 工作副本 ID、片段 ID、新文本         | 一次性令牌、前后值、写前 SHA256      | 无                         |
| `jianying_apply_text_change`                | 一次性预览令牌                       | 事务 ID、前后 SHA256、字段白名单     | 审批后修改隔离副本         |
| `jianying_rollback_text_change`             | 工作副本 ID、事务 ID                 | 恢复后的 SHA256                      | 审批后恢复隔离副本原始字节 |
| `jianying_preview_no_upgrade_policy`        | 无                                   | 当前开关、目标开关、一次性令牌       | 无                         |
| `jianying_apply_no_upgrade_policy`          | 一次性预览令牌                       | 策略事务和前后 SHA256                | 审批后修改隔离用户配置     |

五个检查或预览工具声明 `readOnlyHint=true`；准备副本声明非只读、非破坏且非幂等；字幕应用、回滚和禁止升级策略应用声明非只读、破坏性且非幂等。所有工具都声明 `openWorldHint=false`。MCP 配置使用 `enabled_tools` 固定九个名称，四个写工具分别设置 `approval_mode="prompt"`，因此新工具不会自动向 Codex 开放。

## 草稿安全边界

- 只接受草稿根目录下的直接子目录名，不接受绝对路径或带分隔符的输入。
- 候选目录经 `realpath` 解析后必须仍为草稿根的直接子目录，防止 `..` 和链接逃逸。
- 只允许 `app_source=lv` 且 `app_version` 以 `5.9.` 开头的明文草稿。
- 检查层比较 `draft_content.json` 和 `template-2.tmp` 的解析后 SHA256，不会重写或同步镜像。
- 字幕 ID 前缀必须唯一；歧义前缀直接拒绝。
- 预览使用剪映 5.9 字符范围，保留原始轨道顺序，并固定返回 `writesPerformed: false`。
- 工作副本根在创建前解析潜在真实路径，不能与真实草稿根相同或互相包含。
- 准备、应用和回滚前检测 `JianyingPro.exe`；无法确认进程状态或检测到运行时停止操作。
- 工作副本双镜像必须语义一致，且控制文件必须是普通文件，拒绝符号链接。
- 预览令牌十分钟过期且只能使用一次；预览后哈希或目标字幕变化时拒绝应用。
- 只支持单样式、非逐词字幕；只允许 `content.text` 和 `styles[0].range` 变化，轨道和素材顺序不变。
- 写前逐字节备份两个镜像并记录 SHA256；同目录临时文件 `fsync` 后原子替换，任何中途失败都恢复原始字节。
- 显式回滚只在当前哈希等于事务写后哈希时执行，防止覆盖后续修改。

## 启动前门禁

环境工具在不启动剪映的前提下返回：

- `JianyingPro.exe` 是否存在、Windows 文件版本和锁定版本是否一致。
- `JianyingPro.exe` 进程是否运行；无法查询进程也视为阻塞。
- `none`、`separate-windows-user` 或 `virtual-machine` 隔离模式及配置状态。
- 自动更新和静默升级是否明确关闭。
- `readyForControlledLaunch`、结构化 `launchBlockers` 和固定为 `false` 的 `launchToolsEnabled`。

独立用户模式由 Main 使用 `JIANYING_ISOLATION_MODE=separate-windows-user` 和 `JIANYING_RUNTIME_PROFILE` 配置，且读取该用户自己的 `globalSetting`。配置目录不存在、与当前用户目录相同或互相包含时拒绝。虚拟机传输尚未实现，不能仅通过声明模式绕过门禁。

升级策略固定为 `deny`，不接受 Renderer 或 Agent 覆盖。应用策略必须先预览，再经 MCP 单次审批；服务只允许将 `enableAutoUpdate` 和 `totalSilentUpgradeSwitch` 从 `true` 改为 `false`，保持 CRLF/LF 和所有其他配置内容不变。原始字节备份、SHA256、同目录原子替换和失败恢复与草稿写入采用相同安全标准。

## 第三方能力取舍

`capcut-cli 0.19.0` 当前只用于草稿加载、版本检测、文本提取和素材关联查找。它不可直接承担剪映 5.9 写入，因为真实样本验证发现：

- 写入会将真实轨道顺序改为 CapCut 排序。
- 字幕范围使用 UTF-16LE 字节数，与 5.9 样本不一致。
- 内置 restore 会重新解析和序列化，不能代替原始字节回滚。

`capcut-cli` 为 ESM-only 依赖，Main 构建必须将它打入产物，不能由 CommonJS 产物在运行时 `require` 它。适配层不调用其 `runCommand()`，避免依赖打包后不存在的 CLI 相对入口。

## Codex 配置策略

Main 使用 App Server 进程参数 `-c mcp_servers.jianying=...` 注入配置，不写入用户的全局 `config.toml`，也不替换 `CODEX_HOME`，因此沿用现有 Codex 认证。

当前配置使用 `default_tools_approval_mode="auto"` 和严格的九工具 allowlist，并给准备副本、应用字幕、回滚字幕和应用禁止升级策略逐工具设置 `approval_mode="prompt"`。这兼容当前本机 `codex-cli 0.139.0`，不依赖该版本尚未接受的 `writes` 值。App Server 通过 `item/tool/requestUserInput` 请求审批；Main 只桥接带明确允许/拒绝选项的单个非敏感问题。

## 当前验证

- 最小 5.9 fixture 覆盖版本白名单、路径穿越、歧义前缀、轨道顺序、字符范围和真实草稿零写入。
- 工作副本测试覆盖一次性/过期预览、白名单差异、镜像一致、备份、故障自动回滚、后续修改保护和目录隔离。
- 隔离 fixture 已连续完成十次 `preview -> apply -> verify -> rollback`，每轮回滚后两个文件均与原始字节一致。
- MCP 内存传输覆盖九工具列表和 annotations；Codex 服务测试覆盖 MCP 审批问题到用户答案 payload 的桥接。
- 构建产物已通过 stdio MCP 在临时 5.9 fixture 上完成准备、预览、应用和回滚；真实 `4月11日` 草稿的 SHA256 前后不变。该真实样本包含逐词时间数据，当前服务按范围拒绝修改。
- 构建产物的环境工具在当前主机读取到精确版本 `5.9.0.11632` 且进程未运行，并准确返回 `isolation-unconfigured`、`auto-update-enabled`、`silent-upgrade-enabled` 三个启动阻塞项。

## 未完成

- 不验证或启动真实 5.9 进程；5.9 与现安装版共用 User Data，运行隔离方案未建立前不得直接启动。
- 不写入真实草稿；备份、应用和回滚只发生在应用管理的隔离工作副本。
- 不控制桌面、不打开导出界面、不验证输出视频。
- 后续写入必须以原始字节备份、SHA256、原子替换和原始字节回滚为前置条件，并另行建立审批和取消协议。
