import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectCreateResponse, ProjectDirectorySelectionResponse } from '../../shared/project'

type TestIpcHandler = (event: { sender: object }, ...args: unknown[]) => Promise<unknown>

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, TestIpcHandler>()
  return {
    handlers,
    getPath: vi.fn(),
    fromWebContents: vi.fn(),
    showOpenDialog: vi.fn(),
    handle: vi.fn((channel: string, handler: TestIpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  }
})

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  BrowserWindow: { fromWebContents: electronMocks.fromWebContents },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { handle: electronMocks.handle, removeHandler: electronMocks.removeHandler }
}))

import { registerProjectIpc } from './registerProjectIpc'

const temporaryDirectories: string[] = []

function getHandler(channel: string): TestIpcHandler {
  const handler = electronMocks.handlers.get(channel)
  if (!handler) throw new Error(`IPC handler not registered: ${channel}`)
  return handler
}

beforeEach(async () => {
  vi.clearAllMocks()
  electronMocks.handlers.clear()
  const directory = await mkdtemp(join(tmpdir(), 'desktop-client-project-ipc-'))
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

describe('registerProjectIpc', () => {
  it('creates a project only after the sender selects its directory', async () => {
    const sender = { id: 1 }
    const owner = { id: 'owner' }
    const projectDirectory = join(electronMocks.getPath(), 'selected-project')
    await mkdir(projectDirectory)
    electronMocks.fromWebContents.mockReturnValue(owner)
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectDirectory]
    })
    registerProjectIpc()

    const selection = (await getHandler('project:directory:select')({
      sender
    })) as ProjectDirectorySelectionResponse
    const created = (await getHandler('project:create')(
      { sender },
      { name: '测试项目', rootDirectory: projectDirectory }
    )) as ProjectCreateResponse

    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ properties: ['openDirectory', 'createDirectory'] })
    )
    expect(selection).toMatchObject({
      success: true,
      canceled: false,
      directoryPath: projectDirectory
    })
    expect(created).toMatchObject({
      success: true,
      project: { name: '测试项目', rootDirectory: projectDirectory }
    })
    const manifest = JSON.parse(await readFile(join(projectDirectory, 'project.json'), 'utf8'))
    expect(manifest).toMatchObject({ version: 1, name: '测试项目' })
  })

  it('rejects a directory path that the sender did not select', async () => {
    const projectDirectory = join(electronMocks.getPath(), 'not-selected')
    registerProjectIpc()

    const response = (await getHandler('project:create')(
      { sender: { id: 1 } },
      { name: '测试项目', rootDirectory: projectDirectory }
    )) as ProjectCreateResponse

    expect(response).toEqual({
      success: false,
      message: '请通过系统选择框重新选择项目文件夹',
      project: null,
      projects: []
    })
  })
})
