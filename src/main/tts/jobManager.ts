import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog } from 'electron'

import type {
  TtsCreateJobResponse,
  TtsGenerateRequest,
  TtsJobActionResponse,
  TtsJobProgress,
  TtsPreviewResponse
} from '../../shared/tts'
import { findTtsModel } from './catalog'
import { TtsEngineRegistry } from './engineRegistry'
import { TtsModelManager } from './modelManager'
import { segmentTtsText } from './textSegmenter'
import { mergeWavFiles } from './wavMerger'

const MAX_TEXT_LENGTH = 100_000
const PREVIEW_TEXT_LENGTH = 220
const MAX_RETRY_COUNT = 3

interface InternalTtsJob {
  id: string
  modelId: string
  request: TtsGenerateRequest
  directory: string
  finalPath: string
  segments: string[]
  cancelled: boolean
  status: TtsJobProgress['status']
  createdAt: number
}

export class TtsJobManager {
  private readonly jobs = new Map<string, InternalTtsJob>()
  private activeJobId: string | null = null

  constructor(
    private readonly modelManager: TtsModelManager,
    private readonly engineRegistry: TtsEngineRegistry
  ) {}

  hasActiveJob(): boolean {
    return this.activeJobId !== null
  }

  async preview(request: TtsGenerateRequest): Promise<TtsPreviewResponse> {
    const validationMessage = await this.validateRequest(request)
    if (validationMessage) {
      return {
        success: false,
        message: validationMessage
      }
    }

    if (this.hasActiveJob()) {
      return {
        success: false,
        message: '正在生成长文本，请完成或取消当前任务后再试听'
      }
    }

    const previewText = request.text.trim().slice(0, PREVIEW_TEXT_LENGTH)
    const previewDirectory = join(app.getPath('temp'), 'desktop-client-tts-preview')
    const previewPath = join(previewDirectory, `${randomUUID()}.wav`)

    try {
      await mkdir(previewDirectory, { recursive: true })
      const generated = await this.engineRegistry.generateToFile(request, previewText, previewPath)
      const audioBytes = await readFile(previewPath)

      return {
        success: true,
        message: `已试听前 ${previewText.length} 个字符`,
        audioBytes: new Uint8Array(audioBytes),
        mimeType: 'audio/wav',
        durationSeconds: generated.durationSeconds,
        sampleRate: generated.sampleRate
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '试听生成失败'
      }
    } finally {
      await rm(previewPath, { force: true }).catch(() => undefined)
    }
  }

  async createJob(
    request: TtsGenerateRequest,
    onProgress: (progress: TtsJobProgress) => void
  ): Promise<TtsCreateJobResponse> {
    const validationMessage = await this.validateRequest(request)
    if (validationMessage) {
      return {
        success: false,
        message: validationMessage
      }
    }

    if (this.hasActiveJob()) {
      return {
        success: false,
        message: '当前已有一个配音任务正在运行'
      }
    }

    const segments = segmentTtsText(request.text, {
      language: request.language
    })

    if (segments.length === 0) {
      return {
        success: false,
        message: '文本切分失败，请检查输入内容'
      }
    }

    const jobId = randomUUID()
    const directory = join(app.getPath('temp'), 'desktop-client-tts-jobs', jobId)
    const job: InternalTtsJob = {
      id: jobId,
      modelId: request.modelId,
      request: {
        ...request,
        text: request.text.trim()
      },
      directory,
      finalPath: join(directory, 'final.wav'),
      segments,
      cancelled: false,
      status: 'queued',
      createdAt: Date.now()
    }

    this.jobs.set(jobId, job)
    this.activeJobId = jobId
    this.cleanOldJobs()

    void this.runJob(job, onProgress)

    return {
      success: true,
      message: `任务已创建，共 ${segments.length} 个音频片段`,
      jobId,
      totalSegments: segments.length
    }
  }

  cancel(jobId: string): TtsJobActionResponse {
    const job = this.jobs.get(jobId)

    if (!job) {
      return {
        success: false,
        message: '没有找到需要取消的任务'
      }
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return {
        success: false,
        message: '当前任务已经结束'
      }
    }

    job.cancelled = true

    return {
      success: true,
      message: '取消指令已发送，当前片段完成后停止'
    }
  }

  async save(jobId: string): Promise<TtsJobActionResponse> {
    const job = this.jobs.get(jobId)

    if (!job || job.status !== 'completed') {
      return {
        success: false,
        message: '音频尚未生成完成'
      }
    }

    try {
      await stat(job.finalPath)
    } catch {
      return {
        success: false,
        message: '生成的临时音频已经不存在，请重新生成'
      }
    }

    const result = await dialog.showSaveDialog({
      title: '保存本地配音',
      defaultPath: `本地配音-${new Date().toISOString().slice(0, 10)}.wav`,
      filters: [
        {
          name: 'WAV 音频',
          extensions: ['wav']
        }
      ]
    })

    if (result.canceled || !result.filePath) {
      return {
        success: true,
        canceled: true,
        message: '已取消保存'
      }
    }

    try {
      await copyFile(job.finalPath, result.filePath)
      return {
        success: true,
        canceled: false,
        message: '音频保存成功',
        filePath: result.filePath
      }
    } catch (error) {
      return {
        success: false,
        canceled: false,
        message: error instanceof Error ? `音频保存失败：${error.message}` : '音频保存失败'
      }
    }
  }

