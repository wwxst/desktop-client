import { describe, expect, it } from 'vitest'
import { findInternalModelProvider } from '../src/main/agent/modelCatalog'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'

describe('Agent model registry', () => {
  it('creates provider and custom configurations without enabled or default state', () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')

    const provider = registry.create({
      kind: 'provider',
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      apiKey: 'provider-secret'
    })

    expect(provider).toEqual({
      id: 'config-1',
      kind: 'provider',
      providerId: 'deepseek',
      providerName: 'DeepSeek',
      modelId: 'deepseek-chat',
      modelName: 'DeepSeek Chat'
    })
    expect(provider).not.toHaveProperty('apiKey')
    expect(provider).not.toHaveProperty('baseUrl')
    expect(provider).not.toHaveProperty('enabled')
    expect(provider).not.toHaveProperty('default')

    const customRegistry = new ModelRegistry(findInternalModelProvider, () => 'config-2')
    expect(
      customRegistry.create({
        kind: 'custom',
        baseUrl: 'https://gateway.example.test/v1/',
        modelId: 'company-chat',
        apiKey: 'custom-secret'
      })
    ).toEqual({
      id: 'config-2',
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'company-chat'
    })
  })

  it('keeps the existing API key when an edit leaves it blank', () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    registry.create({
      kind: 'custom',
      baseUrl: 'https://old.example.test/v1',
      modelId: 'old-model',
      apiKey: 'original-secret'
    })

    registry.update({
      id: 'config-1',
      kind: 'custom',
      baseUrl: 'https://new.example.test/v1',
      modelId: 'new-model',
      apiKey: ''
    })

    expect(registry.getRuntimeConfig('config-1')).toEqual({
      baseUrl: 'https://new.example.test/v1',
      model: 'new-model',
      apiKey: 'original-secret',
      temperature: 0.2,
      timeoutMs: 90_000
    })
  })

  it('deletes by stable configuration ID and redacts every list result', () => {
    let nextId = 0
    const registry = new ModelRegistry(findInternalModelProvider, () => `config-${++nextId}`)
    registry.create({
      kind: 'provider',
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: 'secret'
    })
    registry.create({
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'custom-model',
      apiKey: 'secret-2'
    })

    expect(registry.delete('config-1')).toBe(true)
    expect(registry.list()).toEqual([
      {
        id: 'config-2',
        kind: 'custom',
        baseUrl: 'https://gateway.example.test/v1',
        modelId: 'custom-model'
      }
    ])
    expect(JSON.stringify(registry.list())).not.toContain('secret')
  })

  it('rejects unknown providers, models, malformed URLs, and missing keys', () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')

    expect(() =>
      registry.create({
        kind: 'provider',
        providerId: 'unknown',
        modelId: 'model',
        apiKey: 'secret'
      })
    ).toThrow('模型服务商不存在')
    expect(() =>
      registry.create({
        kind: 'provider',
        providerId: 'openai',
        modelId: 'unknown',
        apiKey: 'secret'
      })
    ).toThrow('模型不属于所选服务商')
    expect(() =>
      registry.create({
        kind: 'custom',
        baseUrl: 'not-a-url',
        modelId: 'model',
        apiKey: 'secret'
      })
    ).toThrow('Model Base URL must be a valid HTTP(S) URL')
    expect(() =>
      registry.create({
        kind: 'custom',
        baseUrl: 'https://example.test/v1',
        modelId: 'model',
        apiKey: ' '
      })
    ).toThrow('大模型 API Key 不能为空')
  })
})
