import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const preloadSource = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
const preloadTypes = readFileSync(resolve(process.cwd(), 'src/preload/index.d.ts'), 'utf8')

describe('Agent preload contract', () => {
  it('exposes model and workflow IPC methods', () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model:configure'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model:status'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:workflow:novel-decompression:start'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:workflow:get'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:workflow:cancel'")
    expect(preloadSource).toContain("ipcRenderer.on('agent:workflow:progress'")
  })

  it('declares the same methods on Window.api', () => {
    expect(preloadTypes).toContain('configureAgentModel(')
    expect(preloadTypes).toContain('getAgentModelStatus(')
    expect(preloadTypes).toContain('runNovelDecompression(')
    expect(preloadTypes).toContain('getAgentTask(')
    expect(preloadTypes).toContain('cancelAgentTask(')
    expect(preloadTypes).toContain('onAgentWorkflowProgress(')
  })
})
