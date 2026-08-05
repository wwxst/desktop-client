import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TtsCatalogResponse, TtsJobProgress, TtsPreviewResponse } from '../src/shared/tts'
import TtsVoiceoverView from '../src/renderer/src/components/TtsVoiceover/TtsVoiceoverView'

const NativeUrl = URL

const catalog: TtsCatalogResponse = {
  success: true,
  message: '本地语音资源读取成功',
  languages: [
    { code: 'zh-CN', name: '中文', englishName: 'Chinese' },
    { code: 'en-US', name: '英语（美国）', englishName: 'English (US)' }
  ],
  models: [
    {
      id: 'resource-one',
      name: '资源一',
      description: '第一组测试资源',
      engine: 'kokoro',
      licenseName: 'Test',
      licenseNote: 'Test',
      languages: ['zh-CN', 'en-US'],
      voiceCount: 1,
      estimatedDownloadMb: 1,
      status: 'installed',
      statusMessage: '已安装',
      voices: [
        {
          id: 'resource-one:voice-one',
          modelId: 'resource-one',
          speakerId: 0,
          name: '第一音色',
          originalName: 'voice_one',
          languageCodes: ['zh-CN', 'en-US'],
          gender: 'female',
          description: '第一组音色'
        }
      ]
    },
    {
      id: 'resource-two',
      name: '资源二',
      description: '第二组测试资源',
      engine: 'supertonic',
      licenseName: 'Test',
      licenseNote: 'Test',
      languages: ['zh-CN', 'en-US'],
      voiceCount: 1,
      estimatedDownloadMb: 2,
      status: 'installed',
      statusMessage: '已安装',
      voices: [
        {
          id: 'resource-two:voice-two',
          modelId: 'resource-two',
          speakerId: 1,
          name: '第二音色',
          originalName: 'voice_two',
          languageCodes: ['zh-CN', 'en-US'],
          gender: 'male',
          description: '第二组音色'
        }
      ]
    }
  ],
  modelDirectory: 'C:\\tts-models'
}

const successfulPreview: TtsPreviewResponse = {
  success: true,
  message: '试听生成完成',
  audioBytes: new Uint8Array([82, 73, 70, 70]),
  mimeType: 'audio/wav',
  durationSeconds: 1,
  sampleRate: 24_000
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function setWindowApi(
  previewTts: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(successfulPreview)
): { emitJobProgress: (progress: TtsJobProgress) => void } {
  const removeListener = vi.fn()
  let jobProgressListener: ((progress: TtsJobProgress) => void) | null = null

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      login: vi.fn(),
      getSubscription: vi.fn(),
      listTtsCatalog: vi.fn().mockResolvedValue(catalog),
      installTtsModel: vi.fn(),
      removeTtsModel: vi.fn(),
      openTtsModelDirectory: vi.fn(),
      previewTts,
      createTtsJob: vi.fn(),
      cancelTtsJob: vi.fn(),
      saveTtsJob: vi.fn(),
      onTtsModelDownloadProgress: vi.fn(() => removeListener),
      onTtsJobProgress: vi.fn((listener) => {
        jobProgressListener = listener
        return removeListener
      })
    }
  })

  return {
    emitJobProgress: (progress) => jobProgressListener?.(progress)
  }
}

