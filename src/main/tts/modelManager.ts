import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import {
  access,
  mkdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, net, shell } from 'electron'

import type {
  TtsCatalogResponse,
  TtsModelDownloadProgress,
  TtsModelInfo,
  TtsModelStatus
} from '../../shared/tts'
import { extractTarBz2 } from './archive'
import { TTS_LANGUAGES, TTS_MODELS, findTtsModel, type InternalTtsModel } from './catalog'

interface InstallState {
  status: Exclude<TtsModelStatus, 'not-installed' | 'installed'>
  message: string
}

export class TtsModelManager {
  private readonly installStates = new Map<string, InstallState>()

  getModelsRoot(): string {
    return join(app.getPath('userData'), 'tts-models')
  }

  getInstalledModelPath(model: InternalTtsModel): string {
    return join(this.getModelsRoot(), model.directoryName)
  }

  async getCatalog(): Promise<TtsCatalogResponse> {
    await mkdir(this.getModelsRoot(), { recursive: true })

    const models = await Promise.all(TTS_MODELS.map((model) => this.toPublicModel(model)))

    return {
      success: true,
      message: '本地语音模型目录读取成功',
      languages: TTS_LANGUAGES,
      models,
      modelDirectory: this.getModelsRoot()
    }
  }

  async isInstalled(model: InternalTtsModel): Promise<boolean> {
    const modelDirectory = this.getInstalledModelPath(model)

    try {
      await Promise.all(model.requiredFiles.map((file) => access(join(modelDirectory, file))))
      return true
    } catch {
      return false
    }
  }

  async install(
    modelId: string,
    onProgress: (progress: TtsModelDownloadProgress) => void
  ): Promise<{ success: boolean; message: string }> {
    const model = findTtsModel(modelId)

    if (!model) {
      return {
        success: false,
        message: '未找到需要安装的语音模型'
      }
    }

    if (await this.isInstalled(model)) {
      return {
        success: true,
        message: `${model.name} 已经安装`
      }
    }

    const existingInstallState = this.installStates.get(model.id)
    if (existingInstallState && existingInstallState.status !== 'failed') {
      return {
        success: false,
        message: '该模型正在安装，请勿重复操作'
      }
    }

    // 上一次失败状态只用于页面展示，用户重试时清除。
    if (existingInstallState?.status === 'failed') {
      this.installStates.delete(model.id)
    }

    const root = this.getModelsRoot()
    const downloadDirectory = join(root, '.downloads')
    const extractDirectory = join(root, `.extract-${model.id}-${randomUUID()}`)
    const archiveName = basename(new URL(model.archiveUrl).pathname)
    const archivePath = join(downloadDirectory, `${archiveName}.part`)
    const finalDirectory = this.getInstalledModelPath(model)

    await mkdir(downloadDirectory, { recursive: true })

    try {
      this.installStates.set(model.id, {
        status: 'downloading',
        message: '正在下载模型'
      })

      await this.downloadModel(model, archivePath, onProgress)

      this.installStates.set(model.id, {
        status: 'extracting',
        message: '正在解压模型'
      })

      onProgress({
        modelId: model.id,
        phase: 'extracting',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 96,
        message: '下载完成，正在解压模型文件'
      })

      await rm(extractDirectory, { recursive: true, force: true })
      await extractTarBz2(archivePath, extractDirectory)

      const extractedModelDirectory = join(extractDirectory, model.directoryName)
      await this.verifyDirectory(model, extractedModelDirectory)

      await rm(finalDirectory, { recursive: true, force: true })
      await rename(extractedModelDirectory, finalDirectory)

      await writeFile(
        join(finalDirectory, '.desktop-client-model.json'),
        JSON.stringify(
          {
            id: model.id,
            installedAt: new Date().toISOString(),
            source: model.archiveUrl,
            archiveSha256: await this.calculateSha256(archivePath)
          },
          null,
          2
        ),
        'utf8'
      )

      onProgress({
        modelId: model.id,
        phase: 'completed',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 100,
        message: `${model.name} 安装完成`
      })

      return {
        success: true,
        message: `${model.name} 安装完成`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型安装失败'

      this.installStates.set(model.id, {
        status: 'failed',
        message
      })

      onProgress({
        modelId: model.id,
        phase: 'failed',
        receivedBytes: 0,
        totalBytes: 0,
        percent: 0,
        message
      })

      return {
        success: false,
        message
      }
    } finally {
      await rm(archivePath, { force: true }).catch(() => undefined)
      await rm(extractDirectory, { recursive: true, force: true }).catch(() => undefined)

      const state = this.installStates.get(model.id)
      if (state?.status !== 'failed') {
        this.installStates.delete(model.id)
      }
    }
  }

  async remove(modelId: string): Promise<{ success: boolean; message: string }> {
    const model = findTtsModel(modelId)

    if (!model) {
      return {
        success: false,
        message: '未找到需要删除的语音模型'
      }
    }

    if (this.installStates.has(model.id)) {
      return {
        success: false,
        message: '模型正在安装，暂时不能删除'
      }
    }

    try {
      await rm(this.getInstalledModelPath(model), { recursive: true, force: true })
      return {
        success: true,
        message: `${model.name} 已删除`
      }
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? `模型删除失败：${error.message}`
            : '模型删除失败，请重启客户端后重试'
      }
    }
  }

