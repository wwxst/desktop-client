import type { AgentModelConfig, AgentModelStatus } from '../../../shared/agent/workflow'

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

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '')
    .trim()
    .replace(/\/+$/, '')
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
  private config: AgentModelConfig | null = null

  configure(config: AgentModelConfig): void {
    if (!config || typeof config !== 'object')
      throw new Error('Model configuration must be an object')
    const baseUrl = normalizeBaseUrl(config.baseUrl)
    const apiKey = String(config.apiKey ?? '').trim()
    const model = String(config.model ?? '').trim()

    let parsedUrl: URL
    try {
      parsedUrl = new URL(baseUrl)
    } catch {
      throw new Error('Model Base URL must be a valid HTTP(S) URL')
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Model Base URL must use HTTP or HTTPS')
    }

    const timeoutMs = config.timeoutMs ?? 90_000
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
      throw new Error('Model timeout must be between 1000 and 600000 milliseconds')
    }
    const temperature = config.temperature ?? 0.2
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error('Model temperature must be between 0 and 2')
    }

    if (!baseUrl) throw new Error('大模型 Base URL 不能为空')
    if (!apiKey) throw new Error('大模型 API Key 不能为空')
    if (!model) throw new Error('大模型名称不能为空')

    this.config = {
      ...config,
      baseUrl,
      apiKey,
      model,
      temperature,
      timeoutMs
    }
  }

  clear(): void {
    this.config = null
  }

  getStatus(): AgentModelStatus {
    if (!this.config) return { configured: false }
    return {
      configured: true,
      baseUrl: this.config.baseUrl,
      model: this.config.model
    }
  }

  isConfigured(): boolean {
    return this.config !== null
  }

  async completeJson<T>(request: JsonCompletionRequest): Promise<T> {
    const config = this.config
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
}
