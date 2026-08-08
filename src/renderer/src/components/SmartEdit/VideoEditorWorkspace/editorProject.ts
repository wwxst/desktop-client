import { normalizeSourceRange } from './editorClipMath'

export type MediaAssetStatus = 'loading' | 'ready' | 'error'
export type MediaAssetKind = 'video' | 'image' | 'audio'
export type EditorTrackKind = 'video' | 'audio' | 'text' | 'overlay'

export interface MediaAsset {
  id: string
  name: string
  url: string
  duration: number | null
  status: MediaAssetStatus
  /**
   * 老项目里没有 kind 字段，所以这里保持可选。
   * 没有 kind 时按 video 处理，保证旧草稿/旧测试可以平滑迁移。
   */
  kind?: MediaAssetKind
  width?: number | null
  height?: number | null
  error?: string
}

export interface ClipTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
}

/**
 * 时间线片段。
 *
 * 新创建的片段会把这些字段全部写满；之所以保留为可选，是为了兼容旧版
 * 只有 id + assetId 的项目数据。使用前通过 resolveTimelineClip() 归一化。
 */
export interface TimelineClip {
  id: string
  assetId: string
  trackId?: string
  timelineStart?: number
  duration?: number
  sourceStart?: number
  sourceEnd?: number
  transform?: ClipTransform
  opacity?: number
  volume?: number
  muted?: boolean
  speed?: number
}

export interface ResolvedTimelineClip extends TimelineClip {
  trackId: string
  timelineStart: number
  duration: number
  sourceStart: number
  sourceEnd: number
  transform: ClipTransform
  opacity: number
  volume: number
  muted: boolean
  speed: number
}

export interface EditorTrack {
  id: string
  name: string
  kind: EditorTrackKind
  locked: boolean
  hidden: boolean
  muted: boolean
}

export interface CanvasAspectRatio {
  id: string
  label: string
  width: number
  height: number
}

/** 旧版小说推文表格数据，暂时保留，后续迁到 workflow 层。 */
export interface DraftRow {
  id: string
  draftName: string
  fixedStartFileName: string
  audio: string
  fixedEndFileName: string
}

export interface EditorProjectState {
  assets: MediaAsset[]
  tracks: EditorTrack[]
  clips: TimelineClip[]
  activeClipId: string | null
  playhead: number
  timelineZoom: number
  aspectRatio: CanvasAspectRatio
  draftRows: DraftRow[]
}

export const DEFAULT_CANVAS_ASPECT_RATIO: CanvasAspectRatio = {
  id: '9:16',
  label: '9:16（抖音）',
  width: 9,
  height: 16
}

export const DEFAULT_TIMELINE_ZOOM = 72
export const MIN_TIMELINE_ZOOM = 24
export const MAX_TIMELINE_ZOOM = 240
export const MIN_CLIP_DURATION = 0.05

export const DEFAULT_EDITOR_TRACKS: EditorTrack[] = [
  {
    id: 'track-video-overlay',
    name: 'V2',
    kind: 'overlay',
    locked: false,
    hidden: false,
    muted: false
  },
  {
    id: 'track-video-main',
    name: 'V1',
    kind: 'video',
    locked: false,
    hidden: false,
    muted: false
  },
  {
    id: 'track-audio-main',
    name: 'A1',
    kind: 'audio',
    locked: false,
    hidden: false,
    muted: false
  }
]

export type EditorProjectAction =
  | { type: 'assets/imported'; asset: MediaAsset }
  | { type: 'asset/ready'; assetId: string; duration: number }
  | { type: 'asset/failed'; assetId: string; error: string }
  /** 兼容旧版 UI；新 UI 正常通过 Command 添加片段。 */
  | { type: 'timeline/assetAdded'; assetId: string }
  | { type: 'timeline/clipSelected'; clipId: string | null }
  | { type: 'timeline/playheadChanged'; time: number }
  | { type: 'timeline/zoomChanged'; zoom: number }
  | { type: 'aspectRatio/selected'; aspectRatio: CanvasAspectRatio }
  | { type: 'draft/rowAdded'; rowId: string; afterRowId: string }
  | { type: 'draft/rowUpdated'; rowId: string; changes: Partial<Omit<DraftRow, 'id'>> }
  | { type: 'draft/rowDeleted'; rowId: string }

export function createDraftRow(id: string): DraftRow {
  return {
    id,
    draftName: '',
    fixedStartFileName: '选择视频',
    audio: '',
    fixedEndFileName: '选择视频'
  }
}

export function createInitialEditorProjectState(draftRowId: string): EditorProjectState {
  return {
    assets: [],
    tracks: DEFAULT_EDITOR_TRACKS.map((track) => ({ ...track })),
    clips: [],
    activeClipId: null,
    playhead: 0,
    timelineZoom: DEFAULT_TIMELINE_ZOOM,
    aspectRatio: DEFAULT_CANVAS_ASPECT_RATIO,
    draftRows: [createDraftRow(draftRowId)]
  }
}

