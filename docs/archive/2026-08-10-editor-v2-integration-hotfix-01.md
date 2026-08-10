# Editor V2 集成修复 01（归档）

> 状态：历史修复包说明
> 归档原因：根 `README.md` 已恢复为项目入口；本文件保留原始覆盖包说明。

修复 `CompositionPreview.tsx` 的右键菜单类型错误：

- 所有 `EditorContextMenuItem` 增加稳定 `id`
- 旧 `{ type: 'separator' }` 改为 `{ id, separator: true }`
- 不修改 Editor Core、Timeline、Agent、History 或测试逻辑

覆盖项目根目录后重新执行：

```bash
npm run typecheck
npm run build
```

这只处理当前已确认的 typecheck/build P0 阻塞；Lint 与完整测试失败需依据真实输出继续定位。
