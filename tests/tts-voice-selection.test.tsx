import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TtsVoiceoverView from '../src/renderer/src/components/TtsVoiceover/TtsVoiceoverView'

describe('TTS voice selection', () => {
  it('combines installed voices and uses the selected voice resource for preview', async () => {
    const previewTts = vi.fn().mockResolvedValue({
      success: false,
      message: '试听请求已记录'
    })
    const removeListener = vi.fn()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listTtsCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '本地语音资源读取成功',
          languages: [{ code: 'zh-CN', name: '中文', englishName: 'Chinese' }],
          models: [
            {
              id: 'resource-one',
              name: '资源一',
              description: '第一组测试资源',
              engine: 'kokoro',
              licenseName: 'Test',
              licenseNote: 'Test',
              languages: ['zh-CN'],
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
                  languageCodes: ['zh-CN'],
                  gender: 'female',
                  description: '第一组音色'
                }
              ]
            },
            {
              id: 'resource-two',
              name: '资源二',
              description: '第二组测试资源',
              engine: 'kokoro',
              licenseName: 'Test',
              licenseNote: 'Test',
              languages: ['zh-CN'],
              voiceCount: 1,
              estimatedDownloadMb: 1,
              status: 'installed',
              statusMessage: '已安装',
              voices: [
                {
                  id: 'resource-two:voice-two',
                  modelId: 'resource-two',
                  speakerId: 1,
                  name: '第二音色',
                  originalName: 'voice_two',
                  languageCodes: ['zh-CN'],
                  gender: 'male',
                  description: '第二组音色'
                }
              ]
            }
          ],
          modelDirectory: 'C:\\tts-models'
        }),
        previewTts,
        onTtsModelDownloadProgress: vi.fn(() => removeListener),
        onTtsJobProgress: vi.fn(() => removeListener)
      }
    })

    const user = userEvent.setup()
    render(<TtsVoiceoverView />)

    expect(await screen.findAllByRole('radio')).toHaveLength(2)
    await user.click(screen.getByRole('radio', { name: /第二音色/ }))
    await user.click(screen.getByRole('button', { name: '试听' }))

    await waitFor(() => {
      expect(previewTts).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'resource-two',
          voiceId: 'resource-two:voice-two'
        })
      )
    })
  })

  it('describes catalog failures as voice resource errors', async () => {
    const removeListener = vi.fn()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listTtsCatalog: vi.fn().mockRejectedValue(null),
        onTtsJobProgress: vi.fn(() => removeListener)
      }
    })

    render(<TtsVoiceoverView />)

    expect(await screen.findByText('本地语音资源读取失败')).toBeInTheDocument()
    expect(screen.queryByText('本地语音模型目录读取失败')).not.toBeInTheDocument()
  })
})
