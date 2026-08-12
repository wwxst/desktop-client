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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('global media library preload methods', () => {
  it('forwards tag arguments through the allowlisted channels', async () => {
    electronMocks.invoke.mockResolvedValue({ success: true, message: 'ok', assets: [] })

    await window.api.addGlobalMediaTag('asset-1', '封面')
    await window.api.removeGlobalMediaTag('asset-1', '封面')

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      1,
      'media-library:tags:add',
      'asset-1',
      '封面'
    )
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      2,
      'media-library:tags:remove',
      'asset-1',
      '封面'
    )
  })

  it('forwards the original asset ID for relocation', async () => {
    electronMocks.invoke.mockResolvedValue({
      success: true,
      message: 'canceled',
      assets: [],
      canceled: true
    })

    await window.api.relocateGlobalMediaAsset('asset-1')

    expect(electronMocks.invoke).toHaveBeenCalledWith('media-library:relocate', 'asset-1')
  })
})
