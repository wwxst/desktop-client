# desktop-client

基于 Electron、React 和 TypeScript 的桌面端视频编辑客户端。

## 开发文档

- [开发指南与当前代码结构](docs/DEVELOPMENT.md)
- [历史设计与实施记录](docs/superpowers/)

`docs/DEVELOPMENT.md` 描述当前代码；`docs/superpowers/` 下的文档是对应开发阶段的历史快照，路径和组件名称可能已经变化。

## 安装依赖

```bash
npm install
```

## 本地开发

```bash
npm run dev
```

## 质量检查

```bash
npm test
npm run lint -- --quiet
npm run typecheck
npm run build
```

## 打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```
