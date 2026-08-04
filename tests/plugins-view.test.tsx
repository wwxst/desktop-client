import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PluginsView from '../src/renderer/src/components/Plugins/PluginsView'
import type { TtsCatalogResponse, TtsModelInfo } from '../src/shared/tts'

const removeListener = vi.fn()

function createModel(overrides: Partial<TtsModelInfo> = {}): TtsModelInfo {
  return {
    id: 'kokoro-multi-lang-v1_1',
    name: 'Kokoro 中文扩展版',
    description: '中文与英语共 103 个音色',
    engine: 'kokoro',
    licenseName: 'Apache-2.0',
    licenseNote: '测试许可',
    languages: ['zh-CN', 'en-US', 'en-GB'],
    voiceCount: 103,
    estimatedDownloadMb: 340,
    status: 'not-installed',
    statusMessage: '未安装',
    voices: [],
    ...overrides
  }
}

function createCatalog(models: TtsModelInfo[]): TtsCatalogResponse {
  return {
    success: true,
    message: '本地语音资源读取成功',
    languages: [{ code: 'zh-CN', name: '中文', englishName: 'Chinese' }],
    models,
    modelDirectory: 'C:\\tts-models'
  }
}

function setWindowApi(catalog: TtsCatalogResponse): {
  listTtsCatalog: ReturnType<typeof vi.fn>
  installTtsModel: ReturnType<typeof vi.fn>
  removeTtsModel: ReturnType<typeof vi.fn>
} {
  const listTtsCatalog = vi.fn().mockResolvedValue(catalog)
  const installTtsModel = vi.fn().mockResolvedValue({ success: true, message: '安装完成' })
  const removeTtsModel = vi.fn().mockResolvedValue({ success: true, message: '删除完成' })

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listTtsCatalog,
      installTtsModel,
      removeTtsModel,
      onTtsModelDownloadProgress: vi.fn(() => removeListener)
    }
  })

  return { listTtsCatalog, installTtsModel, removeTtsModel }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PluginsView', () => {
  it('renders the plugin catalog, filters it, and switches to skills', async () => {
    setWindowApi(createCatalog([createModel()]))
    const user = userEvent.setup()

    render(<PluginsView />)

    expect(screen.getByRole('region', { name: '插件中心' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '插件' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '插件' })).toBeInTheDocument()
    expect(screen.getByText('安装本地创作能力，让常用工具按需扩展')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '搜索插件' })).toBeInTheDocument()
    expect(await screen.findByText('本地 TTS 配音')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '可安装插件' })).not.toHaveClass(
      'plugins-catalog-section--compact'
    )

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索插件' }), {
      target: { value: '不存在' }
    })
    expect(screen.getByText('没有找到相关插件')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '技能' }))
    expect(screen.getByText('暂无可用技能')).toBeInTheDocument()
  })

  it('installs the recommended Chinese voice resource', async () => {
    const { installTtsModel } = setWindowApi(createCatalog([createModel()]))
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '安装' }))

    await waitFor(() => {
      expect(installTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_1')
    })
    expect(screen.queryByRole('region', { name: '本地 TTS 配音详情' })).not.toBeInTheDocument()
  })

  it('opens the plugin detail page from the list content', async () => {
    setWindowApi(createCatalog([createModel()]))
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))

    expect(screen.getByRole('region', { name: '本地 TTS 配音详情' })).toBeInTheDocument()
  })

  it('uses product-facing resource names in installation notices', async () => {
    const { installTtsModel } = setWindowApi(createCatalog([createModel()]))
    installTtsModel.mockResolvedValue({
      success: true,
      message: 'Kokoro 中文扩展版 安装完成'
    })
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '安装' }))

    expect(await screen.findByText('中文高品质音色安装完成')).toBeInTheDocument()
    expect(screen.queryByText('Kokoro 中文扩展版 安装完成')).not.toBeInTheDocument()
  })

  it('unloads every installed resource from the gear menu without opening details', async () => {
    const { removeTtsModel } = setWindowApi(
      createCatalog([
        createModel({ status: 'installed', statusMessage: '已安装' }),
        createModel({
          id: 'supertonic-3-int8-2026-05-11',
          name: 'Supertonic 3 多语言版',
          description: '支持 31 种语言',
          engine: 'supertonic',
          languages: ['zh-CN'],
          voiceCount: 10,
          estimatedDownloadMb: 180,
          status: 'installed',
          statusMessage: '已安装'
        })
      ])
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '管理本地 TTS 配音' }))
    await user.click(screen.getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => {
      expect(removeTtsModel).toHaveBeenCalledTimes(2)
    })
    expect(removeTtsModel).toHaveBeenNthCalledWith(1, 'kokoro-multi-lang-v1_1')
    expect(removeTtsModel).toHaveBeenNthCalledWith(2, 'supertonic-3-int8-2026-05-11')
    expect(screen.queryByRole('region', { name: '本地 TTS 配音详情' })).not.toBeInTheDocument()
  })

  it('uses a compact section for installed plugins', async () => {
    setWindowApi(createCatalog([createModel({ status: 'installed', statusMessage: '已安装' })]))

    render(<PluginsView />)

    expect(await screen.findByRole('region', { name: '已安装插件' })).toHaveClass(
      'plugins-catalog-section--compact'
    )
  })

  it('continues unloading remaining resources when one removal rejects', async () => {
    const { removeTtsModel } = setWindowApi(
      createCatalog([
        createModel({ status: 'installed', statusMessage: '已安装' }),
        createModel({
          id: 'kokoro-multi-lang-v1_0',
          status: 'installed',
          statusMessage: '已安装'
        })
      ])
    )
    removeTtsModel
      .mockRejectedValueOnce(new Error('first removal failed'))
      .mockResolvedValueOnce({ success: true, message: '删除完成' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '管理本地 TTS 配音' }))
    await user.click(screen.getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => {
      expect(removeTtsModel).toHaveBeenCalledTimes(2)
    })
    expect(removeTtsModel).toHaveBeenNthCalledWith(2, 'kokoro-multi-lang-v1_0')
    expect(screen.getByText('部分语音资源卸载失败，请重试')).toBeInTheDocument()
  })

  it('shows failed optional resources as retryable without changing the installed plugin state', async () => {
    setWindowApi(
      createCatalog([
        createModel({ status: 'installed', statusMessage: '已安装' }),
        createModel({
          id: 'supertonic-3-int8-2026-05-11',
          name: 'Supertonic 3 多语言版',
          status: 'failed',
          statusMessage: '模型下载失败'
        })
      ])
    )
    render(<PluginsView />)

    const pluginStatus = await screen.findByText('已安装', {
      selector: '.plugin-list-item__status'
    })
    expect(pluginStatus).toHaveClass('is-installed')
    expect(pluginStatus).not.toHaveClass('is-failed')
    expect(screen.getByRole('button', { name: '管理本地 TTS 配音' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理' })).not.toBeInTheDocument()
  })

  it('restores an in-progress installation from the catalog and disables duplicate actions', async () => {
    setWindowApi(
      createCatalog([
        createModel({
          status: 'downloading',
          statusMessage: '正在下载模型'
        })
      ])
    )

    render(<PluginsView />)

    const pluginStatus = await screen.findByText('处理中', {
      selector: '.plugin-list-item__status'
    })
    expect(pluginStatus).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安装' })).toBeDisabled()
  })

  it('shows an installing state in the detail header while the first resource is downloading', async () => {
    setWindowApi(
      createCatalog([
        createModel({
          status: 'downloading',
          statusMessage: '正在下载模型'
        })
      ])
    )
    const user = userEvent.setup()

    render(<PluginsView />)
    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))

    expect(
      screen.getByText('安装中', { selector: '.plugin-detail__intro > span' })
    ).toBeInTheDocument()
  })

  it('refreshes the catalog after an installation call throws', async () => {
    const initialCatalog = createCatalog([createModel()])
    const failedCatalog = createCatalog([
      createModel({ status: 'failed', statusMessage: '模型下载失败' })
    ])
    const { listTtsCatalog, installTtsModel } = setWindowApi(initialCatalog)
    installTtsModel.mockRejectedValue(new Error('IPC failed'))
    const user = userEvent.setup()

    render(<PluginsView />)

    await screen.findByRole('button', { name: '安装' })
    listTtsCatalog.mockResolvedValue(failedCatalog)
    await user.click(screen.getByRole('button', { name: '安装' }))

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument()
  })

  it('shows the approved detail hierarchy and returns through the breadcrumb', async () => {
    setWindowApi(createCatalog([createModel()]))
    const user = userEvent.setup()

    render(<PluginsView />)

    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))

    const detail = screen.getByRole('region', { name: '本地 TTS 配音详情' })
    expect(within(detail).getByRole('button', { name: '返回插件列表' })).toBeInTheDocument()
    expect(within(detail).getByRole('heading', { name: '语音资源' })).toBeInTheDocument()
    expect(within(detail).getByRole('heading', { name: '信息' })).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: '打开配音' })).not.toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: '返回插件列表' }))
    expect(screen.getByRole('button', { name: '查看本地 TTS 配音详情' })).toBeInTheDocument()
  })

  it('installs an individual resource from the detail page without leaving it', async () => {
    const { installTtsModel } = setWindowApi(
      createCatalog([
        createModel({ status: 'installed', statusMessage: '已安装' }),
        createModel({
          id: 'kokoro-multi-lang-v1_0',
          name: 'Kokoro 中英通用版',
          voiceCount: 53,
          estimatedDownloadMb: 310
        })
      ])
    )
    const user = userEvent.setup()

    render(<PluginsView />)
    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))
    await user.click(screen.getByRole('button', { name: '安装中英通用音色' }))

    await waitFor(() => {
      expect(installTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_0')
    })
    expect(screen.getByRole('region', { name: '本地 TTS 配音详情' })).toBeInTheDocument()
  })

  it('unloads only the selected resource from its detail gear menu', async () => {
    const { removeTtsModel } = setWindowApi(
      createCatalog([
        createModel({ status: 'installed', statusMessage: '已安装' }),
        createModel({
          id: 'kokoro-multi-lang-v1_0',
          name: 'Kokoro 中英通用版',
          voiceCount: 53,
          estimatedDownloadMb: 310,
          status: 'installed',
          statusMessage: '已安装'
        })
      ])
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<PluginsView />)
    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))
    await user.click(screen.getByRole('button', { name: '管理中英通用音色' }))
    await user.click(screen.getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => {
      expect(removeTtsModel).toHaveBeenCalledOnce()
    })
    expect(removeTtsModel).toHaveBeenCalledWith('kokoro-multi-lang-v1_0')
    expect(screen.getByRole('region', { name: '本地 TTS 配音详情' })).toBeInTheDocument()
  })

  it('keeps implementation names out of the visible detail page', async () => {
    setWindowApi(
      createCatalog([
        createModel(),
        createModel({
          id: 'supertonic-3-int8-2026-05-11',
          name: 'Supertonic 3 多语言版',
          engine: 'supertonic',
          voiceCount: 10,
          estimatedDownloadMb: 180
        })
      ])
    )
    const user = userEvent.setup()

    render(<PluginsView />)
    await user.click(await screen.findByRole('button', { name: '查看本地 TTS 配音详情' }))

    expect(screen.getByText('中文高品质音色')).toBeInTheDocument()
    expect(screen.getByText('多语言音色')).toBeInTheDocument()
    expect(screen.queryByText('Kokoro 中文扩展版')).not.toBeInTheDocument()
    expect(screen.queryByText('Supertonic 3 多语言版')).not.toBeInTheDocument()
    expect(screen.queryByText(/sherpa/i)).not.toBeInTheDocument()
  })
})
