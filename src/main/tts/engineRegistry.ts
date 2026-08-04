import { cpus } from 'node:os'
import { join } from 'node:path'

import type { TtsGenerateRequest } from '../../shared/tts'
import { findTtsModel, getEngineLanguageCode, type InternalTtsModel } from './catalog'
import { TtsModelManager } from './modelManager'

import type * as SherpaOnnx from 'sherpa-onnx-node'

type SherpaOnnxModule = typeof SherpaOnnx
type OfflineTts = SherpaOnnx.OfflineTts

export interface GeneratedSegmentInfo {
  durationSeconds: number
  sampleRate: number
}

export class TtsEngineRegistry {
  private sherpaOnnxPromise: Promise<SherpaOnnxModule> | null = null
  private readonly engines = new Map<string, Promise<OfflineTts>>()

  constructor(private readonly modelManager: TtsModelManager) {}

  clear(modelId?: string): void {
    if (modelId) {
      this.engines.delete(modelId)
      return
    }

    this.engines.clear()
  }

  async generateToFile(
    request: TtsGenerateRequest,
    text: string,
    outputPath: string
  ): Promise<GeneratedSegmentInfo> {
    const model = findTtsModel(request.modelId)

    if (!model) {
      throw new Error('没有找到所选语音模型')
    }

    const voice = model.voices.find((item) => item.id === request.voiceId)
    if (!voice) {
      throw new Error('没有找到所选音色')
    }

    const engineLanguageCode = getEngineLanguageCode(model, request.language)
    if (!engineLanguageCode) {
      throw new Error('当前模型不支持所选语言')
    }

    const sherpaOnnx = await this.getSherpaOnnx()
    const engine = await this.getEngine(model)

    const generationConfig =
      model.engine === 'supertonic'
        ? new sherpaOnnx.GenerationConfig({
            sid: voice.speakerId,
            speed: request.speed,
            numSteps: 8,
            extra: {
              lang: engineLanguageCode
            }
          })
        : new sherpaOnnx.GenerationConfig({
            sid: voice.speakerId,
            speed: request.speed,
            silenceScale: 0.2
          })

    const audio = await engine.generateAsync({
      text,
      enableExternalBuffer: false,
      generationConfig
    })

    sherpaOnnx.writeWave(outputPath, {
      samples: audio.samples,
      sampleRate: audio.sampleRate
    })

    return {
      durationSeconds: audio.samples.length / audio.sampleRate,
      sampleRate: audio.sampleRate
    }
  }

  private async getSherpaOnnx(): Promise<SherpaOnnxModule> {
    if (!this.sherpaOnnxPromise) {
      this.sherpaOnnxPromise = import('sherpa-onnx-node')
        .then(
          (moduleNamespace) =>
            (Reflect.get(moduleNamespace, 'default') as SherpaOnnxModule | undefined) ??
            moduleNamespace
        )
        .catch((error) => {
          this.sherpaOnnxPromise = null
          throw new Error(
            `本地 TTS 引擎加载失败，请先执行 npm install。${error instanceof Error ? ` 原因：${error.message}` : ''}`
          )
        })
    }

    return this.sherpaOnnxPromise
  }

  private async getEngine(model: InternalTtsModel): Promise<OfflineTts> {
    const cached = this.engines.get(model.id)
    if (cached) {
      return cached
    }

    const enginePromise = this.createEngine(model).catch((error) => {
      this.engines.delete(model.id)
      throw error
    })

    this.engines.set(model.id, enginePromise)
    return enginePromise
  }

  private async createEngine(model: InternalTtsModel): Promise<OfflineTts> {
    if (!(await this.modelManager.isInstalled(model))) {
      throw new Error('所选模型尚未安装，请先下载模型')
    }

    const sherpaOnnx = await this.getSherpaOnnx()
    const modelDirectory = this.modelManager.getInstalledModelPath(model)
    const baseModelConfig = {
      debug: false,
      numThreads: this.getCpuThreadCount(),
      provider: 'cpu'
    }

    if (model.engine === 'kokoro') {
      return sherpaOnnx.OfflineTts.createAsync({
        model: {
          kokoro: {
            model: join(modelDirectory, 'model.onnx'),
            voices: join(modelDirectory, 'voices.bin'),
            tokens: join(modelDirectory, 'tokens.txt'),
            dataDir: join(modelDirectory, 'espeak-ng-data'),
            lexicon: [
              join(modelDirectory, 'lexicon-us-en.txt'),
              join(modelDirectory, 'lexicon-zh.txt')
            ].join(',')
          },
          ...baseModelConfig
        },
        maxNumSentences: 1
      })
    }

    return sherpaOnnx.OfflineTts.createAsync({
      model: {
        supertonic: {
          durationPredictor: join(modelDirectory, 'duration_predictor.int8.onnx'),
          textEncoder: join(modelDirectory, 'text_encoder.int8.onnx'),
          vectorEstimator: join(modelDirectory, 'vector_estimator.int8.onnx'),
          vocoder: join(modelDirectory, 'vocoder.int8.onnx'),
          ttsJson: join(modelDirectory, 'tts.json'),
          unicodeIndexer: join(modelDirectory, 'unicode_indexer.bin'),
          voiceStyle: join(modelDirectory, 'voice.bin')
        },
        ...baseModelConfig
      },
      maxNumSentences: 1
    })
  }

  private getCpuThreadCount(): number {
    const availableCpuCount = cpus().length
    return Math.max(1, Math.min(4, availableCpuCount - 1))
  }
}
