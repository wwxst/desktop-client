# desktop-client

基于 Electron、React 和 TypeScript 的桌面端视频编辑客户端。

## 开发文档

- [开发指南与当前代码结构](docs/DEVELOPMENT.md)

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
