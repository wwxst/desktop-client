import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodexEvent } from '../../shared/codex'
import type { CodexService } from './CodexService'

type TestIpcHandler = (event: object, request?: unknown) => unknown

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, TestIpcHandler>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: TestIpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  }
})

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'unused') },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: electronMocks.handle, removeHandler: electronMocks.removeHandler }
}))

import { registerCodexIpc } from './registerCodexIpc'

interface ServiceMockFixture {
  service: {
    onEvent: ReturnType<typeof vi.fn>
    getStatus: ReturnType<typeof vi.fn>
    listModels: ReturnType<typeof vi.fn>
    listThreads: ReturnType<typeof vi.fn>
    startThread: ReturnType<typeof vi.fn>
    resumeThread: ReturnType<typeof vi.fn>
    startTurn: ReturnType<typeof vi.fn>
    interruptTurn: ReturnType<typeof vi.fn>
    respondApproval: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }
  emit: (event: CodexEvent) => void
}

function createServiceMock(): ServiceMockFixture {
  let eventListener: ((event: CodexEvent) => void) | null = null
  return {
    service: {
      onEvent: vi.fn((listener: (event: CodexEvent) => void) => {
        eventListener = listener
        return vi.fn()
      }),
      getStatus: vi.fn().mockResolvedValue({ success: true, connected: true, message: 'ok' }),
      listModels: vi.fn().mockResolvedValue({ success: true, message: 'ok', models: [] }),
      listThreads: vi.fn().mockResolvedValue({ success: true, message: 'ok', threads: [] }),
      startThread: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      resumeThread: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      startTurn: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      interruptTurn: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
      respondApproval: vi.fn().mockReturnValue({ success: true, message: 'ok' }),
      stop: vi.fn()
    },
    emit: (event: CodexEvent) => eventListener?.(event)
  }
}

function handler(channel: string): TestIpcHandler {
  const value = electronMocks.handlers.get(channel)
  if (!value) throw new Error(`Missing IPC handler: ${channel}`)
  return value
}

beforeEach(() => {
  vi.clearAllMocks()
  electronMocks.handlers.clear()
})

describe('registerCodexIpc', () => {
  it('validates requests before forwarding them to the Main service', async () => {
    const mock = createServiceMock()
    registerCodexIpc({ service: mock.service as unknown as CodexService })

    const invalid = await handler('codex:turn:start')(
      {},
      {
        threadId: 'thread-1',
        text: '检查',
        permissionMode: 'request',
        cwd: 'C:\\unsafe'
      }
    )
    const valid = { threadId: 'thread-1', text: '检查', permissionMode: 'request' }
    await handler('codex:turn:start')({}, valid)

    expect(invalid).toEqual({ success: false, message: '无效的 Codex Turn 请求' })
    expect(mock.service.startTurn).toHaveBeenCalledOnce()
    expect(mock.service.startTurn).toHaveBeenCalledWith(valid)
  })

  it('forwards structured events and disposes the service', () => {
    const mock = createServiceMock()
    const sendEvent = vi.fn()
    const dispose = registerCodexIpc({
      service: mock.service as unknown as CodexService,
      sendEvent
    })
    const event: CodexEvent = { type: 'status-changed', connected: true, message: 'ok' }

    mock.emit(event)
    dispose()

    expect(sendEvent).toHaveBeenCalledWith(event)
    expect(mock.service.stop).toHaveBeenCalledOnce()
  })
})
