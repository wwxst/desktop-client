import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentModelCatalogResponse,
  AgentModelMutationResponse,
  AgentModelRegistryResponse
} from '../src/shared/agent/workflow'

type TestIpcHandler = (event: { sender: unknown }, ...args: never[]) => Promise<unknown>

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, TestIpcHandler>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: TestIpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler
  },
  net: { fetch: vi.fn() }
}))

import { createAgentModelServices, registerAgentIpc } from '../src/main/agent/registerAgentIpc'

function getHandler(channel: string): TestIpcHandler {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  return handler
}

beforeEach(() => {
  vi.clearAllMocks()
  electronMocks.handlers.clear()
})

describe('Agent model IPC', () => {
  it('returns a validated remote catalog without provider Base URLs', async () => {
    const services = createAgentModelServices()
    registerAgentIpc({
      services,
      loadRemoteCatalog: vi.fn().mockResolvedValue({
        providers: [
          {
            id: 'company-ai',
            name: 'Company AI',
            baseUrl: 'https://private.example.test/v1',
            recommendedModelId: 'company-chat',
            models: [{ id: 'company-chat', name: 'Company Chat' }]
          }
        ]
      })
    })

    const response = (await getHandler('agent:model-catalog:list')({
      sender: {}
    })) as AgentModelCatalogResponse

    expect(response).toEqual({
      success: true,
      message: '模型目录加载成功',
      source: 'remote',
      catalog: {
        providers: [
          {
            id: 'company-ai',
            name: 'Company AI',
            recommendedModelId: 'company-chat',
            models: [{ id: 'company-chat', name: 'Company Chat' }]
          }
        ]
      }
    })
    expect(JSON.stringify(response)).not.toContain('private.example.test')
  })

  it.each([
    ['request failure', vi.fn().mockRejectedValue(new Error('offline'))],
    ['invalid response', vi.fn().mockResolvedValue({ providers: [] })]
  ])('uses the built-in catalog after a %s', async (_label, loadRemoteCatalog) => {
    registerAgentIpc({ services: createAgentModelServices(), loadRemoteCatalog })

    const response = (await getHandler('agent:model-catalog:list')({
      sender: {}
    })) as AgentModelCatalogResponse

    expect(response).toMatchObject({
      success: true,
      source: 'fallback',
      catalog: { providers: expect.arrayContaining([expect.objectContaining({ id: 'openai' })]) }
    })
  })

  it('creates, lists, updates, and deletes redacted configurations', async () => {
    registerAgentIpc({ services: createAgentModelServices(), loadRemoteCatalog: vi.fn() })

    const created = (await getHandler('agent:model-config:create')({ sender: {} }, {
      kind: 'provider',
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      apiKey: 'initial-secret'
    } as never)) as AgentModelMutationResponse
    const id = created.configuration?.id

    expect(created).toMatchObject({
      success: true,
      configuration: { kind: 'provider', providerId: 'deepseek', modelId: 'deepseek-v4-flash' }
    })
    expect(JSON.stringify(created)).not.toContain('initial-secret')

    const updated = (await getHandler('agent:model-config:update')({ sender: {} }, {
      id,
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'company-chat',
      apiKey: ''
    } as never)) as AgentModelMutationResponse
    expect(updated).toMatchObject({
      success: true,
      configuration: { id, kind: 'custom', modelId: 'company-chat' }
    })

    const listed = (await getHandler('agent:model-config:list')({
      sender: {}
    })) as AgentModelRegistryResponse
    expect(listed.configurations).toEqual([updated.configuration])
    expect(JSON.stringify(listed)).not.toContain('secret')

    expect(
      await getHandler('agent:model-config:delete')({ sender: {} }, id as never)
    ).toMatchObject({ success: true })
    expect(
      (await getHandler('agent:model-config:list')({ sender: {} })) as AgentModelRegistryResponse
    ).toMatchObject({ configurations: [] })
  })

  it('returns Main validation errors without leaking registry state', async () => {
    registerAgentIpc({ services: createAgentModelServices(), loadRemoteCatalog: vi.fn() })

    expect(
      await getHandler('agent:model-config:create')({ sender: {} }, {
        kind: 'custom',
        baseUrl: 'not-a-url',
        modelId: 'model',
        apiKey: 'secret'
      } as never)
    ).toEqual({
      success: false,
      message: 'Model Base URL must be a valid HTTP(S) URL'
    })
  })
})
