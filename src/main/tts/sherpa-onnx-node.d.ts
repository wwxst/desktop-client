declare module 'sherpa-onnx-node' {
  export interface GeneratedAudio {
    samples: Float32Array
    sampleRate: number
  }

  export interface OfflineTtsConfig {
    model: Record<string, unknown>
    maxNumSentences?: number
  }

  export interface GenerateAsyncOptions {
    text: string
    enableExternalBuffer?: boolean
    generationConfig: GenerationConfig
  }

  export class GenerationConfig {
    constructor(config: {
      sid?: number
      speed?: number
      silenceScale?: number
      numSteps?: number
      extra?: Record<string, string>
    })
  }

  export class OfflineTts {
    static createAsync(config: OfflineTtsConfig): Promise<OfflineTts>

    generateAsync(options: GenerateAsyncOptions): Promise<GeneratedAudio>
  }

  export function writeWave(
    filename: string,
    audio: {
      samples: Float32Array
      sampleRate: number
    }
  ): void
}
