import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { basename, join, normalize, resolve } from 'node:path'

import type {
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectDirectorySelectionResponse,
  ProjectListResponse
} from '../../shared/project'
import { ProjectStore } from './ProjectStore'

function createStore(): ProjectStore {
  return new ProjectStore(join(app.getPath('userData'), 'projects', 'index.json'))
}

function getPathKey(path: string): string {
  const normalizedPath = normalize(resolve(path))
  return process.platform === 'win32' ? normalizedPath.toLocaleLowerCase('en-US') : normalizedPath
}

function isCreateRequest(value: unknown): value is ProjectCreateRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<ProjectCreateRequest>
  return typeof request.name === 'string' && typeof request.rootDirectory === 'string'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '创建项目失败，请稍后重试'
}

export function registerProjectIpc(): void {
  const store = createStore()
  const selectedDirectories = new WeakMap<object, Set<string>>()

  ipcMain.removeHandler('project:list')
  ipcMain.removeHandler('project:directory:select')
  ipcMain.removeHandler('project:create')

  ipcMain.handle('project:list', async (): Promise<ProjectListResponse> => {
    try {
      const projects = await store.list()
      return {
        success: true,
        message: projects.length > 0 ? `已加载 ${projects.length} 个项目` : '暂无项目',
        projects
      }
    } catch (error) {
      console.error('读取项目索引失败：', error)
      return { success: false, message: '读取项目失败，请检查本地项目索引', projects: [] }
    }
  })

  ipcMain.handle(
    'project:directory:select',
    async (event): Promise<ProjectDirectorySelectionResponse> => {
      try {
        const options: OpenDialogOptions = {
          title: '选择项目文件夹',
          properties: ['openDirectory', 'createDirectory']
        }
        const owner = BrowserWindow.fromWebContents(event.sender)
        const selection = owner
          ? await dialog.showOpenDialog(owner, options)
          : await dialog.showOpenDialog(options)

        if (selection.canceled || selection.filePaths.length === 0) {
          return {
            success: true,
            message: '已取消选择',
            canceled: true,
            directoryPath: null,
            directoryName: null
          }
        }

        const directoryPath = resolve(selection.filePaths[0])
        const authorized = selectedDirectories.get(event.sender) ?? new Set<string>()
        authorized.add(getPathKey(directoryPath))
        selectedDirectories.set(event.sender, authorized)
        return {
          success: true,
          message: '已选择项目文件夹',
          canceled: false,
          directoryPath,
          directoryName: basename(directoryPath)
        }
      } catch (error) {
        console.error('选择项目文件夹失败：', error)
        return {
          success: false,
          message: '无法打开文件夹选择框，请稍后重试',
          canceled: false,
          directoryPath: null,
          directoryName: null
        }
      }
    }
  )

  ipcMain.handle(
    'project:create',
    async (event, request: unknown): Promise<ProjectCreateResponse> => {
      if (!isCreateRequest(request)) {
        return { success: false, message: '项目参数无效', project: null, projects: [] }
      }

      const pathKey = getPathKey(request.rootDirectory)
      const authorized = selectedDirectories.get(event.sender)
      if (!authorized?.has(pathKey)) {
        return {
          success: false,
          message: '请通过系统选择框重新选择项目文件夹',
          project: null,
          projects: await store.list().catch(() => [])
        }
      }

      try {
        const projects = await store.create(request)
        authorized.delete(pathKey)
        return {
          success: true,
          message: '项目已创建并保存到本地',
          project: projects.at(-1) ?? null,
          projects
        }
      } catch (error) {
        console.error('创建本地项目失败：', error)
        return {
          success: false,
          message: getErrorMessage(error),
          project: null,
          projects: await store.list().catch(() => [])
        }
      }
    }
  )
}
