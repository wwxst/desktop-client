import { describe, expect, it, vi } from 'vitest'
import { createMediaLibraryController } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/mediaLibrary'

describe('media library controller', () => {
  it('creates URLs, detects readiness, and dispatches project actions', () => {
    const dispatch = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:asset-1')
    let ready: ((duration: number) => void) | undefined
    const controller = createMediaLibraryController({
      dispatch,
      dependencies: {
        createId: () => 'asset-1',
        createObjectURL,
        revokeObjectURL: vi.fn(),
        detectMedia: (_url, callbacks) => {
          ready = callbacks.onReady
          return vi.fn()
        }
      }
    })
    const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' })

    controller.importFiles([file])
    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'assets/imported',
      asset: {
        id: 'asset-1',
        name: 'sample.mp4',
        url: 'blob:asset-1',
        duration: null,
        width: null,
        height: null,
        status: 'loading',
        kind: 'video'
      }
    })

    ready?.(12.5)
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'asset/ready',
      assetId: 'asset-1',
      duration: 12.5
    })
  })

  it('reports detection errors through one state boundary', () => {
    const dispatch = vi.fn()
    let fail: (() => void) | undefined
    const controller = createMediaLibraryController({
      dispatch,
      dependencies: {
        createId: () => 'asset-1',
        createObjectURL: () => 'blob:asset-1',
        revokeObjectURL: vi.fn(),
        detectMedia: (_url, callbacks) => {
          fail = callbacks.onError
          return vi.fn()
        }
      }
    })

    controller.importFiles([new File(['video'], 'broken.mp4', { type: 'video/mp4' })])
    fail?.()

    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'asset/failed',
      assetId: 'asset-1',
      error: '无法预览该视频'
    })
  })

  it('cancels detection and revokes every URL exactly once on dispose', () => {
    const cancelDetection = vi.fn()
    const revokeObjectURL = vi.fn()
    const controller = createMediaLibraryController({
      dispatch: vi.fn(),
      dependencies: {
        createId: () => 'asset-1',
        createObjectURL: () => 'blob:asset-1',
        revokeObjectURL,
        detectMedia: () => cancelDetection
      }
    })

    controller.importFiles([new File(['video'], 'sample.mp4', { type: 'video/mp4' })])
    controller.dispose()
    controller.dispose()

    expect(cancelDetection).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-1')
  })
})
