import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GlobalMediaLibraryResponse,
  GlobalMediaRelocationResponse
} from '../../shared/mediaLibrary'

type TestIpcHandler = (event: { sender: unknown }, ...args: unknown[]) => Promise<unknown>

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, TestIpcHandler>()

  return {
    handlers,
    getPath: vi.fn(),
    fromWebContents: vi.fn(),
    showOpenDialog: vi.fn(),
    handle: vi.fn((channel: string, handler: TestIpcHandler) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    })
  }
})

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  BrowserWindow: { fromWebContents: electronMocks.fromWebContents },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler
  }
}))

import { registerMediaLibraryIpc } from './registerMediaLibraryIpc'

const temporaryDirectories: string[] = []

function getHandler(channel: string): TestIpcHandler {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  return handler
}

beforeEach(async () => {
  vi.clearAllMocks()
  electronMocks.handlers.clear()
  const directory = await mkdtemp(join(tmpdir(), 'desktop-client-media-ipc-'))
  temporaryDirectories.push(directory)
  electronMocks.getPath.mockReturnValue(directory)
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('registerMediaLibraryIpc', () => {
  it('persists tag additions and removals through the registered handlers', async () => {
    const userDataPath = electronMocks.getPath()
    const mediaLibraryPath = join(userDataPath, 'media-library')
    await mkdir(mediaLibraryPath, { recursive: true })
    await writeFile(
      join(mediaLibraryPath, 'index.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'asset-1',
            name: 'missing.png',
            sourcePath: join(userDataPath, 'missing.png'),
            kind: 'image',
            sizeBytes: 5,
            fileModifiedAt: '2026-08-11T11:00:00.000Z',
            importedAt: '2026-08-11T12:00:00.000Z',
            availability: 'missing',
            tags: []
          }
        ]
      })
    )
    registerMediaLibraryIpc()

    const added = (await getHandler('media-library:tags:add')(
      { sender: {} },
      'asset-1',
      ' 封面 '
    )) as GlobalMediaLibraryResponse
    const removed = (await getHandler('media-library:tags:remove')(
      { sender: {} },
      'asset-1',
      '封面'
    )) as GlobalMediaLibraryResponse

    expect(added).toMatchObject({ success: true, assets: [{ id: 'asset-1', tags: ['封面'] }] })
    expect(removed).toMatchObject({ success: true, assets: [{ id: 'asset-1', tags: [] }] })
    const persisted = JSON.parse(await readFile(join(mediaLibraryPath, 'index.json'), 'utf8')) as {
      assets: Array<{ tags: string[] }>
    }
    expect(persisted.assets[0].tags).toEqual([])
  })

  it('returns a structured tag failure for an unknown asset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    registerMediaLibraryIpc()

    const response = (await getHandler('media-library:tags:add')(
      { sender: {} },
      'missing-id',
      '封面'
    )) as GlobalMediaLibraryResponse

    expect(response).toEqual({
      success: false,
      message: '更新素材标签失败，请稍后重试',
      assets: []
    })
  })

  it('opens relocation with the sender window and returns a structured cancellation', async () => {
    const sender = { id: 'sender' }
    const owner = { id: 'owner' }
    electronMocks.fromWebContents.mockReturnValue(owner)
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    registerMediaLibraryIpc()

    const response = (await getHandler('media-library:relocate')(
      { sender },
      'asset-1'
    )) as GlobalMediaRelocationResponse

    expect(electronMocks.fromWebContents).toHaveBeenCalledWith(sender)
    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ properties: ['openFile'] })
    )
    expect(response).toEqual({
      success: true,
      message: '已取消重新定位',
      assets: [],
      canceled: true
    })
  })

  it('relocates a missing asset while preserving its persistent identity', async () => {
    const userDataPath = electronMocks.getPath()
    const mediaLibraryPath = join(userDataPath, 'media-library')
    const relocatedPath = join(userDataPath, 'relocated.png')
    const importedAt = '2026-08-11T12:00:00.000Z'
    await mkdir(mediaLibraryPath, { recursive: true })
    await writeFile(relocatedPath, 'replacement image')
    await writeFile(
      join(mediaLibraryPath, 'index.json'),
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'asset-1',
            name: 'missing.png',
            sourcePath: join(userDataPath, 'missing.png'),
            kind: 'image',
            sizeBytes: 5,
            fileModifiedAt: '2026-08-11T11:00:00.000Z',
            importedAt,
            availability: 'missing',
            tags: ['封面']
          }
        ]
      })
    )
    electronMocks.fromWebContents.mockReturnValue({ id: 'owner' })
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [relocatedPath] })
    registerMediaLibraryIpc()

    const response = (await getHandler('media-library:relocate')(
      { sender: { id: 'sender' } },
      'asset-1'
    )) as GlobalMediaRelocationResponse

    expect(response).toMatchObject({
      success: true,
      canceled: false,
      assets: [
        {
          id: 'asset-1',
          importedAt,
          sourcePath: relocatedPath,
          availability: 'available',
          tags: ['封面']
        }
      ]
    })
    const persisted = JSON.parse(await readFile(join(mediaLibraryPath, 'index.json'), 'utf8')) as {
      assets: Array<{ id: string; sourcePath: string }>
    }
    expect(persisted.assets[0]).toMatchObject({ id: 'asset-1', sourcePath: relocatedPath })
  })

  it('returns a structured failure when the native dialog rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    electronMocks.fromWebContents.mockReturnValue(null)
    electronMocks.showOpenDialog.mockRejectedValue(new Error('dialog unavailable'))
    registerMediaLibraryIpc()

    const response = (await getHandler('media-library:relocate')(
      { sender: { id: 'sender' } },
      'asset-1'
    )) as GlobalMediaRelocationResponse

    expect(response).toEqual({
      success: false,
      message: '重新定位素材失败，请检查文件后重试',
      assets: [],
      canceled: false
    })
  })
})