describe('TTS card preview playback', () => {
  const createObjectURL = vi.fn(() => 'blob:preview-1')
  const revokeObjectURL = vi.fn()
  const play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const pause = vi.fn()
  const load = vi.fn()

  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue('blob:preview-1')
    revokeObjectURL.mockReset()
    play.mockReset().mockResolvedValue(undefined)
    pause.mockReset()
    load.mockReset()
    class PreviewUrl extends NativeUrl {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
    vi.stubGlobal('URL', PreviewUrl)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('automatically plays a successful preview without rendering audio controls', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    expect(previewTts).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(document.querySelector('audio')).not.toBeInTheDocument()
  })

  it('shows playing state only on the active voice card', async () => {
    setWindowApi()
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第二音色' }))

    const playingButton = await screen.findByRole('button', { name: '播放中：第二音色' })
    expect(playingButton).toHaveTextContent('播放中')
    expect(playingButton).toHaveAttribute('data-playing', 'true')
    expect(screen.getByRole('button', { name: '试听音色：第一音色' })).toHaveAttribute(
      'data-playing',
      'false'
    )
  })

  it('returns the active voice card to idle when playback ends', async () => {
    setWindowApi()
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    const audio = play.mock.contexts[0] as HTMLAudioElement

    act(() => {
      audio.onended?.call(audio, new Event('ended'))
    })

    expect(screen.getByRole('button', { name: '试听音色：第一音色' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '播放中：第一音色' })).not.toBeInTheDocument()
  })

  it('reports media errors, releases the bad cache, and regenerates on the next click', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第二音色' }))
    await screen.findByRole('button', { name: '播放中：第二音色' })
    const audio = play.mock.contexts[0] as HTMLAudioElement

    act(() => {
      audio.onerror?.call(audio, new Event('error'))
    })

    expect(screen.getByText('试听播放失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '试听音色：第二音色' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '播放中：第二音色' })).not.toBeInTheDocument()
    expect(audio).not.toHaveAttribute('src')
    expect(load).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')

    await user.click(screen.getByRole('button', { name: '试听音色：第二音色' }))
    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
  })

  it('ignores a stale media error after a newer preview starts', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    const audio = play.mock.contexts[0] as HTMLAudioElement
    const staleErrorHandler = audio.onerror
    await user.click(screen.getByRole('button', { name: '试听音色：第二音色' }))
    await screen.findByRole('button', { name: '播放中：第二音色' })

    act(() => {
      staleErrorHandler?.call(audio, new Event('error'))
    })

    expect(screen.getByRole('button', { name: '播放中：第二音色' })).toBeInTheDocument()
    expect(screen.queryByText('试听播放失败')).not.toBeInTheDocument()
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:second')
  })

  it('stops and replays a cached URL when the same request is previewed again', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    const previewButton = await screen.findByRole('button', { name: '试听音色：第一音色' })
    await user.click(previewButton)
    await screen.findByRole('button', { name: '播放中：第一音色' })
    await user.click(screen.getByRole('button', { name: '播放中：第一音色' }))

    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(previewTts).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalled()
    const audio = play.mock.contexts[1] as HTMLAudioElement
    expect(audio.src).toContain('blob:preview-1')
    expect(audio.currentTime).toBe(0)
  })

  it('stops the active voice and plays a different voice without changing selection', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    const radios = await screen.findAllByRole('radio')
    await user.click(screen.getByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    await user.click(screen.getByRole('button', { name: '试听音色：第二音色' }))

    await screen.findByRole('button', { name: '播放中：第二音色' })
    expect(previewTts).toHaveBeenCalledTimes(2)
    expect(previewTts).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelId: 'resource-two', voiceId: 'resource-two:voice-two' })
    )
    expect(pause).toHaveBeenCalled()
    expect(radios[0]).toBeChecked()
    expect(radios[1]).not.toBeChecked()
  })

  it('invalidates cached previews when the script changes', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    const script = screen.getByRole('textbox', { name: '配音文案' })
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    const audio = play.mock.contexts[0] as HTMLAudioElement
    await user.type(script, '新')

    expect(audio).not.toHaveAttribute('src')
    expect(load).toHaveBeenCalled()
    expect(load.mock.invocationCallOrder[0]).toBeLessThan(
      revokeObjectURL.mock.invocationCallOrder[0]
    )

    await user.click(screen.getByRole('button', { name: '试听音色：第一音色' }))

    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
    expect(previewTts).toHaveBeenLastCalledWith(expect.objectContaining({ text: '新' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('invalidates cached previews when language or speed changes', async () => {
    const previewTts = vi.fn().mockResolvedValue(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    await user.selectOptions(screen.getByRole('combobox', { name: '文本语言' }), 'en-US')
    await user.click(screen.getByRole('button', { name: '试听音色：第一音色' }))
    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: '高级设置' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '语速' }), '1.2')
    await user.click(screen.getByRole('button', { name: '试听音色：第一音色' }))

    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(3))
    expect(previewTts).toHaveBeenLastCalledWith(
      expect.objectContaining({ language: 'en-US', speed: 1.2 })
    )
  })

  it('marks only the clicked voice as generating and blocks concurrent previews', async () => {
    const pending = deferred<TtsPreviewResponse>()
    const previewTts = vi.fn(() => pending.promise)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第二音色' }))

    const generatingButton = screen.getByRole('button', { name: '生成中：第二音色' })
    expect(generatingButton).toHaveTextContent('生成中')
    expect(screen.queryByRole('button', { name: '生成中：第一音色' })).not.toBeInTheDocument()
    const previewButtons = screen.getAllByRole('button', { name: /(?:试听音色|生成中)：/ })
    expect(previewButtons).toHaveLength(2)
    previewButtons.forEach((button) => expect(button).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: '试听音色：第一音色' }))
    expect(previewTts).toHaveBeenCalledTimes(1)

    pending.resolve(successfulPreview)
    await screen.findByRole('button', { name: '播放中：第二音色' })
  })

  it('discards a pending response after settings change and allows regeneration', async () => {
    const pending = deferred<TtsPreviewResponse>()
    const previewTts = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await user.type(screen.getByRole('textbox', { name: '配音文案' }), '已更新的文案')
    pending.resolve(successfulPreview)

    const previewButton = await screen.findByRole('button', { name: '试听音色：第一音色' })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(screen.queryByText('正在使用本机 CPU 生成试听音频')).not.toBeInTheDocument()

    await user.click(previewButton)
    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
    expect(previewTts).toHaveBeenLastCalledWith(expect.objectContaining({ text: '已更新的文案' }))
  })

  it('discards a pending response after language change and regenerates for the new language', async () => {
    const pending = deferred<TtsPreviewResponse>()
    const previewTts = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '文本语言' }), 'en-US')
    pending.resolve(successfulPreview)

    const previewButton = await screen.findByRole('button', { name: '试听音色：第一音色' })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(screen.queryByText('正在使用本机 CPU 生成试听音频')).not.toBeInTheDocument()

    await user.click(previewButton)
    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
    expect(previewTts).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en-US' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
  })

  it('discards a pending response after speed change and regenerates at the new speed', async () => {
    const pending = deferred<TtsPreviewResponse>()
    const previewTts = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(successfulPreview)
    setWindowApi(previewTts)
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '高级设置' }))
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '语速' }), '1.2')
    pending.resolve(successfulPreview)

    const previewButton = await screen.findByRole('button', { name: '试听音色：第一音色' })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(screen.queryByText('正在使用本机 CPU 生成试听音频')).not.toBeInTheDocument()

    await user.click(previewButton)
    await waitFor(() => expect(previewTts).toHaveBeenCalledTimes(2))
    expect(previewTts).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 1.2 }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
  })

  it.each(['script', 'language', 'speed'] as const)(
    'does not retain a stale rejection notice after %s invalidates a pending preview',
    async (setting) => {
      const pending = deferred<TtsPreviewResponse>()
      setWindowApi(vi.fn(() => pending.promise))
      const user = userEvent.setup()

      render(<TtsVoiceoverView />)
      if (setting === 'speed') {
        await user.click(await screen.findByRole('button', { name: '高级设置' }))
      }
      await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))

      if (setting === 'script') {
        await user.type(screen.getByRole('textbox', { name: '配音文案' }), '失效文案')
      } else if (setting === 'language') {
        await user.selectOptions(screen.getByRole('combobox', { name: '文本语言' }), 'en-US')
      } else {
        await user.selectOptions(screen.getByRole('combobox', { name: '语速' }), '1.2')
      }

      pending.reject(new Error('过期试听失败'))

      await screen.findByRole('button', { name: '试听音色：第一音色' })
      expect(screen.queryByText('正在使用本机 CPU 生成试听音频')).not.toBeInTheDocument()
      expect(screen.queryByText('过期试听失败')).not.toBeInTheDocument()
    }
  )

  it('preserves an unrelated notice when a stale preview settles', async () => {
    const pending = deferred<TtsPreviewResponse>()
    const { emitJobProgress } = setWindowApi(vi.fn(() => pending.promise))
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await user.type(screen.getByRole('textbox', { name: '配音文案' }), '失效文案')
    act(() => {
      emitJobProgress({
        jobId: 'formal-job',
        modelId: 'resource-one',
        status: 'cancelled',
        currentSegment: 0,
        totalSegments: 1,
        percent: 0,
        message: '正式任务已取消'
      })
    })
    pending.resolve(successfulPreview)

    await screen.findByRole('button', { name: '试听音色：第一音色' })
    expect(screen.getByRole('status')).toHaveTextContent('正式任务已取消')
  })

  it('restores idle state and keeps the response notice after generation failure', async () => {
    setWindowApi(
      vi.fn().mockResolvedValue({
        success: false,
        message: '试听服务不可用'
      } satisfies TtsPreviewResponse)
    )
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))

    expect(await screen.findByText('试听服务不可用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '试听音色：第一音色' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /播放中：/ })).not.toBeInTheDocument()
  })

  it('reports play rejection and clears playing state without a fallback player', async () => {
    play.mockRejectedValueOnce(new Error('autoplay blocked'))
    setWindowApi()
    const user = userEvent.setup()

    render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))

    expect(await screen.findByText('试听播放失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '试听音色：第一音色' })).toBeEnabled()
    expect(document.querySelector('audio')).not.toBeInTheDocument()
  })

  it('stops audio and revokes its URL on unmount', async () => {
    setWindowApi()
    const user = userEvent.setup()

    const { unmount } = render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    await screen.findByRole('button', { name: '播放中：第一音色' })
    const audio = play.mock.contexts[0] as HTMLAudioElement
    pause.mockClear()
    load.mockClear()

    unmount()

    expect(pause).toHaveBeenCalledTimes(1)
    expect(audio).not.toHaveAttribute('src')
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.invocationCallOrder[0]).toBeLessThan(
      revokeObjectURL.mock.invocationCallOrder[0]
    )
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('ignores preview responses that arrive after unmount', async () => {
    const pending = deferred<TtsPreviewResponse>()
    setWindowApi(vi.fn(() => pending.promise))
    const user = userEvent.setup()

    const { unmount } = render(<TtsVoiceoverView />)
    await user.click(await screen.findByRole('button', { name: '试听音色：第一音色' }))
    unmount()
    pending.resolve(successfulPreview)

    await Promise.resolve()
    await Promise.resolve()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})
