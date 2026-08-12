import type {
  AgentCatalogModel,
  AgentModelCatalog,
  AgentModelProvider
} from '../../shared/agent/workflow'

export interface InternalAgentModelProvider extends AgentModelProvider {
  baseUrl: string
}

const INTERNAL_MODEL_PROVIDERS: readonly InternalAgentModelProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    recommendedModelId: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', description: '轻量通用模型' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', description: '指令与代码任务' }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    recommendedModelId: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '通用对话模型' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '推理模型' }
    ]
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    recommendedModelId: 'qwen-plus',
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus', description: '均衡通用模型' },
      { id: 'qwen-max', name: 'Qwen Max', description: '高能力通用模型' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', description: '快速轻量模型' }
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    recommendedModelId: 'glm-4-flash',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4-Flash', description: '快速通用模型' },
      { id: 'glm-4-plus', name: 'GLM-4-Plus', description: '高能力通用模型' }
    ]
  },
  {
    id: 'kimi',
    name: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    recommendedModelId: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', description: '通用对话模型' },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', description: '长上下文模型' }
    ]
  },
  {
    id: 'doubao',
    name: '字节豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    recommendedModelId: 'doubao-seed-1-6-flash-250715',
    models: [
      {
        id: 'doubao-seed-1-6-flash-250715',
        name: '豆包 Seed 1.6 Flash',
        description: '快速通用模型'
      },
      {
        id: 'doubao-seed-1-6-250615',
        name: '豆包 Seed 1.6',
        description: '高能力通用模型'
      }
    ]
  }
]

export function toPublicProvider(provider: InternalAgentModelProvider): AgentModelProvider {
  return {
    id: provider.id,
    name: provider.name,
    recommendedModelId: provider.recommendedModelId,
    models: provider.models.map((model) => ({ ...model }))
  }
}

export const FALLBACK_MODEL_CATALOG: AgentModelCatalog = {
  providers: INTERNAL_MODEL_PROVIDERS.map(toPublicProvider)
}

export function findInternalModelProvider(
  providerId: string
): InternalAgentModelProvider | undefined {
  return INTERNAL_MODEL_PROVIDERS.find((provider) => provider.id === providerId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function parseModel(value: unknown): AgentCatalogModel | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'name', 'description'])) return null
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!id || !name) return null
  if (value.description !== undefined && typeof value.description !== 'string') return null

  return {
    id,
    name,
    ...(typeof value.description === 'string' && value.description.trim()
      ? { description: value.description.trim() }
      : {})
  }
}

function parseProvider(value: unknown): AgentModelProvider | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'name', 'recommendedModelId', 'models']) ||
    !Array.isArray(value.models) ||
    value.models.length === 0
  ) {
    return null
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const recommendedModelId =
    typeof value.recommendedModelId === 'string' ? value.recommendedModelId.trim() : ''
  const models = value.models.map(parseModel)
  if (!id || !name || !recommendedModelId || models.some((model) => model === null)) return null

  const validModels = models as AgentCatalogModel[]
  const modelIds = new Set(validModels.map((model) => model.id))
  if (modelIds.size !== validModels.length || !modelIds.has(recommendedModelId)) return null

  return { id, name, recommendedModelId, models: validModels }
}

export function parseModelCatalog(value: unknown): AgentModelCatalog | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['providers']) ||
    !Array.isArray(value.providers) ||
    value.providers.length === 0
  ) {
    return null
  }

  const providers = value.providers.map(parseProvider)
  if (providers.some((provider) => provider === null)) return null

  const validProviders = providers as AgentModelProvider[]
  const providerIds = new Set(validProviders.map((provider) => provider.id))
  if (providerIds.size !== validProviders.length) return null

  return { providers: validProviders }
}

function parseInternalProvider(value: unknown): InternalAgentModelProvider | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'name', 'baseUrl', 'recommendedModelId', 'models'])
  ) {
    return null
  }

  const publicProvider = parseProvider({
    id: value.id,
    name: value.name,
    recommendedModelId: value.recommendedModelId,
    models: value.models
  })
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim().replace(/\/+$/, '') : ''
  if (!publicProvider || !baseUrl) return null

  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  } catch {
    return null
  }

  return { ...publicProvider, baseUrl }
}

export function parseInternalModelProviders(value: unknown): InternalAgentModelProvider[] | null {
  const candidate = isRecord(value) && isRecord(value.data) ? value.data : value
  if (
    !isRecord(candidate) ||
    !hasOnlyKeys(candidate, ['providers']) ||
    !Array.isArray(candidate.providers) ||
    candidate.providers.length === 0
  ) {
    return null
  }

  const providers = candidate.providers.map(parseInternalProvider)
  if (providers.some((provider) => provider === null)) return null

  const validProviders = providers as InternalAgentModelProvider[]
  const providerIds = new Set(validProviders.map((provider) => provider.id))
  return providerIds.size === validProviders.length ? validProviders : null
}
