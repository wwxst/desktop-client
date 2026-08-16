# 文档索引

> 状态：当前入口
> 适用范围：整个 `desktop-client` 仓库
> 最近验证：`74cd55b` / 2026-08-10

本目录按“当前事实、稳定契约、产品方向、计划记录、历史快照”分层。默认只读取本索引和根 `AGENTS.md`，再按任务加载对应文档。

## 按任务加载

| 任务 | 先读 | 再按需读取 |
| --- | --- | --- |
| 了解项目 | [`README.md`](../README.md) | [`architecture/current.md`](architecture/current.md) |
| 改 Electron Main/Preload/IPC | [`contracts/electron-ipc.md`](contracts/electron-ipc.md) | [`../src/AGENTS.md`](../src/AGENTS.md)、[`../src/main/AGENTS.md`](../src/main/AGENTS.md) |
| 改 Agent 工作流或剪映自动化 | [`contracts/electron-ipc.md`](contracts/electron-ipc.md) | `src/main/agent/`、`src/shared/agent/`、对应设计规格 |
| 改 TTS/插件 | [`contracts/electron-ipc.md`](contracts/electron-ipc.md) | `docs/superpowers/specs/` 中对应设计 |
| 改测试或准备提交 | [`verification.md`](verification.md) | [`../tests/AGENTS.md`](../tests/AGENTS.md) |
| 做产品功能设计 | [`桌面端自动剪辑产品PRD.md`](桌面端自动剪辑产品PRD.md) | 对应的设计和计划文档 |

## 当前文档

- [`architecture/current.md`](architecture/current.md)：当前 Electron、Renderer 和业务工作区分层。
- [`contracts/electron-ipc.md`](contracts/electron-ipc.md)：当前 `window.api`、IPC 通道和安全边界。
- [`verification.md`](verification.md)：验证命令、当前基线和报告口径。
- [`DEVELOPMENT.md`](DEVELOPMENT.md)：旧开发指南兼容入口；当前事实以本索引链接的文档为准。

## 产品、计划与历史

- [`桌面端自动剪辑产品PRD.md`](桌面端自动剪辑产品PRD.md)：产品开发基线，不等同于已实现功能。
- [`superpowers/specs/`](superpowers/specs/)：按功能保存的设计规格。
- [`superpowers/plans/`](superpowers/plans/)：按任务保存的实施计划。
- [`editor-v2/`](editor-v2/)：Editor V2 覆盖包的审计、迁移和验证快照；阅读时以文件中的基线和状态为准。
- [`contracts/editor-v2.md`](contracts/editor-v2.md)：已退役的 Editor V2 契约说明，仅用于历史追溯。
- [`archive/`](archive/)：已被当前入口替代、但需要保留的历史说明。

## 文档状态规则

当前文档必须能回答“适用范围、事实来源、最近验证时间或提交”。计划必须明确未实现内容，审计必须注明基线，历史文件不得冒充当前架构。

源码和测试是行为事实来源；文档负责记录边界、决策、限制和加载路径。改变架构、IPC、编辑器契约或验证基线时，同一提交更新对应文档。
