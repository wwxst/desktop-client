import type {
  AgentApprovalMode,
  AgentChatAssistantMessage,
  AgentChatMessage,
  AgentChatMode,
  AgentModelConfig,
  AgentModelStatus,
  AgentToolCall
} from '../../../shared/agent/workflow'
import { parseAgentToolCall } from '../../../shared/agent/chatContract'
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

const GET_EDITOR_CONTEXT_TOOL = {
  type: 'function',
  function: {
    name: 'get_editor_context',
    description: '读取当前剪辑工程、projectRevision、播放头和选中片段的摘要。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
} as const

const CLIP_DELETE_ACTION_SCHEMA = {
  type: 'object',
  required: ['type', 'clipIds'],
  properties: {
    type: { const: 'clip.delete' },
    clipIds: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 200 }
    },
    magnetMainTrack: { type: 'boolean' }
  },
  additionalProperties: false
} as const

const CLIP_SPLIT_ACTION_SCHEMA = {
  type: 'object',
  required: ['type', 'clipId', 'at'],
  properties: {
    type: { const: 'clip.split' },
    clipId: { type: 'string', minLength: 1, maxLength: 200 },
    at: { type: 'number', minimum: 0, maximum: 86_400 }
  },
  additionalProperties: false
} as const

const CLIP_MOVE_ACTION_SCHEMA = {
  type: 'object',
  required: ['type', 'clipId', 'timelineStart'],
  properties: {
    type: { const: 'clip.move' },
    clipId: { type: 'string', minLength: 1, maxLength: 200 },
    timelineStart: { type: 'number', minimum: 0, maximum: 86_400 },
    trackId: { type: 'string', minLength: 1, maxLength: 200 }
  },
  additionalProperties: false
} as const

const CLIP_UPDATE_ACTION_SCHEMA = {
  type: 'object',
  required: ['type', 'clipId', 'patch'],
  properties: {
    type: { const: 'clip.update' },
    clipId: { type: 'string', minLength: 1, maxLength: 200 },
    patch: {
      type: 'object',
      minProperties: 1,
      properties: {
        opacity: { type: 'number', minimum: 0, maximum: 1 },
        volume: { type: 'number', minimum: 0, maximum: 1 },
        muted: { type: 'boolean' },
        speed: { type: 'number', minimum: 0.1, maximum: 8 },
        enabled: { type: 'boolean' },
        transform: {
          type: 'object',
          minProperties: 1,
          properties: {
            x: { type: 'number', minimum: -100_000, maximum: 100_000 },
            y: { type: 'number', minimum: -100_000, maximum: 100_000 },
            scaleX: { type: 'number', minimum: 0.01, maximum: 100 },
            scaleY: { type: 'number', minimum: 0.01, maximum: 100 },
            rotation: { type: 'number', minimum: -36_000, maximum: 36_000 }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const

const PROPOSE_EDITOR_PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'propose_editor_plan',
    description: '提交一组待审批的结构化剪辑动作。此工具只提出计划，不代表计划已经执行。',
    parameters: {
      type: 'object',
      required: ['planId', 'projectRevision', 'summary', 'actions'],
      properties: {
        planId: { type: 'string', minLength: 1, maxLength: 200 },
        projectRevision: { type: 'integer', minimum: 0 },
        summary: { type: 'string', minLength: 1, maxLength: 2_000 },
        actions: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              CLIP_DELETE_ACTION_SCHEMA,
              CLIP_SPLIT_ACTION_SCHEMA,
              CLIP_MOVE_ACTION_SCHEMA,
              CLIP_UPDATE_ACTION_SCHEMA
            ]
          }
        }
      },
      additionalProperties: false
    }
  }
} as const

const ASSISTANT_SYSTEM_PROMPT = `你是桌面视频剪辑应用内的问答助手。你可以使用 get_editor_context 读取当前工程并回答问题，但不能修改工程、提交编辑计划或声称已经执行编辑。工具失败时解释原因并给出下一步。`

const AGENT_SYSTEM_PROMPT = `你是桌面视频剪辑应用内可规划多步剪辑任务的 Copilot。任何修改前都必须先调用 get_editor_context，读取当前 projectRevision 和工程事实。所有修改只能通过 propose_editor_plan 提交结构化计划；提交计划不代表已经执行，必须等待应用返回工具结果。不要声称执行了未获成功结果的操作。`

const APPROVAL_MODE_LABELS: Record<AgentApprovalMode, string> = {
  request: '请求批准',
  smart: '智能审批',
  full: '完全访问'
}

function chatTools(mode: AgentChatMode): readonly Record<string, unknown>[] {
  return mode === 'assistant'
    ? [GET_EDITOR_CONTEXT_TOOL]
    : [GET_EDITOR_CONTEXT_TOOL, PROPOSE_EDITOR_PLAN_TOOL]
}

function chatSystemPrompt(mode: AgentChatMode, approvalMode: AgentApprovalMode): string {
  if (mode === 'assistant') return ASSISTANT_SYSTEM_PROMPT
  return `${AGENT_SYSTEM_PROMPT}\n当前审批权限：${APPROVAL_MODE_LABELS[approvalMode]}。审批与执行决定由应用负责。`
}

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
  message: NonNullable<ChatCompletionResponse['choices']>[number]['message'],
  mode: AgentChatMode
): AgentToolCall[] {
  const calls: AgentToolCall[] = []
  for (const candidate of message?.tool_calls ?? []) {
    const id = candidate.id?.trim() ?? ''
    const name = candidate.function?.name?.trim() ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate.function?.arguments || '{}')
    } catch {
      throw new Error(`工具 ${name} 的参数不是有效 JSON`)
    }
    calls.push(parseAgentToolCall(mode, { id, name, arguments: parsed }))
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

  async chat(
    configId: string,
    messages: AgentChatMessage[],
    mode: AgentChatMode,
    approvalMode: AgentApprovalMode
  ): Promise<AgentChatAssistantMessage> {
    const config = this.registry.getRuntimeConfig(String(configId ?? '').trim())
    if (!config) throw new Error('请选择模型配置')

    const response = await this.request(config, {
      model: config.model,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: chatSystemPrompt(mode, approvalMode) },
        ...messages.map(mapChatMessage)
      ],
      tools: chatTools(mode),
      tool_choice: 'auto'
    })
    const message = response.choices?.[0]?.message
    if (!message) throw new Error('大模型返回内容为空')
    const toolCalls = parseToolCalls(message, mode)
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
