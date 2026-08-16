import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: electronMocks
}))

vi.mock('@electron-toolkit/preload', () => ({ electronAPI: {} }))

beforeAll(async () => {
  Object.defineProperty(process, 'contextIsolated', { configurable: true, value: false })
  await import('../src/preload/index')
})

beforeEach(() => vi.clearAllMocks())

describe('Agent model preload methods', () => {
  it('forwards catalog and registry calls through allowlisted channels', async () => {
    electronMocks.invoke.mockResolvedValue({ success: true })
    const createRequest = {
      kind: 'provider' as const,
      providerId: 'openai',
      modelId: 'gpt-5.6-terra',
      apiKey: 'secret'
    }
    const updateRequest = { ...createRequest, id: 'config-1', apiKey: '' }

    await window.api.listAgentModelCatalog()
    await window.api.listAgentModelConfigurations()
    await window.api.createAgentModelConfiguration(createRequest)
    await window.api.updateAgentModelConfiguration(updateRequest)
    await window.api.deleteAgentModelConfiguration('config-1')
    const chatRequest = {
      configId: 'config-1',
      messages: [{ role: 'user' as const, content: '你好' }]
    }
    await window.api.runAgentChat(chatRequest)
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, 'agent:model-catalog:list')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, 'agent:model-config:list')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      3,
      'agent:model-config:create',
      createRequest
    )
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      4,
      'agent:model-config:update',
      updateRequest
    )
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(5, 'agent:model-config:delete', 'config-1')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(6, 'agent:chat:run', chatRequest)
  })
})
