# 验证基线

> 状态：当前验证口径
> 适用范围：提交前的 Electron/React Renderer 改动
> 最近验证：`e4a63ef` + 当前 AI 对话工具调用改动 / 2026-08-12

## 必跑命令

```bash
npm test -- --reporter=dot
npm run typecheck
npm run build
git diff --check
```

改动涉及 lint 规则、组件结构或测试时，再运行：

```bash
npm run lint
```

## 最近基线

在 `e4a63ef` 加当前 AI 对话工具调用改动上：

- `npm test -- --reporter=dot`：52/52 测试文件、259/259 测试通过；jsdom 仍输出 4 条 `HTMLMediaElement.load()` 未实现提示，不影响退出码。模型目录回退测试会记录 1 条预期的 Main warning，不影响退出码。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- `npm run lint`：通过，0 个 error、878 个 Prettier warning。此前 5 个 `react-hooks/set-state-in-effect` 源码错误已改为派生状态或带来源身份的异步结果，6 个 V2 测试辅助函数已补充显式返回类型。

Lint 现在是提交门禁。ESLint 只检查当前工作区的项目文件，不扫描 Git 已忽略的 `.worktrees/`、`.tts-v2-backup/` 和 `.superpowers/` 目录。

## 报告口径

- 测试通过只代表 Vitest/jsdom 和挂载组件的行为契约通过，不代表 Electron 窗口级视觉自动化已经验证。
- Build 通过代表 TypeScript 和 electron-vite 产物生成成功，不代表 Java 后端或本地模型运行环境可用。
- 需要更新当前架构、IPC 或编辑器契约时，验证命令和结果要与文档同一提交更新。
