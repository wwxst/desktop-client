import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MediaLibraryView from '../src/renderer/src/components/MediaLibrary/MediaLibraryView'
import type { GlobalMediaAsset } from '../src/shared/mediaLibrary'

const assets: GlobalMediaAsset[] = [
  {
    id: 'video-1',
    name: 'opening.mp4',
    sourcePath: 'D:\\media\\opening.mp4',
    kind: 'video',
    sizeBytes: 5_242_880,
    fileModifiedAt: '2026-08-10T08:00:00.000Z',
    importedAt: '2026-08-11T08:00:00.000Z',
    availability: 'available',
    tags: []
  },
  {
    id: 'audio-1',
    name: 'voice.wav',
    sourcePath: 'D:\\media\\voice.wav',
    kind: 'audio',
    sizeBytes: 1_048_576,
    fileModifiedAt: '2026-08-10T08:00:00.000Z',
    importedAt: '2026-08-11T08:00:00.000Z',
    availability: 'available',
    tags: []
  },
  {
    id: 'image-1',
    name: 'cover.png',
    sourcePath: 'D:\\media\\cover.png',
    kind: 'image',
    sizeBytes: 524_288,
    fileModifiedAt: '2026-08-10T08:00:00.000Z',
    importedAt: '2026-08-11T08:00:00.000Z',
    availability: 'missing',
    tags: []
  }
]

