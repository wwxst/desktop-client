# 验证基线

> 状态：当前验证口径
> 适用范围：提交前的 Electron/React Renderer 改动
> 最近验证：`74cd55b` / 2026-08-10

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

在 `74cd55b` 上：

- `npm test -- --reporter=dot`：37/37 测试文件通过，165/165 测试通过。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- `npm run lint`：失败，11 个已知错误；5 个是 `react-hooks/set-state-in-effect` 源码规则项，6 个是新 V2 测试缺少显式返回类型。

Lint 基线不是“全部通过”。修复它时应单独处理源码规则和测试类型规则，不要通过回退 V2 行为来降低错误数。

## 报告口径

- 测试通过只代表 Vitest/jsdom 和挂载组件的行为契约通过，不代表 Electron 窗口级视觉自动化已经验证。
- Build 通过代表 TypeScript 和 electron-vite 产物生成成功，不代表 Java 后端或本地模型运行环境可用。
- 需要更新当前架构、IPC 或编辑器契约时，验证命令和结果要与文档同一提交更新。
