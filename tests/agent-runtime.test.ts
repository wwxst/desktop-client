import { describe, expect, it, vi } from 'vitest'
import { AgentRuntime } from '../src/main/agent/runtime/AgentRuntime'
import { ModelGateway } from '../src/main/agent/runtime/ModelGateway'

describe('Agent model runtime', () => {
  it('validates configuration and never exposes the API key', () => {
    const gateway = new ModelGateway()

    expect(() => gateway.configure({ baseUrl: ' ', apiKey: 'key', model: 'model' })).toThrow()
    expect(() =>
      gateway.configure({ baseUrl: 'https://example.test/v1', apiKey: ' ', model: 'model' })
    ).toThrow()
    expect(() =>
      gateway.configure({ baseUrl: 'https://example.test/v1', apiKey: 'key', model: ' ' })
    ).toThrow()
    expect(() =>
      gateway.configure({ baseUrl: 'file:///tmp/model', apiKey: 'key', model: 'model' })
    ).toThrow()
    expect(() =>
      gateway.configure({
        baseUrl: 'https://example.test/v1',
        apiKey: 'key',
        model: 'model',
        timeoutMs: 0
      })
    ).toThrow()

    gateway.configure({
      baseUrl: 'https://example.test/v1/',
      apiKey: 'secret-key',
      model: 'test-model'
    })
    expect(gateway.getStatus()).toEqual({
      configured: true,
      baseUrl: 'https://example.test/v1',
      model: 'test-model'
    })
    expect(gateway.getStatus()).not.toHaveProperty('apiKey')
  })

  it('returns the deterministic fallback when model mode is disabled', async () => {
    const gateway = new ModelGateway()
    const runtime = new AgentRuntime(gateway)
    const modelCall = vi.fn(async () => 'model')

    await expect(runtime.runWithFallback('disabled', modelCall, () => 'fallback')).resolves.toBe(
      'fallback'
    )
    expect(modelCall).not.toHaveBeenCalled()
  })
})
