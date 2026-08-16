# desktop-client

Electron + React + TypeScript 桌面端，定位为专注视频剪辑的 Agent 工作台。当前包含通用对话首页、小说推文工作区、TTS 配音、素材库、插件管理和 Agent 工作流。

## 快速开始

```bash
npm install
npm run dev
```

常用验证命令和当前已知基线见 [`docs/verification.md`](docs/verification.md)。

## 先读哪里

- [`AGENTS.md`](AGENTS.md)：项目硬约束和按路径加载规则。
- [`docs/README.md`](docs/README.md)：文档索引、当前事实和历史资料的分层入口。
- [`docs/architecture/current.md`](docs/architecture/current.md)：当前进程、Renderer 和业务工作区架构。
- [`docs/contracts/electron-ipc.md`](docs/contracts/electron-ipc.md)：`window.api` 与 IPC 契约。
- [`docs/桌面端自动剪辑产品PRD.md`](docs/桌面端自动剪辑产品PRD.md)：产品需求基线，不等同于已实现功能。

## 技术栈

- Electron 39
- React 19
- TypeScript 5
- electron-vite
- Vitest + Testing Library
- react-resizable-panels
- lucide-react

当前开发环境的 Java 后端地址为 `http://localhost:8080`。剪映 5.9 自动化控制和批量导出仍属于后续能力。