  private async runJob(
    job: InternalTtsJob,
    onProgress: (progress: TtsJobProgress) => void
  ): Promise<void> {
    const segmentPaths: string[] = []

    try {
      await rm(job.directory, { recursive: true, force: true })
      await mkdir(job.directory, { recursive: true })

      job.status = 'preparing'
      this.report(job, onProgress, {
        status: 'preparing',
        currentSegment: 0,
        percent: 1,
        message: `正在准备 ${job.segments.length} 个文本片段`
      })

      for (let index = 0; index < job.segments.length; index += 1) {
        if (job.cancelled) {
          await this.finishCancelledJob(job, onProgress)
          return
        }

        const segmentPath = join(job.directory, `${String(index + 1).padStart(5, '0')}.wav`)
        segmentPaths.push(segmentPath)
        job.status = 'generating'

        let lastError: unknown = null

        for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt += 1) {
          try {
            this.report(job, onProgress, {
              status: 'generating',
              currentSegment: index + 1,
              percent: Math.max(2, Math.floor((index / job.segments.length) * 92)),
              message:
                attempt === 1
                  ? `正在生成第 ${index + 1} / ${job.segments.length} 段`
                  : `第 ${index + 1} 段生成失败，正在第 ${attempt} 次重试`
            })

            await this.engineRegistry.generateToFile(
              job.request,
              job.segments[index],
              segmentPath
            )
            lastError = null
            break
          } catch (error) {
            lastError = error
          }
        }

        if (lastError) {
          throw lastError
        }

        this.report(job, onProgress, {
          status: 'generating',
          currentSegment: index + 1,
          percent: Math.max(3, Math.floor(((index + 1) / job.segments.length) * 92)),
          message: `第 ${index + 1} / ${job.segments.length} 段生成完成`
        })
      }

      if (job.cancelled) {
        await this.finishCancelledJob(job, onProgress)
        return
      }

      job.status = 'merging'
      this.report(job, onProgress, {
        status: 'merging',
        currentSegment: job.segments.length,
        percent: 95,
        message: '全部片段生成完成，正在合并 WAV 音频'
      })

      const durationSeconds = await mergeWavFiles(segmentPaths, job.finalPath)
      const outputStat = await stat(job.finalPath)

      job.status = 'completed'
      this.report(job, onProgress, {
        status: 'completed',
        currentSegment: job.segments.length,
        percent: 100,
        message: '本地配音生成完成',
        durationSeconds,
        outputSizeBytes: outputStat.size
      })
    } catch (error) {
      job.status = 'failed'
      this.report(job, onProgress, {
        status: 'failed',
        currentSegment: 0,
        percent: 0,
        message: error instanceof Error ? error.message : '本地配音生成失败'
      })
    } finally {
      if (this.activeJobId === job.id) {
        this.activeJobId = null
      }

      if (job.status !== 'completed') {
        await rm(job.directory, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  private async finishCancelledJob(
    job: InternalTtsJob,
    onProgress: (progress: TtsJobProgress) => void
  ): Promise<void> {
    job.status = 'cancelled'
    this.report(job, onProgress, {
      status: 'cancelled',
      currentSegment: 0,
      percent: 0,
      message: '配音任务已取消'
    })
  }

  private report(
    job: InternalTtsJob,
    onProgress: (progress: TtsJobProgress) => void,
    data: Omit<TtsJobProgress, 'jobId' | 'modelId' | 'totalSegments'>
  ): void {
    onProgress({
      jobId: job.id,
      modelId: job.modelId,
      totalSegments: job.segments.length,
      ...data
    })
  }

  private async validateRequest(request: TtsGenerateRequest): Promise<string | null> {
    const text = request.text.trim()

    if (!text) {
      return '请输入需要转换的文本'
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return `单次最多输入 ${MAX_TEXT_LENGTH.toLocaleString()} 个字符`
    }

    if (!Number.isFinite(request.speed) || request.speed < 0.5 || request.speed > 2) {
      return '语速参数必须在 0.5x 到 2.0x 之间'
    }

    const model = findTtsModel(request.modelId)
    if (!model) {
      return '请选择有效的语音模型'
    }

    if (!(await this.modelManager.isInstalled(model))) {
      return '所选语音模型尚未安装'
    }

    if (!model.supportedLanguages.some((language) => language.code === request.language)) {
      return '所选模型不支持当前语言'
    }

    const voice = model.voices.find((item) => item.id === request.voiceId)
    if (!voice || !voice.languageCodes.includes(request.language)) {
      return '所选音色不支持当前语言'
    }

    return null
  }

  private cleanOldJobs(): void {
    const completedJobs = [...this.jobs.values()]
      .filter((job) => job.status === 'completed' && job.id !== this.activeJobId)
      .sort((first, second) => second.createdAt - first.createdAt)

    for (const oldJob of completedJobs.slice(5)) {
      this.jobs.delete(oldJob.id)
      void rm(oldJob.directory, { recursive: true, force: true })
    }
  }
}
