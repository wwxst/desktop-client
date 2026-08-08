import { ipcMain } from 'electron'

import type { TtsGenerateRequest } from '../../shared/tts'
import {
  hasActiveAgentTts,
  ttsEngineRegistry as engineRegistry,
  ttsJobManager as jobManager,
  ttsModelManager as modelManager
} from './services'

/**
 * 注册本地 TTS IPC。
 *
 * React 页面只能调用这里明确开放的能力，不能直接访问文件系统和原生模块。
 */
export function registerTtsIpc(): void {
  const channels = [
    'tts:catalog:list',
    'tts:model:install',
    'tts:model:remove',
    'tts:model:open-directory',
    'tts:preview',
    'tts:job:create',
    'tts:job:cancel',
    'tts:job:save'
  ]

  for (const channel of channels) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('tts:catalog:list', async () => modelManager.getCatalog())

  ipcMain.handle('tts:model:install', async (event, modelId: string) => {
    if (jobManager.hasActiveJob() || hasActiveAgentTts()) {
      return {
        success: false,
        message: '正在生成配音，完成或取消任务后再安装模型'
      }
    }

    return modelManager.install(modelId, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('tts:model:progress', progress)
      }
    })
  })

  ipcMain.handle('tts:model:remove', async (_event, modelId: string) => {
    if (jobManager.hasActiveJob() || hasActiveAgentTts()) {
      return {
        success: false,
        message: '正在生成配音，暂时不能删除模型'
      }
    }

    engineRegistry.clear(modelId)
    return modelManager.remove(modelId)
  })

  ipcMain.handle('tts:model:open-directory', async () => modelManager.openModelDirectory())

  ipcMain.handle('tts:preview', async (_event, request: TtsGenerateRequest) =>
    hasActiveAgentTts()
      ? { success: false, message: 'Agent TTS is currently running' }
      : jobManager.preview(request)
  )

  ipcMain.handle('tts:job:create', async (event, request: TtsGenerateRequest) =>
    hasActiveAgentTts()
      ? Promise.resolve({ success: false, message: 'Agent TTS is currently running' })
      : jobManager.createJob(request, (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('tts:job:progress', progress)
          }
        })
  )

  ipcMain.handle('tts:job:cancel', async (_event, jobId: string) => jobManager.cancel(jobId))

  ipcMain.handle('tts:job:save', async (_event, jobId: string) => jobManager.save(jobId))
}
