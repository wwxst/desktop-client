import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TtsEngineRegistry } from './engineRegistry'

const sherpaMocks = vi.hoisted(() => ({
  createAsync: vi.fn(),
  generateAsync: vi.fn(),
  writeWave: vi.fn()
}))

vi.mock('sherpa-onnx-node', () => ({
  default: {
    OfflineTts: {
      createAsync: sherpaMocks.createAsync
    },
    GenerationConfig: class GenerationConfig {},
    writeWave: sherpaMocks.writeWave
  }
}))

describe('TtsEngineRegistry', () => {
  beforeEach(() => {
    sherpaMocks.createAsync.mockReset()
    sherpaMocks.generateAsync.mockReset()
    sherpaMocks.writeWave.mockReset()
  })

  it('unwraps the default export from the CommonJS sherpa module', async () => {
    const registry = new TtsEngineRegistry({} as never)
    const loadSherpaOnnx = Reflect.get(registry, 'getSherpaOnnx') as () => Promise<{
      OfflineTts?: {
        createAsync?: unknown
      }
    }>

    const sherpaOnnx = await loadSherpaOnnx.call(registry)

    expect(typeof sherpaOnnx.OfflineTts?.createAsync).toBe('function')
  })

  it('uses Electron-compatible owned audio buffers', async () => {
    sherpaMocks.createAsync.mockResolvedValue({
      generateAsync: sherpaMocks.generateAsync
    })
    sherpaMocks.generateAsync.mockResolvedValue({
      samples: new Float32Array(24_000),
      sampleRate: 24_000
    })

    const registry = new TtsEngineRegistry({
      isInstalled: vi.fn().mockResolvedValue(true),
      getInstalledModelPath: vi.fn().mockReturnValue('C:\\tts-model')
    } as never)

    await registry.generateToFile(
      {
        text: '你好',
        language: 'zh-CN',
        modelId: 'kokoro-multi-lang-v1_0',
        voiceId: 'kokoro-multi-lang-v1_0:zf_xiaobei',
        speed: 1
      },
      '你好',
      'preview.wav'
    )

    expect(sherpaMocks.generateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        enableExternalBuffer: false
      })
    )
  })
})
