import type { CanvasAspectRatio, MediaAsset, ResolvedTimelineClip } from '../editorProject'

export interface Size2D {
  width: number
  height: number
}

export interface Point2D {
  x: number
  y: number
}

export interface Rect2D extends Point2D, Size2D {}

const PROJECT_LONG_EDGE = 1920

export function getProjectCanvasSize(ratio: CanvasAspectRatio): Size2D {
  if (ratio.width >= ratio.height) {
    return {
      width: PROJECT_LONG_EDGE,
      height: Math.round((PROJECT_LONG_EDGE * ratio.height) / ratio.width)
    }
  }
  return {
    width: Math.round((PROJECT_LONG_EDGE * ratio.width) / ratio.height),
    height: PROJECT_LONG_EDGE
  }
}

/**
 * 工程坐标以画布中心为 (0,0)，x 向右、y 向下。
 */
export function projectToViewport(
  point: Point2D,
  project: Size2D,
  viewport: Size2D
): Point2D {
  return {
    x: (point.x / project.width) * viewport.width,
    y: (point.y / project.height) * viewport.height
  }
}

export function viewportToProject(
  point: Point2D,
  project: Size2D,
  viewport: Size2D
): Point2D {
  return {
    x: viewport.width > 0 ? (point.x / viewport.width) * project.width : 0,
    y: viewport.height > 0 ? (point.y / viewport.height) * project.height : 0
  }
}

export function screenDeltaToProjectDelta(
  delta: Point2D,
  project: Size2D,
  viewport: Size2D
): Point2D {
  return viewportToProject(delta, project, viewport)
}

export function getContainedMediaRect(asset: MediaAsset | null, canvas: Size2D): Rect2D {
  const mediaWidth = asset?.width && asset.width > 0 ? asset.width : canvas.width
  const mediaHeight = asset?.height && asset.height > 0 ? asset.height : canvas.height
  const scale = Math.min(canvas.width / mediaWidth, canvas.height / mediaHeight)
  const width = mediaWidth * scale
  const height = mediaHeight * scale
  return {
    x: -width / 2,
    y: -height / 2,
    width,
    height
  }
}

export function getClipProjectRect(
  clip: ResolvedTimelineClip,
  asset: MediaAsset | null,
  canvas: Size2D
): Rect2D {
  const base = getContainedMediaRect(asset, canvas)
  const width = base.width * Math.abs(clip.transform.scaleX)
  const height = base.height * Math.abs(clip.transform.scaleY)
  return {
    x: clip.transform.x - width / 2,
    y: clip.transform.y - height / 2,
    width,
    height
  }
}

export function getFillScale(asset: MediaAsset | null, canvas: Size2D): number {
  const contained = getContainedMediaRect(asset, canvas)
  if (contained.width <= 0 || contained.height <= 0) return 1
  return Math.max(canvas.width / contained.width, canvas.height / contained.height)
}

export function getFitTransform(): ResolvedTimelineClip['transform'] {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
}

export function getFillTransform(asset: MediaAsset | null, canvas: Size2D): ResolvedTimelineClip['transform'] {
  const scale = getFillScale(asset, canvas)
  return { x: 0, y: 0, scaleX: scale, scaleY: scale, rotation: 0 }
}

export interface CanvasSnapResult {
  point: Point2D
  guides: { x: number | null; y: number | null }
}

/**
 * 画布移动吸附：中心 + 四边。输入/输出均是工程坐标。
 */
export function snapClipCenterToCanvas(
  desiredCenter: Point2D,
  clip: ResolvedTimelineClip,
  asset: MediaAsset | null,
  canvas: Size2D,
  thresholdProjectUnits: number
): CanvasSnapResult {
  const base = getContainedMediaRect(asset, canvas)
  const halfWidth = (base.width * Math.abs(clip.transform.scaleX)) / 2
  const halfHeight = (base.height * Math.abs(clip.transform.scaleY)) / 2
  const candidatesX: Array<{ center: number; guide: number }> = [
    { center: 0, guide: 0 },
    { center: -canvas.width / 2 + halfWidth, guide: -canvas.width / 2 },
    { center: canvas.width / 2 - halfWidth, guide: canvas.width / 2 }
  ]
  const candidatesY: Array<{ center: number; guide: number }> = [
    { center: 0, guide: 0 },
    { center: -canvas.height / 2 + halfHeight, guide: -canvas.height / 2 },
    { center: canvas.height / 2 - halfHeight, guide: canvas.height / 2 }
  ]

  let x = desiredCenter.x
  let y = desiredCenter.y
  let guideX: number | null = null
  let guideY: number | null = null

  for (const candidate of candidatesX) {
    if (Math.abs(x - candidate.center) <= thresholdProjectUnits) {
      x = candidate.center
      guideX = candidate.guide
      break
    }
  }
  for (const candidate of candidatesY) {
    if (Math.abs(y - candidate.center) <= thresholdProjectUnits) {
      y = candidate.center
      guideY = candidate.guide
      break
    }
  }

  return { point: { x, y }, guides: { x: guideX, y: guideY } }
}
