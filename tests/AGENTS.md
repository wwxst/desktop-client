# 测试规则

> 状态：当前路径规则
> 适用范围：`tests/` 和与测试一起维护的源码契约

- 测试框架是 Vitest；组件测试使用 jsdom 和 Testing Library。
- 优先验证用户可观察行为、reducer/Service 契约和 IPC 边界；不要只通过源码正则证明实现正确。
- 需要保留的源码路径/大小写契约必须使用稳定路径断言，并与当前 PascalCase 文件名一致。
- 测试 fixture 必须包含当前模型要求的 `kind`、尺寸、轨道和可见/音频行等字段；不要用旧 fixture 迫使生产代码恢复 V1 行为。
- 修改共享行为时运行完整测试；只改纯函数时可以先运行对应测试，再按 `docs/verification.md` 扩展验证。
