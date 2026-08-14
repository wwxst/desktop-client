import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PluginsView from '../src/renderer/src/components/Plugins/PluginsView'
import type { TtsCatalogResponse, TtsModelDownloadProgress, TtsModelInfo } from '../src/shared/tts'

const removeListener = vi.fn()

const MODEL_DATA = [
  {
    id: 'kokoro-multi-lang-v1_1',
    name: 'Kokoro 中文扩展版',
    engine: 'kokoro',
    languages: ['中文', '英语'],
    voiceCount: 103,
    estimatedDownloadMb: 340
  },
  {
    id: 'kokoro-multi-lang-v1_0',
    name: 'Kokoro 中英通用版',
    engine: 'kokoro',
    languages: ['中文', '英语'],
    voiceCount: 53,
    estimatedDownloadMb: 310
  },
  {
    id: 'supertonic-3-int8-2026-05-11',
    name: 'Supertonic 3 多语言版',
    engine: 'supertonic',
    languages: ['中文', '英语', '日语'],
    voiceCount: 10,
    estimatedDownloadMb: 180
  }
] as const

function createModel(index: number, overrides: Partial<TtsModelInfo> = {}): TtsModelInfo {
  const model = MODEL_DATA[index]
  return {
    ...model,
    description: '测试模型的技术说明',
    licenseName: 'Apache-2.0',
    licenseNote: '测试许可',
    status: 'not-installed',
    statusMessage: '未安装',
    voices: [],
    ...overrides
  }
}