export function getMediaAssetKind(asset: MediaAsset): MediaAssetKind {
  return asset.kind ?? 'video'
}

export function getDefaultTrackIdForAsset(state: EditorProjectState, asset: MediaAsset): string {
  const kind = getMediaAssetKind(asset)
  if (kind === 'audio') {
    return state.tracks.find((track) => track.kind === 'audio')?.id ?? 'track-audio-main'
  }

  return state.tracks.find((track) => track.kind === 'video')?.id ?? 'track-video-main'
}

export function resolveTimelineClip(
  clip: TimelineClip,
  asset: MediaAsset | null = null
): ResolvedTimelineClip {
  const speed = clampFinite(clip.speed ?? 1, 0.1, 8)
  const assetDuration = getResolutionAssetDuration(clip, asset)
  const sourceRange = normalizeSourceRange({
    sourceStart: clip.sourceStart,
    sourceEnd: clip.sourceEnd,
    assetDuration,
    minDuration: MIN_CLIP_DURATION
  })
  const duration = (sourceRange.sourceEnd - sourceRange.sourceStart) / speed

  return {
    ...clip,
    trackId: clip.trackId ?? 'track-video-main',
    timelineStart: Math.max(0, finiteOr(clip.timelineStart, 0)),
    duration: Math.abs(duration - MIN_CLIP_DURATION) < 1e-9 ? MIN_CLIP_DURATION : duration,
    sourceStart: sourceRange.sourceStart,
    sourceEnd: sourceRange.sourceEnd,
    transform: {
      x: finiteOr(clip.transform?.x, 0),
      y: finiteOr(clip.transform?.y, 0),
      scaleX: finiteOr(clip.transform?.scaleX, 1),
      scaleY: finiteOr(clip.transform?.scaleY, 1),
      rotation: finiteOr(clip.transform?.rotation, 0)
    },
    opacity: clampFinite(clip.opacity ?? 1, 0, 1),
    volume: clampFinite(clip.volume ?? 1, 0, 2),
    muted: Boolean(clip.muted),
    speed
  }
}

export function createTimelineClipFromAsset(
  state: EditorProjectState,
  assetId: string,
  clipId: string,
  options: { trackId?: string; timelineStart?: number } = {}
): ResolvedTimelineClip | null {
  const asset = state.assets.find((item) => item.id === assetId)
  if (!asset || asset.status !== 'ready') return null

  if (
    typeof asset.duration !== 'number' ||
    !Number.isFinite(asset.duration) ||
    asset.duration <= 0
  ) {
    return null
  }

  const sourceRange = normalizeSourceRange({
    sourceStart: 0,
    sourceEnd: asset.duration,
    assetDuration: asset.duration,
    minDuration: MIN_CLIP_DURATION
  })
  const trackId = options.trackId ?? getDefaultTrackIdForAsset(state, asset)
  const trackEnd = getTrackEnd(state, trackId)

  return {
    id: clipId,
    assetId,
    trackId,
    timelineStart: Math.max(0, finiteOr(options.timelineStart, trackEnd)),
    duration: sourceRange.sourceEnd - sourceRange.sourceStart,
    sourceStart: sourceRange.sourceStart,
    sourceEnd: sourceRange.sourceEnd,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    },
    opacity: 1,
    volume: 1,
    muted: false,
    speed: 1
  }
}

export function getTrackEnd(state: EditorProjectState, trackId: string): number {
  return state.clips.reduce((end, clip) => {
    const asset = state.assets.find((item) => item.id === clip.assetId) ?? null
    const resolved = resolveTimelineClip(clip, asset)
    if (resolved.trackId !== trackId) return end
    return Math.max(end, resolved.timelineStart + resolved.duration)
  }, 0)
}

export function getProjectDuration(state: EditorProjectState): number {
  return state.clips.reduce((end, clip) => {
    const asset = state.assets.find((item) => item.id === clip.assetId) ?? null
    const resolved = resolveTimelineClip(clip, asset)
    return Math.max(end, resolved.timelineStart + resolved.duration)
  }, 0)
}

export function selectActiveClip(state: EditorProjectState): ResolvedTimelineClip | null {
  const clip = state.clips.find((item) => item.id === state.activeClipId)
  if (!clip) return null
  const asset = state.assets.find((item) => item.id === clip.assetId) ?? null
  return resolveTimelineClip(clip, asset)
}

export function selectActiveAsset(state: EditorProjectState): MediaAsset | null {
  const activeClip = state.clips.find((clip) => clip.id === state.activeClipId)
  return activeClip ? (state.assets.find((asset) => asset.id === activeClip.assetId) ?? null) : null
}

