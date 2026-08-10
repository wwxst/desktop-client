# Project Working Rules

> 状态：当前规则
> 适用范围：整个 `desktop-client` 仓库
> 最近验证：`74cd55b` / 2026-08-10

这是项目级执行规则和文档路由。先读本文件，再根据任务路径按需加载 `docs/README.md` 和对应契约文档。

## 事实来源

- 当前行为以源码和测试为准；文档与源码不一致时，先确认差异，再更新文档或实现。
- 产品方向以 `docs/桌面端自动剪辑产品PRD.md` 为准。
- 计划和设计描述目标行为，不代表已经实现；必须标注为“计划中”或“历史记录”。
- 编辑器当前契约入口是 `docs/contracts/editor-v2.md`，Electron 边界入口是 `docs/contracts/electron-ipc.md`。

## 全局硬约束

- 保持 Main、Preload、Renderer 的进程边界。Renderer 只能通过 `window.api` 调用明确开放的业务能力。
- 生产环境必须保留 `window.api.login` 认证流程；开发免登录只能由 `import.meta.env.DEV` 控制。
- 保持 `WorkspaceView` 的导航状态和 `VideoEditorWorkspace` 的编辑状态独立，子组件不能反向控制外层工作区。
- 新的编辑行为优先通过 `EditorService` / `EditorPlacementPolicy`，低层 `EditorCommand` 作为兼容接口保留。
- 一次用户编辑动作应通过事务形成一个 Undo Step；播放时钟和交互控制器不得每帧重写 Project reducer。
- 工程坐标使用稳定的工程坐标，不把预览 DOM 像素写入工程数据。
- 媒体异步检测必须可取消；每个 `blob:` URL 只能释放一次。
- React 组件文件和导入路径保持 PascalCase；CSS 选择器保持小写 kebab-case。
- 保持改动范围集中，不做无关重命名、全仓格式化或为了旧契约测试回退 V2 行为。

## 验证要求

提交前按 `docs/verification.md` 中的命令执行。当前已知 lint 基线为 11 个错误，不能把它描述为“lint 全部通过”。

## 按需加载

- 改 `src/main`、`src/preload` 或 `src/shared`：加载 `src/AGENTS.md`、需要时再加载 `src/main/AGENTS.md` 和 Electron IPC 契约。
- 改 `src/renderer/src/components/SmartEdit/VideoEditorWorkspace`：加载该目录的 `AGENTS.md` 和 Editor V2 契约。
- 改测试或更新契约：加载 `tests/AGENTS.md` 和验证基线。
- 做产品设计：加载 PRD 及对应的 `docs/superpowers/specs/` 文档；不要把计划当成当前实现。

## 文档维护

架构边界、IPC 方法、编辑器命令或验证基线发生变化时，同一改动必须更新对应的当前文档或契约文档。旧计划和审计只追加状态，不覆盖为当前事实。
