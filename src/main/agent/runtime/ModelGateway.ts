import type { AgentModelConfig, AgentModelStatus } from '../../../shared/agent/workflow'
import { ModelRegistry } from './ModelRegistry'

export interface JsonCompletionRequest {
  system: string
  user: string
  signal?: AbortSignal
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function extractJsonObject(value: string): string {
  const clean = stripCodeFence(value)
  try {
    JSON.parse(clean)
    return clean
  } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) return clean.slice(start, end + 1)
    throw new Error('大模型没有返回可解析的 JSON 对象')
  }
}

export class ModelGateway {
  private selectedConfigId: string | null = null

  constructor(private readonly registry: ModelRegistry) {}

  select(configId: string): void {
    const normalizedId = String(configId ?? '').trim()
    if (!normalizedId || !this.registry.getRuntimeConfig(normalizedId)) {
      throw new Error('模型配置不存在')
    }
    this.selectedConfigId = normalizedId
  }

  clear(): void {
    this.selectedConfigId = null
  }

  getStatus(): AgentModelStatus {
    const config = this.getSelectedConfig()
    if (!config) return { configured: false }
    return {
      configured: true,
      baseUrl: config.baseUrl,
      model: config.model
    }
  }

  isConfigured(): boolean {
    return this.getSelectedConfig() !== null
  }

  async completeJson<T>(request: JsonCompletionRequest): Promise<T> {
    const config = this.getSelectedConfig()
    if (!config) throw new Error('尚未配置大模型，请先配置 Model Gateway')

    const timeoutController = new AbortController()
    const timer = setTimeout(() => timeoutController.abort(), config.timeoutMs)
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user }
          ]
        }),
        signal
      })

      const payload = (await response.json()) as ChatCompletionResponse
      if (!response.ok) {
        throw new Error(payload.error?.message || `大模型请求失败：HTTP ${response.status}`)
      }

      const content = payload.choices?.[0]?.message?.content
      if (!content) throw new Error('大模型返回内容为空')

      return JSON.parse(extractJsonObject(content)) as T
    } finally {
      clearTimeout(timer)
    }
  }

  private getSelectedConfig(): AgentModelConfig | null {
    return this.selectedConfigId ? this.registry.getRuntimeConfig(this.selectedConfigId) : null
  }
}
