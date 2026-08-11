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
    availability: 'available'
  },
  {
    id: 'audio-1',
    name: 'voice.wav',
    sourcePath: 'D:\\media\\voice.wav',
    kind: 'audio',
    sizeBytes: 1_048_576,
    fileModifiedAt: '2026-08-10T08:00:00.000Z',
    importedAt: '2026-08-11T08:00:00.000Z',
    availability: 'available'
  },
  {
    id: 'image-1',
    name: 'cover.png',
    sourcePath: 'D:\\media\\cover.png',
    kind: 'image',
    sizeBytes: 524_288,
    fileModifiedAt: '2026-08-10T08:00:00.000Z',
    importedAt: '2026-08-11T08:00:00.000Z',
    availability: 'missing'
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
        importGlobalMediaFiles: vi.fn()
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
})
