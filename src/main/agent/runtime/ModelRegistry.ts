import { randomUUID } from 'node:crypto'
import type {
  AgentModelConfig,
  AgentModelCreateRequest,
  AgentModelRegistryItem,
  AgentModelUpdateRequest
} from '../../../shared/agent/workflow'
import type { InternalAgentModelProvider } from '../modelCatalog'

interface StoredModelConfiguration {
  item: AgentModelRegistryItem
  apiKey: string
}

type ProviderResolver = (providerId: string) => InternalAgentModelProvider | undefined

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '')
    .trim()
    .replace(/\/+$/, '')
}

function validateBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalized)
  } catch {
    throw new Error('Model Base URL must be a valid HTTP(S) URL')
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Model Base URL must use HTTP or HTTPS')
  }
  return normalized
}

function requireValue(value: string, message: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(message)
  return normalized
}

export class ModelRegistry {
  private readonly configurations = new Map<string, StoredModelConfiguration>()

  constructor(
    private readonly resolveProvider: ProviderResolver,
    private readonly createId: () => string = randomUUID
  ) {}

  list(): AgentModelRegistryItem[] {
    return Array.from(this.configurations.values(), ({ item }) => ({ ...item }))
  }

  create(request: AgentModelCreateRequest): AgentModelRegistryItem {
    const apiKey = requireValue(request.apiKey, '大模型 API Key 不能为空')
    let id = this.createId()
    while (this.configurations.has(id)) id = this.createId()

    const item = this.buildItem(id, request)
    this.configurations.set(id, { item, apiKey })
    return { ...item }
  }

  update(request: AgentModelUpdateRequest): AgentModelRegistryItem {
    const id = requireValue(request.id, '模型配置 ID 不能为空')
    const existing = this.configurations.get(id)
    if (!existing) throw new Error('模型配置不存在')

    const item = this.buildItem(id, request)
    const replacementKey = request.apiKey?.trim()
    this.configurations.set(id, {
      item,
      apiKey: replacementKey ? replacementKey : existing.apiKey
    })
    return { ...item }
  }

  delete(configId: string): boolean {
    return this.configurations.delete(String(configId ?? '').trim())
  }

  getRuntimeConfig(configId: string): AgentModelConfig | null {
    const stored = this.configurations.get(String(configId ?? '').trim())
    if (!stored) return null

    const { item, apiKey } = stored
    if (item.kind === 'custom') {
      return {
        baseUrl: item.baseUrl!,
        apiKey,
        model: item.modelId,
        temperature: 0.2,
        timeoutMs: 90_000
      }
    }

    const provider = this.resolveProvider(item.providerId!)
    if (!provider || !provider.models.some((model) => model.id === item.modelId)) return null
    return {
      baseUrl: validateBaseUrl(provider.baseUrl),
      apiKey,
      model: item.modelId,
      temperature: 0.2,
      timeoutMs: 90_000
    }
  }

  private buildItem(
    id: string,
    request: AgentModelCreateRequest | AgentModelUpdateRequest
  ): AgentModelRegistryItem {
    const modelId = requireValue(request.modelId, '大模型名称不能为空')

    if (request.kind === 'custom') {
      return {
        id,
        kind: 'custom',
        baseUrl: validateBaseUrl(request.baseUrl),
        modelId
      }
    }

    const providerId = requireValue(request.providerId, '模型服务商不能为空')
    const provider = this.resolveProvider(providerId)
    if (!provider) throw new Error('模型服务商不存在')
    const model = provider.models.find((candidate) => candidate.id === modelId)
    if (!model) throw new Error('模型不属于所选服务商')

    return {
      id,
      kind: 'provider',
      providerId,
      providerName: provider.name,
      modelId,
      modelName: model.name
    }
  }
}
