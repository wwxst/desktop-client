# 全局素材标签与失效素材重新定位设计

> 状态：当前实现设计
> 范围：全局素材库的索引元数据、标签操作和失效来源重新定位

## 目标

- 为每条全局素材记录持久化标签，支持添加、删除和按标签筛选。
- 为失效素材提供原生文件选择重新定位，成功后保留原素材 `id`，避免未来项目引用断开。
- 保持 Renderer 只通过 `window.api` 调用业务能力，文件系统和原生对话框由 Main 承担。

## 数据与持久化

`GlobalMediaAsset.tags` 是去重后的非空字符串数组。索引读取时兼容没有 `tags` 的旧记录，按空数组加载；写入时统一保存标签字段。标签修改只改变索引元数据，不改变来源文件。

重新定位接收素材 `id` 和一个由 Main 原生文件选择框返回的路径。Main 验证文件存在、是文件且扩展名属于素材类型，更新 `sourcePath`、`name`、`kind`、大小、修改时间和可用状态，同时保留 `id`、`importedAt` 与标签。若新路径已被另一条记录占用，操作失败并保留原记录。

## IPC

- `media-library:tags:add`：参数为素材 `id` 和标签，返回完整素材库响应。
- `media-library:tags:remove`：参数为素材 `id` 和标签，返回完整素材库响应。
- `media-library:relocate`：打开单文件原生选择框并重新定位指定失效素材，返回完整响应及 `canceled`。

Preload 只暴露对应的结构化方法；Renderer 不接收通用路径读写能力。

## Renderer

素材卡片显示标签。标签输入提交后调用添加 API，已有标签提供删除按钮。工具栏增加标签筛选下拉框；筛选与类型筛选同时生效。失效卡片显示“重新定位”按钮，成功后刷新该索引并保留卡片身份。

## 延期边界

项目引用次数暂缓，直到项目拥有稳定的 `projectId`、持久化项目清单和 `projectAssetId` 到全局 `libraryAssetId` 的映射。未引用缓存清理暂缓，当前素材库只保存用户源文件路径，没有应用托管的可删除缓存对象；任何清理都不得删除 `sourcePath`。未来清理必须只作用于登记在托管根目录内、无持久引用和活动 lease 且超过宽限期的对象。

## 验证

新增 Store、IPC 契约和 Renderer 行为测试；每阶段运行 `npm test -- --reporter=dot`、`npm run typecheck`、`npm run build`、`npm run lint` 和 `git diff --check`。
