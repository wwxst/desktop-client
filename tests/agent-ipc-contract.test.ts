import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const preloadSource = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
const preloadTypes = readFileSync(resolve(process.cwd(), 'src/preload/index.d.ts'), 'utf8')

describe('Agent model preload contract', () => {
  it('exposes the catalog and registry IPC methods', () => {
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model-catalog:list'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model-config:list'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model-config:create'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model-config:update'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:model-config:delete'")
    expect(preloadSource).toContain("ipcRenderer.invoke('agent:workflow:novel-decompression:start'")
    expect(preloadSource).toContain("ipcRenderer.on('agent:workflow:progress'")
  })

  it('declares the same methods on Window.api', () => {
    expect(preloadTypes).toContain('listAgentModelCatalog(')
    expect(preloadTypes).toContain('listAgentModelConfigurations(')
    expect(preloadTypes).toContain('createAgentModelConfiguration(')
    expect(preloadTypes).toContain('updateAgentModelConfiguration(')
    expect(preloadTypes).toContain('deleteAgentModelConfiguration(')
    expect(preloadTypes).toContain('runNovelDecompression(')
    expect(preloadTypes).toContain('onAgentWorkflowProgress(')
  })
})
