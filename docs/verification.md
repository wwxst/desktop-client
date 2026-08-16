# 验证基线

> 状态：当前验证口径
> 适用范围：提交前的 Electron/React Renderer 改动
> 最近验证：当前工作区 / 2026-08-16

## 必跑命令

```bash
npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
git diff --check
```

## 最近基线

在当前工作区上：

- `npm test -- --reporter=dot`：退出码 `0`；37/37 测试文件、192/192 测试通过。模型目录离线回退测试记录 1 条预期的“加载远程模型目录失败，使用内置目录”Main warning，不影响退出码。Editor V2 与内部编辑器 AI 测试随对应功能退役而删除；通用无工具对话契约、项目持久化存储/IPC/Preload/侧边栏恢复、网关和剪辑 Agent 工作台测试已覆盖。
- `npm run typecheck`：退出码 `0`；Node 与 Web TypeScript 检查通过。
- `npm run build`：退出码 `0`；Main、Preload 和 Renderer 产物生成成功。Vite 本次转换 Main 34 个模块、Preload 1 个模块、Renderer 1833 个模块；输出 Main `149.13 kB`、Preload `5.51 kB`、Renderer JS `842.94 kB`、Renderer CSS `90.17 kB`。
- `git diff --check`：退出码 `0`。
- `npm run lint`：退出码 `0`；0 个 error、407 个既有 CRLF 格式 warning，集中在 `App.tsx`、`Activation.tsx`、`TitleBar.tsx` 和 `main.tsx`。本次改动文件的定向 ESLint 检查为 0 error、0 warning。
- 本地 Renderer 已在 `1200 x 800` 和最小支持的 `1000 x 700` 视口完成截图与几何检查；224px 分组侧栏、项目/对话操作菜单、创建项目弹窗、欢迎态、四个快捷任务、固定输入区和三档权限弹层均无重叠、溢出或裁切，控制台无 error。该检查不等同于真实剪映或生产 Electron 自动化验证。

Lint 现在是提交门禁。ESLint 只检查当前工作区的项目文件，不扫描 Git 已忽略的 `.worktrees/`、`.tts-v2-backup/` 和 `.superpowers/` 目录。

## 报告口径

- 测试通过只代表 Vitest/jsdom 和挂载组件的行为契约通过，不代表 Electron 窗口级视觉自动化已经验证。
- Build 通过代表 TypeScript 和 electron-vite 产物生成成功，不代表 Java 后端或本地模型运行环境可用。
- 需要更新当前架构、IPC 或编辑器契约时，验证命令和结果要与文档同一提交更新。
