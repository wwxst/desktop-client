import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const preloadSource = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
const preloadTypes = readFileSync(resolve(process.cwd(), 'src/preload/index.d.ts'), 'utf8')
const mainSource = readFileSync(
  resolve(process.cwd(), 'src/main/codex/registerCodexIpc.ts'),
  'utf8'
)

describe('Codex Electron boundary', () => {
  it('keeps all Codex process and protocol access behind business IPC', () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('codex:status:get'")
    expect(preloadSource).toContain("ipcRenderer.invoke('codex:thread:start'")
    expect(preloadSource).toContain("ipcRenderer.invoke('codex:turn:start'")
    expect(preloadSource).toContain("ipcRenderer.invoke('codex:approval:respond'")
    expect(preloadSource).toContain("ipcRenderer.on('codex:event'")
    expect(preloadSource).not.toContain('child_process')
  })

  it('declares the same Codex methods on Window.api', () => {
    expect(preloadTypes).toContain('getCodexStatus(')
    expect(preloadTypes).toContain('listCodexModels(')
    expect(preloadTypes).toContain('listCodexThreads(')
    expect(preloadTypes).toContain('startCodexThread(')
    expect(preloadTypes).toContain('resumeCodexThread(')
    expect(preloadTypes).toContain('startCodexTurn(')
    expect(preloadTypes).toContain('interruptCodexTurn(')
    expect(preloadTypes).toContain('respondCodexApproval(')
    expect(preloadTypes).toContain('onCodexEvent(')
  })

  it('validates every Renderer request before calling the service', () => {
    expect(mainSource).toContain('isCodexStartThreadRequest(request)')
    expect(mainSource).toContain('isCodexResumeThreadRequest(request)')
    expect(mainSource).toContain('isCodexStartTurnRequest(request)')
    expect(mainSource).toContain('isCodexInterruptTurnRequest(request)')
    expect(mainSource).toContain('isCodexApprovalResponseRequest(request)')
  })
})
