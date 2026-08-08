import type { AgentModelMode } from '../../../shared/agent/workflow'
import { ModelGateway } from './ModelGateway'

export class AgentRuntime {
  constructor(readonly model: ModelGateway) {}

  async runWithFallback<T>(
    mode: AgentModelMode,
    modelCall: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    if (mode === 'disabled') return fallback()

    if (!this.model.isConfigured()) {
      if (mode === 'required') throw new Error('当前流程要求使用大模型，但 Model Gateway 尚未配置')
      return fallback()
    }

    try {
      return await modelCall()
    } catch (error) {
      if (mode === 'required') throw error
      console.warn('Agent 大模型调用失败，已切换规则兜底：', error)
      return fallback()
    }
  }
}