  async openModelDirectory(): Promise<{ success: boolean; message: string }> {
    await mkdir(this.getModelsRoot(), { recursive: true })
    const errorMessage = await shell.openPath(this.getModelsRoot())

    return errorMessage
      ? { success: false, message: errorMessage }
      : { success: true, message: '已打开模型目录' }
  }

  private async toPublicModel(model: InternalTtsModel): Promise<TtsModelInfo> {
    const installed = await this.isInstalled(model)
    const installState = this.installStates.get(model.id)

    let status: TtsModelStatus = installed ? 'installed' : 'not-installed'
    let statusMessage = installed ? '已安装' : '尚未安装'

    if (installState) {
      status = installState.status
      statusMessage = installState.message
    }

    return {
      id: model.id,
      name: model.name,
      description: model.description,
      engine: model.engine,
      licenseName: model.licenseName,
      licenseNote: model.licenseNote,
      languages: model.supportedLanguages.map((language) => language.code),
      voiceCount: model.voices.length,
      estimatedDownloadMb: model.estimatedDownloadMb,
      status,
      statusMessage,
      voices: installed ? model.voices : []
    }
  }

  private async downloadModel(
    model: InternalTtsModel,
    archivePath: string,
    onProgress: (progress: TtsModelDownloadProgress) => void
  ): Promise<void> {
    const response = await net.fetch(model.archiveUrl, {
      method: 'GET',
      redirect: 'follow'
    })

    if (!response.ok || !response.body) {
      throw new Error(`模型下载失败，HTTP 状态码：${response.status}`)
    }

    const totalBytes = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body.getReader()
    const fileHandle = await open(archivePath, 'w')
    let receivedBytes = 0

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (!value) {
          continue
        }

        await fileHandle.write(value)
        receivedBytes += value.byteLength

        const downloadPercent = totalBytes > 0 ? Math.floor((receivedBytes / totalBytes) * 95) : 0

        onProgress({
          modelId: model.id,
          phase: 'downloading',
          receivedBytes,
          totalBytes,
          percent: Math.min(95, downloadPercent),
          message:
            totalBytes > 0
              ? `正在下载 ${this.formatBytes(receivedBytes)} / ${this.formatBytes(totalBytes)}`
              : `正在下载 ${this.formatBytes(receivedBytes)}`
        })
      }
    } finally {
      await fileHandle.close()
      reader.releaseLock()
    }

    const archiveStat = await stat(archivePath)
    if (archiveStat.size < 1024 * 1024) {
      throw new Error('下载到的模型文件异常，请检查网络后重试')
    }
  }

  private async verifyDirectory(model: InternalTtsModel, directory: string): Promise<void> {
    await Promise.all(
      model.requiredFiles.map(async (file) => {
        const filePath = join(directory, file)
        await access(filePath)

        const fileStat = await stat(filePath)
        if (fileStat.isFile() && fileStat.size === 0) {
          throw new Error(`模型文件为空：${file}`)
        }
      })
    )
  }

  private async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const input = createReadStream(filePath)

      input.on('data', (chunk) => hash.update(chunk))
      input.on('error', reject)
      input.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) {
      return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / 1024 ** index

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
  }
}
