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

describe('project preload methods', () => {
  it('forwards project operations through the allowlisted channels', async () => {
    electronMocks.invoke.mockResolvedValue({ success: true })
    const request = { name: '测试项目', rootDirectory: 'D:\\projects\\test' }

    await window.api.listProjects()
    await window.api.selectProjectDirectory()
    await window.api.createProject(request)

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, 'project:list')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, 'project:directory:select')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, 'project:create', request)
  })
})