function createCatalog(
  models: TtsModelInfo[] = MODEL_DATA.map((_, index) => createModel(index))
): TtsCatalogResponse {
  return {
    success: true,
    message: '本地语音资源读取成功',
    languages: [{ code: 'zh-CN', name: '中文', englishName: 'Chinese' }],
    models,
    modelDirectory: 'C:\\tts-models'
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function setWindowApi(catalog: TtsCatalogResponse): {
  listTtsCatalog: ReturnType<typeof vi.fn>
  installTtsModel: ReturnType<typeof vi.fn>
  removeTtsModel: ReturnType<typeof vi.fn>
  openTtsModelDirectory: ReturnType<typeof vi.fn>
  emitProgress: (progress: TtsModelDownloadProgress) => void
} {
  const listTtsCatalog = vi.fn().mockResolvedValue(catalog)
  const installTtsModel = vi.fn().mockResolvedValue({ success: true, message: '安装完成' })
  const removeTtsModel = vi.fn().mockResolvedValue({ success: true, message: '删除完成' })
  const openTtsModelDirectory = vi
    .fn()
    .mockResolvedValue({ success: true, message: '已打开模型目录' })
  let progressListener: ((progress: TtsModelDownloadProgress) => void) | null = null

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listTtsCatalog,
      installTtsModel,
      removeTtsModel,
      openTtsModelDirectory,
      onTtsModelDownloadProgress: vi.fn(
        (listener: (progress: TtsModelDownloadProgress) => void) => {
          progressListener = listener
          return removeListener
        }
      )
    }
  })

  return {
    listTtsCatalog,
    installTtsModel,
    removeTtsModel,
    openTtsModelDirectory,
    emitProgress: (progress) => progressListener?.(progress)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PluginsView', () => {
  it('renders three independent plugins in the two-column catalog', async () => {
    setWindowApi(createCatalog())

    render(<PluginsView />)

    expect(screen.getByRole('region', { name: '插件中心' })).toBeInTheDocument()
    const availablePlugins = await screen.findByRole('region', { name: '可安装插件' })
    const grid = availablePlugins.querySelector('.plugins-catalog-section__grid')
    expect(grid).toBeInTheDocument()
    expect(grid?.children).toHaveLength(3)
    expect(within(availablePlugins).getByText('3 个插件')).toBeInTheDocument()
    expect(screen.getByText('中文高品质音色')).toBeInTheDocument()
    expect(screen.getByText('中英通用音色')).toBeInTheDocument()
    expect(screen.getByText('多语言音色')).toBeInTheDocument()
    expect(screen.queryByText('本地 TTS 配音')).not.toBeInTheDocument()
    expect(screen.queryByText('未安装')).not.toBeInTheDocument()
  })

  it('installs each plugin with its own model id', async () => {
    const { installTtsModel } = setWindowApi(createCatalog())
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '安装中文高品质音色' }))
    await waitFor(() => expect(installTtsModel).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '安装中英通用音色' }))
    await waitFor(() => expect(installTtsModel).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: '安装多语言音色' }))

    await waitFor(() => {
      expect(installTtsModel).toHaveBeenNthCalledWith(1, 'kokoro-multi-lang-v1_1')
      expect(installTtsModel).toHaveBeenNthCalledWith(2, 'kokoro-multi-lang-v1_0')
      expect(installTtsModel).toHaveBeenNthCalledWith(3, 'supertonic-3-int8-2026-05-11')
    })
  })

  it('keeps install progress on the card and shows a dismissible success notification', async () => {
    const { installTtsModel } = setWindowApi(createCatalog())
    const installation = deferred<{ success: boolean; message: string }>()
    installTtsModel.mockReturnValueOnce(installation.promise)
    const user = userEvent.setup()

    render(<PluginsView />)

    const installButton = await screen.findByRole('button', {
      name: '安装中文高品质音色'
    })
    const pluginCard = installButton.closest('.plugin-list-item')
    expect(pluginCard).not.toBeNull()
    await user.click(installButton)

    expect(screen.queryByText('正在下载中文高品质音色，请保持网络连接')).not.toBeInTheDocument()
    expect(document.querySelector('.plugins-notice')).not.toBeInTheDocument()
    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
    expect(installButton).toBeDisabled()
    expect(within(pluginCard as HTMLElement).getByText('处理中')).toBeInTheDocument()
    expect(within(pluginCard as HTMLElement).getByText('准备中')).toBeInTheDocument()

    installation.resolve({ success: true, message: '安装完成' })

    const liveRegion = await waitFor(() => {
      const notificationRegion = screen
        .getAllByRole('status')
        .find((region) => region.closest('.ui-alert-notification'))
      expect(notificationRegion).toBeDefined()
      return notificationRegion as HTMLElement
    })
    const notification = liveRegion.closest('.ui-alert-notification')
    expect(notification).toHaveClass('ui-alert-notification--success')
    expect(notification?.querySelector('.ui-alert-notification__title')).toHaveTextContent(
      '操作成功'
    )
    expect(notification?.querySelector('.ui-alert-notification__message')).toHaveTextContent(
      '中文高品质音色安装完成'
    )

    await user.click(within(notification as HTMLElement).getByRole('button', { name: '知道了' }))
    expect(document.querySelector('.ui-alert-notification')).not.toBeInTheDocument()
  })

  it('removes only the plugin selected from its card menu', async () => {
    const { removeTtsModel } = setWindowApi(
      createCatalog([
        createModel(0, { status: 'installed', statusMessage: '已安装' }),
        createModel(1, { status: 'installed', statusMessage: '已安装' }),
        createModel(2)
      ])
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '管理中英通用音色' }))
    await user.click(screen.getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => expect(removeTtsModel).toHaveBeenCalledOnce())
    expect(removeTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_0')
    expect(window.confirm).toHaveBeenCalledWith('确定卸载“中英通用音色”吗？')

    const liveRegion = await screen.findByRole('status')
    const notification = liveRegion.closest('.ui-alert-notification')
    expect(notification).toHaveClass('ui-alert-notification--success')
    expect(notification?.querySelector('.ui-alert-notification__title')).toHaveTextContent(
      '操作成功'
    )
    expect(notification?.querySelector('.ui-alert-notification__message')).toHaveTextContent(
      '中英通用音色已卸载'
    )
  })

  it('splits installed and available plugins without merging their states', async () => {
    setWindowApi(
      createCatalog([
        createModel(0, { status: 'installed', statusMessage: '已安装' }),
        createModel(1),
        createModel(2, { status: 'failed', statusMessage: '模型下载失败' })
      ])
    )

    render(<PluginsView />)

    const installed = await screen.findByRole('region', { name: '已安装插件' })
    const available = screen.getByRole('region', { name: '可安装插件' })
    expect(within(installed).getByText('中文高品质音色')).toBeInTheDocument()
    expect(within(installed).queryByText('中英通用音色')).not.toBeInTheDocument()
    expect(within(available).getByText('中英通用音色')).toBeInTheDocument()
    expect(within(available).getByText('多语言音色')).toBeInTheDocument()
    expect(within(available).getByText('安装失败')).toBeInTheDocument()
    expect(within(available).getByRole('button', { name: '重试安装多语言音色' })).toBeEnabled()
  })

  it('shows download progress only on the plugin being installed', async () => {
    const { emitProgress } = setWindowApi(
      createCatalog([
        createModel(0),
        createModel(1, { status: 'downloading', statusMessage: '正在下载模型' }),
        createModel(2)
      ])
    )

    render(<PluginsView />)

    const activeButton = await screen.findByRole('button', { name: '安装中英通用音色' })
    const activeCard = activeButton.closest('.plugin-list-item')
    expect(activeCard).not.toBeNull()
    expect(within(activeCard as HTMLElement).getByText('处理中')).toBeInTheDocument()
    expect(within(activeCard as HTMLElement).getByText('准备中')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安装中文高品质音色' })).toBeDisabled()

    emitProgress({
      modelId: 'kokoro-multi-lang-v1_0',
      phase: 'downloading',
      percent: 42,
      receivedBytes: 42,
      totalBytes: 100,
      message: '正在下载'
    })

    expect(await within(activeCard as HTMLElement).findByText('42%')).toBeInTheDocument()
    expect(screen.getAllByText('处理中')).toHaveLength(1)
  })

  it('opens a detail page for only the selected plugin', async () => {
    setWindowApi(createCatalog())
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '查看中英通用音色详情' }))

    const detail = screen.getByRole('region', { name: '中英通用音色详情' })
    expect(within(detail).getByRole('heading', { name: '中英通用音色' })).toBeInTheDocument()
    expect(within(detail).getByRole('heading', { name: '关于中英通用音色' })).toBeInTheDocument()
    expect(within(detail).getByRole('tab', { name: '详情' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(within(detail).getByRole('tab', { name: '功能' })).toBeInTheDocument()
    expect(within(detail).getByRole('tab', { name: '更新日志' })).toBeInTheDocument()
    const pluginInformation = within(detail).getByRole('complementary', { name: '插件信息' })
    expect(within(pluginInformation).getByText('voice.zh-en')).toBeInTheDocument()
    expect(within(pluginInformation).getByText('1.0')).toBeInTheDocument()
    expect(within(pluginInformation).getByText('双语配音')).toBeInTheDocument()
    expect(within(detail).queryByRole('heading', { name: '语音资源' })).not.toBeInTheDocument()
    expect(within(detail).queryByText('中文高品质音色')).not.toBeInTheDocument()
    expect(within(detail).queryByText('多语言音色')).not.toBeInTheDocument()

    await user.click(within(detail).getByRole('tab', { name: '功能' }))
    expect(within(detail).getByRole('heading', { name: '功能' })).toBeInTheDocument()
    expect(within(detail).getByText('中文、英语')).toBeInTheDocument()

    await user.click(within(detail).getByRole('tab', { name: '更新日志' }))
    expect(within(detail).getByRole('heading', { name: '更新日志' })).toBeInTheDocument()
    expect(within(within(detail).getByRole('tabpanel')).getByText('版本 1.0')).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: '返回插件列表' }))
    expect(screen.getByRole('button', { name: '查看中英通用音色详情' })).toBeInTheDocument()
  })

  it('shows an error notification when opening the plugin directory fails in detail', async () => {
    const { openTtsModelDirectory } = setWindowApi(
      createCatalog([
        createModel(0, { status: 'installed', statusMessage: '已安装' }),
        createModel(1),
        createModel(2)
      ])
    )
    openTtsModelDirectory.mockResolvedValue({ success: false, message: '打开失败' })
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '查看中文高品质音色详情' }))
    await user.click(screen.getByRole('button', { name: '打开中文高品质音色目录' }))

    const liveRegion = await screen.findByRole('alert')
    const notification = liveRegion.closest('.ui-alert-notification')
    expect(notification).toHaveClass('ui-alert-notification--error')
    expect(notification?.querySelector('.ui-alert-notification__title')).toHaveTextContent(
      '操作失败'
    )
    expect(notification?.querySelector('.ui-alert-notification__message')).toHaveTextContent(
      '插件目录打开失败，请重试'
    )
  })

  it('installs and removes only the selected plugin from its detail page', async () => {
    const catalog = createCatalog()
    const { installTtsModel, removeTtsModel, listTtsCatalog, openTtsModelDirectory } =
      setWindowApi(catalog)
    const onOpenTts = vi.fn()
    listTtsCatalog
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue(
        createCatalog([
          createModel(0),
          createModel(1),
          createModel(2, { status: 'installed', statusMessage: '已安装' })
        ])
      )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<PluginsView onOpenTts={onOpenTts} />)

    await user.click(await screen.findByRole('button', { name: '查看多语言音色详情' }))
    await user.click(screen.getByRole('button', { name: '安装多语言音色' }))
    await waitFor(() => {
      expect(installTtsModel).toHaveBeenCalledWith('supertonic-3-int8-2026-05-11')
    })
    const actions = await screen.findByLabelText('插件操作')
    expect(within(actions).getByRole('button', { name: '打开配音' })).toBeEnabled()
    expect(within(actions).getByRole('button', { name: '禁用多语言音色' })).toBeDisabled()
    expect(within(actions).getByRole('checkbox', { name: '自动更新多语言音色' })).toBeDisabled()

    await user.click(within(actions).getByRole('button', { name: '打开配音' }))
    expect(onOpenTts).toHaveBeenCalledOnce()

    await user.click(within(actions).getByRole('button', { name: '打开多语言音色目录' }))
    await waitFor(() => expect(openTtsModelDirectory).toHaveBeenCalledOnce())

    await user.click(within(actions).getByRole('button', { name: '卸载多语言音色' }))
    await user.click(screen.getByRole('menuitem', { name: '卸载插件' }))

    await waitFor(() => {
      expect(removeTtsModel).toHaveBeenCalledOnce()
      expect(removeTtsModel).toHaveBeenCalledWith('supertonic-3-int8-2026-05-11')
    })
  })

  it('filters individual plugins by their product-facing names', async () => {
    setWindowApi(createCatalog())

    render(<PluginsView />)
    await screen.findByText('中文高品质音色')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索插件' }), {
      target: { value: '多语言' }
    })
    expect(screen.getByText('多语言音色')).toBeInTheDocument()
    expect(screen.queryByText('中文高品质音色')).not.toBeInTheDocument()
    expect(screen.queryByText('中英通用音色')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索插件' }), {
      target: { value: '不存在' }
    })
    expect(screen.getByText('没有找到相关插件')).toBeInTheDocument()
  })

  it('keeps implementation names out of the visible catalog and detail page', async () => {
    setWindowApi(createCatalog())
    const user = userEvent.setup()

    render(<PluginsView />)
    await screen.findByText('中文高品质音色')

    expect(screen.queryByText('Kokoro 中文扩展版')).not.toBeInTheDocument()
    expect(screen.queryByText('Kokoro 中英通用版')).not.toBeInTheDocument()
    expect(screen.queryByText('Supertonic 3 多语言版')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看中文高品质音色详情' }))
    expect(screen.queryByText(/kokoro/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/supertonic/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sherpa/i)).not.toBeInTheDocument()
  })

  it('switches from the plugin catalog to the skills tab', async () => {
    setWindowApi(createCatalog())
    const user = userEvent.setup()

    render(<PluginsView />)

    expect(await screen.findByRole('tab', { name: '插件' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await user.click(screen.getByRole('tab', { name: '技能' }))
    expect(screen.getByText('暂无可用技能')).toBeInTheDocument()
  })
})
