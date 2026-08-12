import type {
  AgentChatAssistantMessage,
  AgentChatMessage,
  AgentModelConfig,
  AgentModelStatus,
  AgentToolCall
} from '../../../shared/agent/workflow'
import { ModelRegistry } from './ModelRegistry'

export interface JsonCompletionRequest {
  system: string
  user: string
  signal?: AbortSignal
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  error?: {
    message?: string
  }
}

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_editor_context',
      description: '读取当前剪辑工程、播放头和选中片段的摘要。回答工程问题或执行编辑前先调用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_selected_clips',
      description: '删除用户当前选中的时间线片段。仅在用户明确要求删除时调用，操作可撤销。',
      parameters: {
        type: 'object',
        properties: {
          magnetMainTrack: { type: 'boolean', description: '删除后是否磁吸主轨道空隙' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'split_selected_clip',
      description: '在播放头位置分割当前唯一选中的片段。仅在用户明确要求分割时调用，操作可撤销。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  }
] as const

const CHAT_SYSTEM_PROMPT = `你是桌面视频剪辑应用内的 AI 助手。你可以回答问题，并使用白名单工具读取或修改当前工程。
执行编辑前先读取工程上下文。只有用户明确要求修改时才调用修改工具。不要声称执行了未调用的工具。工具失败时解释原因并给出下一步。`

function mapChatMessage(message: AgentChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId
    }
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) }
      }))
    }
  }
  return { role: message.role, content: message.content }
}

function parseToolCalls(
  message: NonNullable<ChatCompletionResponse['choices']>[number]['message']
): AgentToolCall[] {
  const allowedNames = new Set<AgentToolCall['name']>([
    'get_editor_context',
    'delete_selected_clips',
    'split_selected_clip'
  ])
  const calls: AgentToolCall[] = []
  for (const candidate of message?.tool_calls ?? []) {
    const id = candidate.id?.trim() ?? ''
    const name = candidate.function?.name?.trim() as AgentToolCall['name'] | undefined
    if (!id || !name || !allowedNames.has(name)) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate.function?.arguments || '{}')
    } catch {
      throw new Error(`工具 ${name} 的参数不是有效 JSON`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`工具 ${name} 的参数必须是对象`)
    }
    const argumentsRecord = parsed as Record<string, unknown>
    const keys = Object.keys(argumentsRecord)
    const valid =
      name === 'delete_selected_clips'
        ? keys.every((key) => key === 'magnetMainTrack') &&
          (argumentsRecord.magnetMainTrack === undefined ||
            typeof argumentsRecord.magnetMainTrack === 'boolean')
        : keys.length === 0
    if (!valid) throw new Error(`工具 ${name} 的参数无效`)
    calls.push({ id, name, arguments: argumentsRecord })
  }
  return calls
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

  async chat(configId: string, messages: AgentChatMessage[]): Promise<AgentChatAssistantMessage> {
    const config = this.registry.getRuntimeConfig(String(configId ?? '').trim())
    if (!config) throw new Error('请选择模型配置')

    const response = await this.request(config, {
      model: config.model,
      temperature: config.temperature,
      messages: [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...messages.map(mapChatMessage)],
      tools: CHAT_TOOLS,
      tool_choice: 'auto'
    })
    const message = response.choices?.[0]?.message
    if (!message) throw new Error('大模型返回内容为空')
    const toolCalls = parseToolCalls(message)
    const content = message.content?.trim() ?? ''
    if (!content && toolCalls.length === 0) throw new Error('大模型返回内容为空')
    return { content, toolCalls }
  }

  async completeJson<T>(request: JsonCompletionRequest): Promise<T> {
    const config = this.getSelectedConfig()
    if (!config) throw new Error('尚未配置大模型，请先配置 Model Gateway')

    const payload = await this.request(
      config,
      {
        model: config.model,
        temperature: config.temperature,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user }
        ]
      },
      request.signal
    )
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('大模型返回内容为空')
    return JSON.parse(extractJsonObject(content)) as T
  }

  private async request(
    config: AgentModelConfig,
    body: Record<string, unknown>,
    externalSignal?: AbortSignal
  ): Promise<ChatCompletionResponse> {
    const timeoutController = new AbortController()
    const timer = setTimeout(() => timeoutController.abort(), config.timeoutMs)
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutController.signal])
      : timeoutController.signal
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })
      const payload = (await response.json()) as ChatCompletionResponse
      if (!response.ok) {
        throw new Error(payload.error?.message || `大模型请求失败：HTTP ${response.status}`)
      }
      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  private getSelectedConfig(): AgentModelConfig | null {
    return this.selectedConfigId ? this.registry.getRuntimeConfig(this.selectedConfigId) : null
  }
}
