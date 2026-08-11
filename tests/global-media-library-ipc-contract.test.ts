import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync(
  resolve(process.cwd(), 'src/main/mediaLibrary/registerMediaLibraryIpc.ts'),
  'utf8'
)
const preloadSource = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')
const preloadTypes = readFileSync(resolve(process.cwd(), 'src/preload/index.d.ts'), 'utf8')

describe('global media library IPC contract', () => {
  it('registers only the list and native import business channels', () => {
    expect(mainSource).toContain("ipcMain.handle('media-library:list'")
    expect(mainSource).toContain("ipcMain.handle('media-library:import'")
    expect(preloadSource).toContain("ipcRenderer.invoke('media-library:list'")
    expect(preloadSource).toContain("ipcRenderer.invoke('media-library:import'")
  })

  it('declares the matching renderer API methods', () => {
    expect(preloadTypes).toContain('listGlobalMediaLibrary(')
    expect(preloadTypes).toContain('importGlobalMediaFiles(')
  })
})
