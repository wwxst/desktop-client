import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'

import type {
  GlobalMediaImportResponse,
  GlobalMediaLibraryResponse
} from '../../shared/mediaLibrary'
import { GlobalMediaLibraryStore } from './mediaLibraryStore'

const MEDIA_FILE_FILTER = {
  name: '媒体文件',
  extensions: [
    'mp4',
    'mov',
    'mkv',
    'webm',
    'avi',
    'm4v',
    'mp3',
    'wav',
    'm4a',
    'aac',
    'flac',
    'ogg',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'bmp'
  ]
}

function createStore(): GlobalMediaLibraryStore {
  return new GlobalMediaLibraryStore(join(app.getPath('userData'), 'media-library', 'index.json'))
}

export function registerMediaLibraryIpc(): void {
  const store = createStore()

  ipcMain.removeHandler('media-library:list')
  ipcMain.removeHandler('media-library:import')

  ipcMain.handle('media-library:list', async (): Promise<GlobalMediaLibraryResponse> => {
    try {
      const assets = await store.list()
      return {
        success: true,
        message: assets.length > 0 ? `已加载 ${assets.length} 个素材` : '素材库为空',
        assets
      }
    } catch (error) {
      console.error('读取全局素材库失败：', error)
      return {
        success: false,
        message: '读取素材库失败，请稍后重试',
        assets: []
      }
    }
  })

  ipcMain.handle('media-library:import', async (event): Promise<GlobalMediaImportResponse> => {
    try {
      const options: OpenDialogOptions = {
        title: '导入媒体到全局素材库',
        properties: ['openFile', 'multiSelections'],
        filters: [MEDIA_FILE_FILTER]
      }
      const owner = BrowserWindow.fromWebContents(event.sender)
      const selection = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options)

      if (selection.canceled || selection.filePaths.length === 0) {
        return {
          success: true,
          message: '已取消导入',
          assets: await store.list(),
          canceled: true,
          importedCount: 0,
          duplicateCount: 0,
          unsupportedCount: 0
        }
      }

      const result = await store.importFiles(selection.filePaths)
      const details = [
        result.importedCount > 0 ? `新增 ${result.importedCount} 个` : '',
        result.duplicateCount > 0 ? `跳过 ${result.duplicateCount} 个重复素材` : '',
        result.unsupportedCount > 0 ? `忽略 ${result.unsupportedCount} 个无效文件` : ''
      ].filter(Boolean)

      return {
        success: true,
        message: details.join('，') || '没有新增素材',
        assets: result.assets,
        canceled: false,
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        unsupportedCount: result.unsupportedCount
      }
    } catch (error) {
      console.error('导入全局素材失败：', error)
      return {
        success: false,
        message: '导入素材失败，请稍后重试',
        assets: [],
        canceled: false,
        importedCount: 0,
        duplicateCount: 0,
        unsupportedCount: 0
      }
    }
  })
}
