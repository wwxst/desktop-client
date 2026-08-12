import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceView from '../src/renderer/src/components/Workspace/WorkspaceView'

describe('WorkspaceView', () => {
  it('opens the settings workspace from the account gear and returns to the app', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '模型目录加载成功',
          source: 'remote',
          catalog: { providers: [] }
        }),
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: []
        }),
        createAgentModelConfiguration: vi.fn(),
        updateAgentModelConfiguration: vi.fn(),
        deleteAgentModelConfiguration: vi.fn()
      }
    })
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '主菜单' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AI 助手' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回应用' }))

    expect(screen.getByRole('navigation', { name: '主菜单' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AI 助手' })).toBeInTheDocument()
  })

  it('opens the same settings workspace from the AI panel', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '模型目录加载成功',
          source: 'remote',
          catalog: { providers: [] }
        }),
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: []
        }),
        createAgentModelConfiguration: vi.fn(),
        updateAgentModelConfiguration: vi.fn(),
        deleteAgentModelConfiguration: vi.fn()
      }
    })
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: 'AI 面板设置' }))

    expect(screen.getByRole('region', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'AI 模型' })).toBeInTheDocument()
  })

  it('returns to an active smart edit session after visiting settings', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '模型目录加载成功',
          source: 'remote',
          catalog: { providers: [] }
        }),
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: []
        }),
        createAgentModelConfiguration: vi.fn(),
        updateAgentModelConfiguration: vi.fn(),
        deleteAgentModelConfiguration: vi.fn()
      }
    })
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '智剪' }))
    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '返回应用' }))

    expect(screen.getByRole('region', { name: '智剪编辑器' })).toBeInTheDocument()
  })

  it('keeps the current AI conversation after visiting settings', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listAgentModelCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '模型目录加载成功',
          source: 'remote',
          catalog: { providers: [] }
        }),
        listAgentModelConfigurations: vi.fn().mockResolvedValue({
          success: true,
          message: '模型配置加载成功',
          configurations: []
        }),
        createAgentModelConfiguration: vi.fn(),
        updateAgentModelConfiguration: vi.fn(),
        deleteAgentModelConfiguration: vi.fn()
      }
    })
    const user = userEvent.setup()
    render(<WorkspaceView />)
    const aiPanel = screen.getByRole('region', { name: 'AI 助手' })

    await user.click(screen.getByRole('button', { name: '短剧' }))
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(screen.getByRole('region', { name: 'AI 助手' })).toBe(aiPanel)
    expect(screen.getByRole('log', { name: '当前会话' })).toHaveTextContent('短剧')
    await user.click(screen.getByRole('button', { name: 'AI 面板设置' }))
    await user.click(screen.getByRole('button', { name: '返回应用' }))

    expect(screen.getByRole('log', { name: '当前会话' })).toHaveTextContent('短剧')
  })

  it('opens the media library with its empty state and import entry point', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listGlobalMediaLibrary: vi.fn().mockResolvedValue({
          success: true,
          message: '素材库为空',
          assets: []
        }),
        importGlobalMediaFiles: vi.fn()
      }
    })
    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '媒体库' }))

    expect(screen.getByRole('button', { name: '媒体库' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '媒体库' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '媒体库' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入媒体' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('还没有已索引的素材')
  })

  it('opens smart edit, creates a draft, and returns to the draft list', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)

    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    expect(screen.getByRole('region', { name: '智剪编辑器' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '返回草稿' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
  })

  it('resets an editor session after selecting another menu', async () => {
    const user = userEvent.setup()
    render(<WorkspaceView />)
    const mainMenu = within(screen.getByRole('navigation', { name: '主菜单' }))

    await user.click(mainMenu.getByRole('button', { name: '智剪' }))
    await user.click(screen.getByRole('button', { name: '新建草稿' }))
    await user.click(mainMenu.getByRole('button', { name: '小说推文' }))
    expect(mainMenu.getByRole('button', { name: '小说推文' })).toHaveAttribute(
      'aria-current',
      'page'
    )

    await user.click(mainMenu.getByRole('button', { name: '智剪' }))
    expect(screen.getByRole('region', { name: '智剪草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '智剪编辑器' })).not.toBeInTheDocument()
  })

  it('opens the plugin center from the sidebar', async () => {
    const removeListener = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listTtsCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '本地语音资源读取成功',
          languages: [],
          models: [],
          modelDirectory: 'C:\\tts-models'
        }),
        onTtsModelDownloadProgress: vi.fn(() => removeListener)
      }
    })

    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: '插件' }))

    expect(screen.getByRole('button', { name: '插件' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '插件中心' })).toBeInTheDocument()
  })

  it('opens the TTS voiceover page from the sidebar', async () => {
    const removeListener = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listTtsCatalog: vi.fn().mockResolvedValue({
          success: true,
          message: '本地语音模型目录读取成功',
          languages: [{ code: 'zh-CN', name: '中文', englishName: 'Chinese' }],
          models: [
            {
              id: 'kokoro-test',
              name: 'Kokoro 测试模型',
              description: '用于渲染测试的本地模型',
              engine: 'kokoro',
              licenseName: 'Apache-2.0',
              licenseNote: '测试模型',
              languages: ['zh-CN'],
              voiceCount: 1,
              estimatedDownloadMb: 1,
              status: 'installed',
              statusMessage: '已安装',
              voices: [
                {
                  id: 'kokoro-test:zf-test',
                  modelId: 'kokoro-test',
                  speakerId: 0,
                  name: '中文女声 TEST',
                  originalName: 'zf_test',
                  languageCodes: ['zh-CN'],
                  gender: 'female',
                  description: '中文测试音色'
                }
              ]
            }
          ],
          modelDirectory: 'C:\\tts-models'
        }),
        onTtsModelDownloadProgress: vi.fn(() => removeListener),
        onTtsJobProgress: vi.fn(() => removeListener)
      }
    })

    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: 'TTS 配音' }))

    expect(screen.getByRole('region', { name: 'TTS 配音' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '配音文本' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '配音文案' })).toBeInTheDocument()
    const preview = screen.getByRole('complementary', { name: '语言和音色选择' })
    expect(within(preview).getByRole('combobox', { name: '文本语言' })).toHaveValue('zh-CN')
    expect(within(preview).queryByText('本地语音模型')).not.toBeInTheDocument()
    expect(within(preview).queryByText('Kokoro 测试模型')).not.toBeInTheDocument()
    expect(await within(preview).findByRole('radio')).toBeChecked()
    expect(within(preview).queryByRole('combobox', { name: '语速' })).not.toBeInTheDocument()
    await user.click(within(preview).getByRole('button', { name: '高级设置' }))
    expect(within(preview).getByRole('region', { name: '高级设置' })).toBeInTheDocument()
    expect(within(preview).getByRole('combobox', { name: '语速' })).toBeInTheDocument()
    expect(within(preview).getByRole('button', { name: '开始生成' })).toBeDisabled()
  })

  it('opens plugins when the selected language has no installed voice resource', async () => {
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
              id: 'kokoro-test',
              name: 'Kokoro 测试模型',
              description: '用于渲染测试的本地模型',
              engine: 'kokoro',
              licenseName: 'Apache-2.0',
              licenseNote: '测试模型',
              languages: ['zh-CN'],
              voiceCount: 1,
              estimatedDownloadMb: 1,
              status: 'not-installed',
              statusMessage: '未安装',
              voices: []
            }
          ],
          modelDirectory: 'C:\\tts-models'
        }),
        onTtsModelDownloadProgress: vi.fn(() => removeListener),
        onTtsJobProgress: vi.fn(() => removeListener)
      }
    })

    const user = userEvent.setup()
    render(<WorkspaceView />)

    await user.click(screen.getByRole('button', { name: 'TTS 配音' }))
    await user.click(await screen.findByRole('button', { name: '前往插件' }))

    expect(screen.getByRole('button', { name: '插件' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: '插件中心' })).toBeInTheDocument()
  })
})
