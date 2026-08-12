import { describe, expect, it, vi } from 'vitest'
import { findInternalModelProvider } from '../src/main/agent/modelCatalog'
import { AgentRuntime } from '../src/main/agent/runtime/AgentRuntime'
import { ModelGateway } from '../src/main/agent/runtime/ModelGateway'
import { ModelRegistry } from '../src/main/agent/runtime/ModelRegistry'

describe('Agent model runtime', () => {
  it('requires explicit selection and never exposes the API key', () => {
    const registry = new ModelRegistry(findInternalModelProvider, () => 'config-1')
    const gateway = new ModelGateway(registry)
    registry.create({
      kind: 'custom',
      baseUrl: 'https://example.test/v1/',
      apiKey: 'secret-key',
      modelId: 'test-model'
    })

    expect(gateway.isConfigured()).toBe(false)
    expect(() => gateway.select('missing')).toThrow('模型配置不存在')
    gateway.select('config-1')
    expect(gateway.getStatus()).toEqual({
      configured: true,
      baseUrl: 'https://example.test/v1',
      model: 'test-model'
    })
    expect(gateway.getStatus()).not.toHaveProperty('apiKey')
  })

  it('returns the deterministic fallback when model mode is disabled', async () => {
    const registry = new ModelRegistry(findInternalModelProvider)
    const gateway = new ModelGateway(registry)
    const runtime = new AgentRuntime(gateway)
    const modelCall = vi.fn(async () => 'model')

    await expect(runtime.runWithFallback('disabled', modelCall, () => 'fallback')).resolves.toBe(
      'fallback'
    )
    expect(modelCall).not.toHaveBeenCalled()
  })
})
