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

  it('waits for persistent storage before returning successful mutations', async () => {
    const services = createAgentModelServices()
    const persist = vi.spyOn(services, 'persist').mockRejectedValue(new Error('disk unavailable'))
    registerAgentIpc({ services, loadRemoteCatalog: vi.fn() })

    await expect(
      getHandler('agent:model-config:create')({ sender: {} }, {
        kind: 'custom',
        baseUrl: 'https://gateway.example.test/v1',
        modelId: 'chat-model',
        apiKey: 'secret'
      } as never)
    ).resolves.toEqual({ success: false, message: 'disk unavailable' })
    expect(persist).toHaveBeenCalledOnce()
    expect(services.registry.list()).toEqual([])
  })

  it('waits for persisted configurations before running chat', async () => {
    const services = createAgentModelServices()
    let finishRestore: (() => void) | undefined
    vi.spyOn(services, 'restore').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRestore = () => {
            services.registry.create({
              kind: 'custom',
              baseUrl: 'https://gateway.example.test/v1',
              modelId: 'chat-model',
              apiKey: 'secret'
            })
            resolve()
          }
        })
    )
    const chat = vi.spyOn(services.gateway, 'chat').mockResolvedValue({
      content: '已恢复模型配置',
      toolCalls: []
    })
    registerAgentIpc({ services, loadRemoteCatalog: vi.fn() })

    const response = getHandler('agent:chat:run')({ sender: {} }, {
      configId: 'config-1',
      messages: [{ role: 'user', content: '你好' }]
    } as never)
    expect(chat).not.toHaveBeenCalled()
    finishRestore?.()

    await expect(response).resolves.toMatchObject({ success: true })
    expect(chat).toHaveBeenCalledWith('config-1', [{ role: 'user', content: '你好' }])
  })

  it('reports restore failures and does not overwrite the saved file', async () => {
    const services = createAgentModelServices()
    vi.spyOn(services, 'restore').mockRejectedValue(new Error('decrypt failed'))
    const persist = vi.spyOn(services, 'persist')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    registerAgentIpc({ services, loadRemoteCatalog: vi.fn() })

    await expect(getHandler('agent:model-config:list')({ sender: {} })).resolves.toEqual({
      success: false,
      message: '已保存的模型配置加载失败',
      configurations: []
    })
    await expect(
      getHandler('agent:model-config:create')({ sender: {} }, {
        kind: 'custom',
        baseUrl: 'https://gateway.example.test/v1',
        modelId: 'chat-model',
        apiKey: 'secret'
      } as never)
    ).resolves.toEqual({
      success: false,
      message: '已保存的模型配置加载失败，未覆盖原存储文件'
    })
    expect(persist).not.toHaveBeenCalled()
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

  it('runs chat with an explicit model configuration and rejects malformed requests', async () => {
    const services = createAgentModelServices()
    services.registry.create({
      kind: 'custom',
      baseUrl: 'https://gateway.example.test/v1',
      modelId: 'chat-model',
      apiKey: 'secret'
    })
    vi.spyOn(services.gateway, 'chat').mockResolvedValue({
      content: '',
      toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
    })
    registerAgentIpc({ services, loadRemoteCatalog: vi.fn() })

    await expect(
      getHandler('agent:chat:run')({ sender: {} }, {
        configId: services.registry.list()[0].id,
        mode: 'agent',
        approvalMode: 'request',
        messages: [{ role: 'user', content: '读取工程' }]
      } as never)
    ).resolves.toMatchObject({
      success: true,
      assistant: {
        toolCalls: [{ id: 'call-1', name: 'get_editor_context', arguments: {} }]
      }
    })
    await expect(
      getHandler('agent:chat:run')({ sender: {} }, {
        configId: '',
        mode: 'agent',
        approvalMode: 'request',
        messages: []
      } as never)
    ).resolves.toEqual({ success: false, message: '无效的 AI 对话请求' })
    await expect(
      getHandler('agent:chat:run')({ sender: {} }, {
        configId: services.registry.list()[0].id,
        mode: 'agent',
        approvalMode: 'request',
        messages: [
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call-2',
                name: 'split_selected_clip',
                arguments: { command: 'arbitrary' }
              }
            ]
          }
        ]
      } as never)
    ).resolves.toEqual({ success: false, message: '无效的 AI 对话请求' })
    await expect(
      getHandler('agent:chat:run')({ sender: {} }, {
        configId: services.registry.list()[0].id,
        mode: 'agent',
        approvalMode: 'request',
        messages: [
          {
            role: 'assistant',
            content: '',
            executable: 'arbitrary',
            toolCalls: [{ id: 'call-3', name: 'get_editor_context', arguments: {} }]
          }
        ]
      } as never)
    ).resolves.toEqual({ success: false, message: '无效的 AI 对话请求' })
  })
})