describe('MediaLibraryView', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listGlobalMediaLibrary: vi.fn().mockResolvedValue({
          success: true,
          message: '已加载 3 个素材',
          assets
        }),
        importGlobalMediaFiles: vi.fn(),
        addGlobalMediaTag: vi.fn(),
        removeGlobalMediaTag: vi.fn(),
        relocateGlobalMediaAsset: vi.fn()
      }
    })
  })

  it('loads indexed media and filters it by type', async () => {
    const user = userEvent.setup()
    render(<MediaLibraryView />)

    expect(await screen.findByText('opening.mp4')).toBeInTheDocument()
    expect(screen.getByText('voice.wav')).toBeInTheDocument()
    expect(screen.getByText('cover.png')).toBeInTheDocument()
    expect(screen.getByText('1 个失效')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '音频' }))

    const mediaList = screen.getByRole('list', { name: '素材列表' })
    expect(within(mediaList).getByText('voice.wav')).toBeInTheDocument()
    expect(within(mediaList).queryByText('opening.mp4')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '音频' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('imports files through the native API and renders the updated index', async () => {
    const user = userEvent.setup()
    const importedAsset = assets[0]
    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: '素材库为空',
      assets: []
    })
    vi.mocked(window.api.importGlobalMediaFiles).mockResolvedValue({
      success: true,
      message: '新增 1 个',
      assets: [importedAsset],
      canceled: false,
      importedCount: 1,
      duplicateCount: 0,
      unsupportedCount: 0
    })
    render(<MediaLibraryView />)

    await user.click(await screen.findByRole('button', { name: '导入媒体' }))

    expect(window.api.importGlobalMediaFiles).toHaveBeenCalledOnce()
    expect(await screen.findByText('opening.mp4')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('新增 1 个')
  })

  it('adds and removes tags from an indexed asset', async () => {
    const user = userEvent.setup()
    const taggedAsset = { ...assets[0], tags: ['开场'] }
    vi.mocked(window.api.addGlobalMediaTag).mockResolvedValue({
      success: true,
      message: '素材标签已更新',
      assets: [taggedAsset, assets[1], assets[2]]
    })
    vi.mocked(window.api.removeGlobalMediaTag).mockResolvedValue({
      success: true,
      message: '素材标签已更新',
      assets: [{ ...assets[0], tags: [] }, assets[1], assets[2]]
    })
    render(<MediaLibraryView />)

    const card = await screen.findByText('opening.mp4')
    const cardItem = card.closest('li') as HTMLElement
    await user.type(within(cardItem).getByRole('textbox', { name: '添加标签' }), '开场')
    await user.keyboard('{Enter}')

    expect(window.api.addGlobalMediaTag).toHaveBeenCalledWith('video-1', '开场')
    expect(await within(cardItem).findByText('开场')).toBeInTheDocument()

    await user.click(within(cardItem).getByRole('button', { name: '删除标签 开场' }))
    expect(window.api.removeGlobalMediaTag).toHaveBeenCalledWith('video-1', '开场')
  })

  it('filters media by a selected tag', async () => {
    const user = userEvent.setup()
    const taggedAssets = assets.map((asset) => ({
      ...asset,
      tags: asset.id === 'video-1' ? ['开场'] : []
    }))
    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: '已加载 3 个素材',
      assets: taggedAssets
    })
    render(<MediaLibraryView />)

    const tagFilter = await screen.findByRole('combobox', { name: '标签筛选' })
    await user.selectOptions(tagFilter, '开场')

    const mediaList = screen.getByRole('list', { name: '素材列表' })
    expect(within(mediaList).getByText('opening.mp4')).toBeInTheDocument()
    expect(within(mediaList).queryByText('voice.wav')).not.toBeInTheDocument()
  })

  it('relocates a missing asset through the native API', async () => {
    const user = userEvent.setup()
    const relocatedAsset = {
      ...assets[2],
      sourcePath: 'D:\\media\\cover-new.png',
      availability: 'available' as const
    }
    vi.mocked(window.api.relocateGlobalMediaAsset).mockResolvedValue({
      success: true,
      message: '素材已重新定位',
      assets: [assets[0], assets[1], relocatedAsset],
      canceled: false
    })
    render(<MediaLibraryView />)

    const card = await screen.findByText('cover.png')
    const cardItem = card.closest('li') as HTMLElement
    await user.click(within(cardItem).getByRole('button', { name: '重新定位' }))

    expect(window.api.relocateGlobalMediaAsset).toHaveBeenCalledWith('image-1')
    expect(await within(cardItem).findByText('D:\\media\\cover-new.png')).toBeInTheDocument()
    expect(within(cardItem).queryByText('已失效')).not.toBeInTheDocument()
  })

  it('clears a selected tag filter when the last matching tag is removed', async () => {
    const user = userEvent.setup()
    const taggedAssets = assets.map((asset) => ({
      ...asset,
      tags: asset.id === 'video-1' ? ['opening'] : []
    }))
    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: 'loaded',
      assets: taggedAssets
    })
    vi.mocked(window.api.removeGlobalMediaTag).mockResolvedValueOnce({
      success: true,
      message: 'removed',
      assets: taggedAssets.map((asset) => ({ ...asset, tags: [] }))
    })

    render(<MediaLibraryView />)
    const tagFilter = await screen.findByRole('combobox')
    await user.selectOptions(tagFilter, 'opening')
    expect(within(screen.getByRole('list')).queryByText('voice.wav')).not.toBeInTheDocument()

    const cardItem = screen.getByText('opening.mp4').closest('li') as HTMLElement
    await user.click(within(cardItem).getByRole('button', { name: /opening/ }))

    expect(await screen.findByRole('combobox')).toHaveValue('')
    expect(within(screen.getByRole('list')).getByText('voice.wav')).toBeInTheDocument()

    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: 'refreshed',
      assets: taggedAssets
    })
    await user.click(screen.getByRole('button', { name: '刷新素材状态' }))

    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(within(screen.getByRole('list')).getByText('voice.wav')).toBeInTheDocument()
  })

  it('shows a visible error when adding a tag rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.addGlobalMediaTag).mockRejectedValueOnce(new Error('ipc unavailable'))
    render(<MediaLibraryView />)

    const cardItem = (await screen.findByText('opening.mp4')).closest('li') as HTMLElement
    await user.type(within(cardItem).getByRole('textbox'), 'broken')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('更新素材标签失败，请稍后重试')
    expect(screen.getByText('opening.mp4')).toBeInTheDocument()
  })

  it('shows a visible error when removing a tag rejects', async () => {
    const user = userEvent.setup()
    const taggedAsset = { ...assets[0], tags: ['opening'] }
    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: 'loaded',
      assets: [taggedAsset, assets[1], assets[2]]
    })
    vi.mocked(window.api.removeGlobalMediaTag).mockRejectedValueOnce(new Error('ipc unavailable'))
    render(<MediaLibraryView />)

    const cardItem = (await screen.findByText('opening.mp4')).closest('li') as HTMLElement
    await user.click(within(cardItem).getByRole('button', { name: /opening/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('更新素材标签失败，请稍后重试')
    expect(within(cardItem).getByText('opening')).toBeInTheDocument()
  })

  it('shows a visible error when relocating a missing asset rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.relocateGlobalMediaAsset).mockRejectedValueOnce(
      new Error('ipc unavailable')
    )
    render(<MediaLibraryView />)

    const cardItem = (await screen.findByText('cover.png')).closest('li') as HTMLElement
    await user.click(within(cardItem).getByRole('button', { name: '重新定位' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('重新定位素材失败，请稍后重试')
    expect(within(cardItem).getByText('cover.png')).toBeInTheDocument()
  })

  it('keeps the loaded list when an operation returns a structured failure', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.addGlobalMediaTag).mockResolvedValueOnce({
      success: false,
      message: '更新素材标签失败，请稍后重试',
      assets: []
    })
    render(<MediaLibraryView />)

    const cardItem = (await screen.findByText('opening.mp4')).closest('li') as HTMLElement
    await user.type(within(cardItem).getByRole('textbox'), 'broken')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('更新素材标签失败，请稍后重试')
    expect(screen.getByText('opening.mp4')).toBeInTheDocument()
    expect(screen.getByText('voice.wav')).toBeInTheDocument()
  })

  it('clears stale success feedback when a later operation fails', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.addGlobalMediaTag)
      .mockResolvedValueOnce({
        success: true,
        message: '素材标签已更新',
        assets: [{ ...assets[0], tags: ['opening'] }, assets[1], assets[2]]
      })
      .mockResolvedValueOnce({
        success: false,
        message: '更新素材标签失败，请稍后重试',
        assets: []
      })
    render(<MediaLibraryView />)

    const cardItem = (await screen.findByText('opening.mp4')).closest('li') as HTMLElement
    const input = within(cardItem).getByRole('textbox')
    await user.type(input, 'opening')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent('素材标签已更新')

    await user.type(input, 'broken')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('更新素材标签失败，请稍后重试')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('prevents duplicate tag removal while the first request is pending', async () => {
    const user = userEvent.setup()
    const taggedAsset = { ...assets[0], tags: ['opening'] }
    let resolveRemoval: ((response: GlobalMediaLibraryResponse) => void) | undefined
    vi.mocked(window.api.listGlobalMediaLibrary).mockResolvedValueOnce({
      success: true,
      message: 'loaded',
      assets: [taggedAsset, assets[1], assets[2]]
    })
    vi.mocked(window.api.removeGlobalMediaTag).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRemoval = resolve
        })
    )
    render(<MediaLibraryView />)

    const removeButton = await screen.findByRole('button', { name: '删除标签 opening' })
    await user.click(removeButton)

    expect(removeButton).toBeDisabled()
    await user.click(removeButton)
    expect(window.api.removeGlobalMediaTag).toHaveBeenCalledOnce()

    resolveRemoval?.({
      success: true,
      message: 'removed',
      assets: [assets[0], assets[1], assets[2]]
    })
  })
})
