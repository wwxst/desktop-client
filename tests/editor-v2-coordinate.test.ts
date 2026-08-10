import { describe, expect, it } from 'vitest'
import {
  getContainedMediaRect,
  getFillScale,
  getProjectCanvasSize,
  screenDeltaToProjectDelta,
  snapClipCenterToCanvas
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/core/editorCoordinate'
import type { ResolvedTimelineClip } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const clip: ResolvedTimelineClip = {
  id: 'c', assetId: 'a', trackId: 'v', timelineStart: 0, duration: 5,
  sourceStart: 0, sourceEnd: 5,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  opacity: 1, volume: 1, muted: false, speed: 1, enabled: true
}

describe('Editor V2 project coordinate', () => {
  it('9:16 使用稳定的 1080x1920 工程坐标', () => {
    expect(getProjectCanvasSize({ id: '9:16', label: '9:16', width: 9, height: 16 })).toEqual({ width: 1080, height: 1920 })
  })

  it('屏幕拖动按预览尺寸转换成工程坐标', () => {
    const delta = screenDeltaToProjectDelta({ x: 50, y: 100 }, { width: 1000, height: 2000 }, { width: 500, height: 1000 })
    expect(delta).toEqual({ x: 100, y: 200 })
  })

  it('支持画布边缘吸附和 Fill 计算', () => {
    const canvas = { width: 1080, height: 1920 }
    const asset = { id: 'a', name: 'a', url: 'x', duration: 5, status: 'ready' as const, kind: 'video' as const, width: 1920, height: 1080 }
    const contained = getContainedMediaRect(asset, canvas)
    expect(contained.width).toBe(1080)
    expect(getFillScale(asset, canvas)).toBeGreaterThan(1)
    const result = snapClipCenterToCanvas({ x: 2, y: 3 }, clip, asset, canvas, 10)
    expect(result.point).toEqual({ x: 0, y: 0 })

    const portraitAsset = { ...asset, width: 540, height: 1920 }
    const edge = snapClipCenterToCanvas({ x: -267, y: 100 }, clip, portraitAsset, canvas, 10)
    expect(edge.point.x).toBe(-270)
    expect(edge.guides.x).toBe(-540)
  })
})
