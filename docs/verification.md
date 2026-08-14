# 验证基线

> 状态：当前验证口径
> 适用范围：提交前的 Electron/React Renderer 改动
> 最近验证：`b6b0758` / 2026-08-14

## 必跑命令

```bash
npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
git diff --check
```

## 最近基线

在 `b6b0758` 上：

- `npm test -- --reporter=dot`：退出码 `0`；58/58 测试文件、405/405 测试通过。jsdom 输出 4 条 `HTMLMediaElement.load()` 未实现提示；模型目录离线回退测试记录 1 条预期的“加载远程模型目录失败，使用内置目录”Main warning，均不影响退出码。
- `npm run typecheck`：退出码 `0`；Node 与 Web TypeScript 检查通过。
- `npm run build`：退出码 `0`；Main、Preload 和 Renderer 产物生成成功。Vite 本次转换 Main 32 个模块、Preload 1 个模块、Renderer 1876 个模块；输出 Main `154.25 kB`、Preload `5.03 kB`、Renderer JS `900.79 kB`、Renderer CSS `130.44 kB`。
- `git diff --check`：退出码 `0`。
- `npm run lint`：退出码 `0`；0 个 error、340 个 warning，其中 339 个可由 `--fix` 自动修复。warning 仍属于当前格式基线，不能描述为 lint 无告警。

Lint 现在是提交门禁。ESLint 只检查当前工作区的项目文件，不扫描 Git 已忽略的 `.worktrees/`、`.tts-v2-backup/` 和 `.superpowers/` 目录。

## 报告口径

- 测试通过只代表 Vitest/jsdom 和挂载组件的行为契约通过，不代表 Electron 窗口级视觉自动化已经验证。
- Build 通过代表 TypeScript 和 electron-vite 产物生成成功，不代表 Java 后端或本地模型运行环境可用。
- 需要更新当前架构、IPC 或编辑器契约时，验证命令和结果要与文档同一提交更新。