function updateAsset(
  state: EditorProjectState,
  assetId: string,
  update: (asset: MediaAsset) => MediaAsset
): EditorProjectState {
  const assetIndex = state.assets.findIndex((asset) => asset.id === assetId)
  if (assetIndex === -1) return state

  const assets = state.assets.map((asset, index) => (index === assetIndex ? update(asset) : asset))
  return { ...state, assets }
}

function isCanvasAspectRatio(value: CanvasAspectRatio): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    Number.isFinite(value.height) &&
    value.height > 0
  )
}

export function editorProjectReducer(
  state: EditorProjectState,
  action: EditorProjectAction
): EditorProjectState {
  switch (action.type) {
    case 'assets/imported':
      if (state.assets.some((asset) => asset.id === action.asset.id)) return state
      return { ...state, assets: [...state.assets, action.asset] }

    case 'asset/ready':
      return updateAsset(state, action.assetId, (asset) => {
        const readyAsset: MediaAsset = {
          ...asset,
          duration: action.duration,
          status: 'ready'
        }
        delete readyAsset.error
        return readyAsset
      })

    case 'asset/failed':
      return updateAsset(state, action.assetId, (asset) => ({
        ...asset,
        status: 'error',
        error: action.error
      }))

    case 'timeline/assetAdded': {
      const asset = state.assets.find((item) => item.id === action.assetId)
      if (!asset || asset.status !== 'ready') return state

      const clip = createTimelineClipFromAsset(state, asset.id, createUniqueClipId(state, asset.id))
      if (!clip) return state
      return {
        ...state,
        clips: [...state.clips, clip],
        activeClipId: clip.id,
        playhead: clip.timelineStart
      }
    }

    case 'timeline/clipSelected':
      if (action.clipId === null) {
        return state.activeClipId === null ? state : { ...state, activeClipId: null }
      }
      if (!state.clips.some((clip) => clip.id === action.clipId)) return state
      return state.activeClipId === action.clipId
        ? state
        : { ...state, activeClipId: action.clipId }

    case 'timeline/playheadChanged': {
      const playhead = Math.max(0, finiteOr(action.time, state.playhead))
      return playhead === state.playhead ? state : { ...state, playhead }
    }

    case 'timeline/zoomChanged': {
      const timelineZoom = clampFinite(action.zoom, MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM)
      return timelineZoom === state.timelineZoom ? state : { ...state, timelineZoom }
    }

    case 'aspectRatio/selected':
      if (!isCanvasAspectRatio(action.aspectRatio)) return state
      return { ...state, aspectRatio: action.aspectRatio }

    case 'draft/rowAdded': {
      const afterIndex = state.draftRows.findIndex((row) => row.id === action.afterRowId)
      if (afterIndex === -1 || state.draftRows.some((row) => row.id === action.rowId)) return state

      const draftRows = [...state.draftRows]
      draftRows.splice(afterIndex + 1, 0, createDraftRow(action.rowId))
      return { ...state, draftRows }
    }

    case 'draft/rowUpdated': {
      const rowIndex = state.draftRows.findIndex((row) => row.id === action.rowId)
      if (rowIndex === -1) return state

      const changes = Object.fromEntries(
        Object.entries(action.changes).filter(
          ([key, value]) => key !== 'id' && typeof value === 'string'
        )
      ) as Partial<Omit<DraftRow, 'id'>>
      if (Object.keys(changes).length === 0) return state

      const draftRows = state.draftRows.map((row, index) =>
        index === rowIndex ? { ...row, ...changes } : row
      )
      return { ...state, draftRows }
    }

    case 'draft/rowDeleted':
      if (state.draftRows.length === 1 || !state.draftRows.some((row) => row.id === action.rowId)) {
        return state
      }
      return { ...state, draftRows: state.draftRows.filter((row) => row.id !== action.rowId) }
  }
}

function createUniqueClipId(state: EditorProjectState, assetId: string): string {
  const baseId = `clip-${assetId}`
  if (!state.clips.some((clip) => clip.id === baseId)) return baseId

  let suffix = 2
  let candidate = `${baseId}-${suffix}`
  while (state.clips.some((clip) => clip.id === candidate)) {
    suffix += 1
    candidate = `${baseId}-${suffix}`
  }
  return candidate
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getResolutionAssetDuration(clip: TimelineClip, asset: MediaAsset | null): number {
  if (asset && typeof asset.duration === 'number') {
    return Number.isFinite(asset.duration) ? asset.duration : 0
  }

  const sourceStart = Math.max(0, finiteOr(clip.sourceStart, 0))
  const sourceEnd = finiteOr(clip.sourceEnd, sourceStart + 5)
  return Math.max(sourceStart + MIN_CLIP_DURATION, sourceEnd)
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
