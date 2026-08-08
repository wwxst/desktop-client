import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { StorySourceSegment, TtsWorkflowOutput } from '../../../shared/agent/editingPlan'
import type { NovelTtsOptions } from '../../../shared/agent/workflow'
import type { TtsGenerateRequest } from '../../../shared/tts'
import { findTtsModel, getEngineLanguageCode } from '../../tts/catalog'
import {
  acquireAgentTts,
  releaseAgentTts,
  ttsEngineRegistry as engineRegistry,
  ttsModelManager as modelManager
} from '../../tts/services'
import { segmentTtsText } from '../../tts/textSegmenter'
import { mergeWavFiles } from '../../tts/wavMerger'

const RETRIES = 3

export interface TtsToolProgress {
  current: number
  total: number
  message: string
}

export class TtsTool {
  segmentText(text: string, language: string): StorySourceSegment[] {
    return segmentTtsText(text, { language }).map((segment, index) => ({
      id: `seg-${String(index + 1).padStart(3, '0')}`,
      index,
      text: segment
    }))
  }

  async cleanup(taskId: string): Promise<void> {
    await rm(join(app.getPath('temp'), 'desktop-client-agent', taskId), {
      recursive: true,
      force: true
    })
  }

  async synthesize(
    taskId: string,
    segments: StorySourceSegment[],
    options: NovelTtsOptions,
    onProgress: (progress: TtsToolProgress) => void,
    signal?: AbortSignal
  ): Promise<TtsWorkflowOutput> {
    if (signal?.aborted) throw new Error('Agent task cancelled')
    if (!Number.isFinite(options.speed) || options.speed < 0.5 || options.speed > 2) {
      throw new Error('TTS speed must be between 0.5 and 2')
    }
    if (segments.length === 0) throw new Error('TTS requires at least one text segment')
    const model = findTtsModel(options.modelId)
    if (!model) throw new Error('TTS model was not found')
    if (!getEngineLanguageCode(model, options.language)) {
      throw new Error('TTS model does not support the requested language')
    }
    const voice = model.voices.find((item) => item.id === options.voiceId)
    if (!voice || !voice.languageCodes.includes(options.language)) {
      throw new Error('TTS voice does not support the requested language')
    }
    if (!(await modelManager.isInstalled(model))) {
      throw new Error('TTS model is not installed')
    }
    if (!acquireAgentTts()) throw new Error('Another TTS task is currently running')

    try {
      const directory = join(app.getPath('temp'), 'desktop-client-agent', taskId, 'tts')
      const finalPath = join(directory, 'voice-final.wav')
      await rm(directory, { recursive: true, force: true })
      await mkdir(directory, { recursive: true })

      const request: TtsGenerateRequest = {
        text: '',
        language: options.language,
        modelId: options.modelId,
        voiceId: options.voiceId,
        speed: options.speed
      }

      const timed = [] as TtsWorkflowOutput['segments']
      const paths: string[] = []
      let cursor = 0

      for (let index = 0; index < segments.length; index += 1) {
        if (signal?.aborted) throw new Error('任务已取消')
        const segment = segments[index]
        const path = join(
          directory,
          `${String(index + 1).padStart(5, '0')}-${randomUUID().slice(0, 8)}.wav`
        )
        paths.push(path)
        onProgress({
          current: index,
          total: segments.length,
          message: `正在生成第 ${index + 1}/${segments.length} 段配音`
        })

        let generated: Awaited<ReturnType<typeof engineRegistry.generateToFile>> | undefined
        let lastError: unknown
        for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
          try {
            generated = await engineRegistry.generateToFile(
              { ...request, text: segment.text },
              segment.text,
              path
            )
            lastError = undefined
            break
          } catch (error) {
            lastError = error
            if (signal?.aborted) throw new Error('Agent task cancelled')
            if (attempt < RETRIES) {
              onProgress({
                current: index,
                total: segments.length,
                message: `第 ${index + 1} 段失败，正在第 ${attempt + 1} 次重试`
              })
            }
          }
        }
        if (!generated) throw lastError instanceof Error ? lastError : new Error('TTS 片段生成失败')

        const startSeconds = cursor
        const durationSeconds = generated.durationSeconds
        cursor += durationSeconds
        timed.push({
          ...segment,
          startSeconds,
          endSeconds: cursor,
          durationSeconds,
          audioPath: path
        })
      }

      onProgress({ current: segments.length, total: segments.length, message: '正在合并配音' })
      const mergedDuration = await mergeWavFiles(paths, finalPath)

      return {
        audioPath: finalPath,
        durationSeconds: mergedDuration,
        segments: timed
      }
    } finally {
      releaseAgentTts()
    }
  }
}
