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

- `npm test -- --reporter=dot`：退出码 `0`；48/48 测试文件、230/230 测试通过。模型目录离线回退测试记录 1 条预期的“加载远程模型目录失败，使用内置目录”Main warning，不影响退出码。Codex JSON-RPC 握手模拟、服务映射、IPC/Preload、严格请求校验、流式首页、命令/文件/MCP 审批交互、剪映 5.9 真实草稿只读路径、隔离工作副本安全写入、禁止升级策略和启动前 readiness 门禁已覆盖。
- `npm run typecheck`：退出码 `0`；Node 与 Web TypeScript 检查通过。
- `npm run build`：退出码 `0`；Main、Preload 和 Renderer 产物生成成功。Vite 本次转换 Main 62 个模块、Preload 1 个模块、Renderer 1833 个模块；输出 Main `178.69 kB`、剪映 MCP 入口 `45.72 kB`、剪映解析 chunk `50.28 kB`、Preload `6.63 kB`、Renderer JS `848.03 kB`、Renderer CSS `91.58 kB`。
- `git diff --check`：退出码 `0`。
- `npm run lint`：退出码 `0`；0 个 error、407 个既有 CRLF 格式 warning，集中在 `App.tsx`、`Activation.tsx`、`TitleBar.tsx` 和 `main.tsx`。本次改动文件的定向 ESLint 检查为 0 error、0 warning。
- 构建后的 Jianying MCP 已通过 stdio 握手返回九个允许工具及预期 annotations，本机 `codex-cli 0.139.0` 已成功解析九工具 allowlist、默认 `auto` 和四个写工具的逐工具 `prompt` 配置。服务测试中的隔离 fixture 连续完成十次预览、应用、验证和逐字节回滚；构建产物也已通过 stdio MCP 在临时 5.9 fixture 上完成一次完整事务，回滚后逐字节等于写前文件。禁止升级策略已在临时隔离用户配置上通过构建产物 MCP 完成预览和应用，只修改两个升级键、保留 CRLF 和无关设置，备份逐字节等于原文件。真实草稿 `4月11日/draft_content.json` 的 SHA256 前后均为 `455D9547F2D7D556DD597C9418205D013B05B5BC1BF86ADFE4C1B7E5FCE3F68F`。该真实样本包含逐词时间数据，安全写入服务按当前范围拒绝修改。上述检查不等同于真实草稿写入、启动剪映或生产导出自动化验证。
- 本地 Renderer 已在默认视口和最小支持的 `1000 x 700` 视口完成截图与几何检查；224px 分组侧栏、欢迎态、四个快捷任务、固定输入区和权限控件均无横向溢出或重叠，控制台无 error。浏览器预览不包含 Electron Preload，按预期显示 Codex 接口不可用；本机 `codex 0.139.0` 已通过真实 `initialize + model/list` 握手，返回 5 个模型和默认模型 `gpt-5.5`。该检查不等同于真实剪映或生产 Electron 自动化验证。

Lint 现在是提交门禁。ESLint 只检查当前工作区的项目文件，不扫描 Git 已忽略的 `.worktrees/`、`.tts-v2-backup/` 和 `.superpowers/` 目录。

## 报告口径

- 测试通过只代表 Vitest/jsdom 和挂载组件的行为契约通过，不代表 Electron 窗口级视觉自动化已经验证。
- Build 通过代表 TypeScript 和 electron-vite 产物生成成功，不代表 Java 后端或本地模型运行环境可用。
- 需要更新当前架构、IPC 或编辑器契约时，验证命令和结果要与文档同一提交更新。
