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

describe('Codex preload methods', () => {
  it('forwards only the allowlisted Codex business channels', async () => {
    electronMocks.invoke.mockResolvedValue({ success: true })
    const startThread = { model: 'gpt-5', permissionMode: 'request' as const }
    const resumeThread = { threadId: 'thread-1', permissionMode: 'smart' as const }
    const startTurn = {
      threadId: 'thread-1',
      text: '开始',
      permissionMode: 'request' as const
    }
    const interruptTurn = { threadId: 'thread-1', turnId: 'turn-1' }
    const approval = { requestId: 'approval-1', decision: 'decline' as const }

    await window.api.getCodexStatus()
    await window.api.listCodexModels()
    await window.api.listCodexThreads()
    await window.api.startCodexThread(startThread)
    await window.api.resumeCodexThread(resumeThread)
    await window.api.startCodexTurn(startTurn)
    await window.api.interruptCodexTurn(interruptTurn)
    await window.api.respondCodexApproval(approval)

    expect(electronMocks.invoke.mock.calls).toEqual([
      ['codex:status:get'],
      ['codex:model:list'],
      ['codex:thread:list'],
      ['codex:thread:start', startThread],
      ['codex:thread:resume', resumeThread],
      ['codex:turn:start', startTurn],
      ['codex:turn:interrupt', interruptTurn],
      ['codex:approval:respond', approval]
    ])
  })

  it('returns a disposer for the Codex event listener', () => {
    const callback = vi.fn()
    const dispose = window.api.onCodexEvent(callback)
    const listener = electronMocks.on.mock.calls[0][1]
    const event = { type: 'status-changed', connected: true, message: 'ok' }

    listener({}, event)
    dispose()

    expect(callback).toHaveBeenCalledWith(event)
    expect(electronMocks.removeListener).toHaveBeenCalledWith('codex:event', listener)
  })
})
