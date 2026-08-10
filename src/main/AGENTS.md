# Main / Preload 规则

> 状态：当前路径规则
> 适用范围：`src/main/`、`src/preload/`、`src/shared/`

- 所有 Renderer 可用能力必须经过 `src/preload/index.ts` 的 allowlist 和 `src/preload/index.d.ts` 类型声明。
- Main 承担网络、文件系统、模型、FFmpeg、长任务和 Token 等原生/敏感操作；Renderer 不直接访问这些能力。
- 新增 IPC 必须同步更新 Main handler、Preload 方法、全局 Window 类型、共享请求/响应类型、测试和 `docs/contracts/electron-ipc.md`。
- 事件监听 API 必须返回取消函数；Main 发事件前检查发送方窗口没有销毁。
- API Key 和登录 Token 只能保存在 Main 内存或明确的安全边界内，不通过响应返回到 Renderer。
- `API_BASE_URL` 当前为本地开发地址；不要把未来生产部署地址写成当前事实。
