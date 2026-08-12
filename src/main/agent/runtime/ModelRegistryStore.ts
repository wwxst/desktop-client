import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ModelRegistrySnapshot } from './ModelRegistry'

interface ModelSecretProtector {
  encrypt: (value: string) => Buffer
  decrypt: (value: Buffer) => string
}

interface PersistedModelRegistry {
  version: 1
  configurations: Array<{
    item: ModelRegistrySnapshot[number]['item']
    encryptedApiKey: string
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseItem(value: unknown): ModelRegistrySnapshot[number]['item'] {
  if (!isRecord(value)) throw new Error('模型配置存储格式无效')
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const modelId = typeof value.modelId === 'string' ? value.modelId.trim() : ''
  if (!id || !modelId) throw new Error('模型配置存储格式无效')

  if (value.kind === 'custom') {
    const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : ''
    if (!baseUrl) throw new Error('模型配置存储格式无效')
    return { id, kind: 'custom', baseUrl, modelId }
  }

  if (value.kind === 'provider') {
    const providerId = typeof value.providerId === 'string' ? value.providerId.trim() : ''
    const providerName = typeof value.providerName === 'string' ? value.providerName.trim() : ''
    const modelName = typeof value.modelName === 'string' ? value.modelName.trim() : ''
    if (!providerId || !providerName || !modelName) throw new Error('模型配置存储格式无效')
    return { id, kind: 'provider', providerId, providerName, modelId, modelName }
  }

  throw new Error('模型配置存储格式无效')
}

function parseRegistry(value: unknown, protector: ModelSecretProtector): ModelRegistrySnapshot {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.configurations)) {
    throw new Error('模型配置存储格式无效')
  }

  const ids = new Set<string>()
  return value.configurations.map((configuration) => {
    if (
      !isRecord(configuration) ||
      typeof configuration.encryptedApiKey !== 'string' ||
      !configuration.encryptedApiKey
    ) {
      throw new Error('模型配置存储格式无效')
    }
    const item = parseItem(configuration.item)
    if (ids.has(item.id)) throw new Error('模型配置存储包含重复 ID')
    ids.add(item.id)
    const apiKey = protector.decrypt(Buffer.from(configuration.encryptedApiKey, 'base64')).trim()
    if (!apiKey) throw new Error('模型配置密钥无效')
    return { item, apiKey }
  })
}

export class ModelRegistryStore {
  private operation: Promise<void> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly protector: ModelSecretProtector
  ) {}

  async load(): Promise<ModelRegistrySnapshot> {
    try {
      return parseRegistry(JSON.parse(await readFile(this.path, 'utf8')), this.protector)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  save(snapshot: ModelRegistrySnapshot): Promise<void> {
    const persisted: PersistedModelRegistry = {
      version: 1,
      configurations: snapshot.map(({ item, apiKey }) => ({
        item,
        encryptedApiKey: this.protector.encrypt(apiKey).toString('base64')
      }))
    }
    return this.enqueue(() => this.write(persisted))
  }

  private async write(registry: PersistedModelRegistry): Promise<void> {
    const directory = dirname(this.path)
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(temporaryPath, JSON.stringify(registry, null, 2), 'utf8')
      await rename(temporaryPath, this.path)
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operation.then(operation, operation)
    this.operation = result.catch(() => undefined)
    return result
  }
}
