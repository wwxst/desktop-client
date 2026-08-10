# desktop-client

Electron + React + TypeScript 桌面端，当前包含总工作区、TTS 配音、插件管理、Agent 工作流和 Editor V2 视频编辑器。

## 快速开始

```bash
npm install
npm run dev
```

常用验证命令和当前已知基线见 [`docs/verification.md`](docs/verification.md)。

## 先读哪里

- [`AGENTS.md`](AGENTS.md)：项目硬约束和按路径加载规则。
- [`docs/README.md`](docs/README.md)：文档索引、当前事实和历史资料的分层入口。
- [`docs/architecture/current.md`](docs/architecture/current.md)：当前进程、Renderer 和 Editor V2 架构。
- [`docs/contracts/electron-ipc.md`](docs/contracts/electron-ipc.md)：`window.api` 与 IPC 契约。
- [`docs/contracts/editor-v2.md`](docs/contracts/editor-v2.md)：编辑器状态、Service、Command 和生命周期契约。
- [`docs/桌面端自动剪辑产品PRD.md`](docs/桌面端自动剪辑产品PRD.md)：产品需求基线，不等同于已实现功能。

## 技术栈

- Electron 39
- React 19
- TypeScript 5
- electron-vite
- Vitest + Testing Library
- react-resizable-panels
- lucide-react

当前开发环境的 Java 后端地址为 `http://localhost:8080`。编辑器草稿持久化和编辑器文件 IPC 仍属于后续能力。
