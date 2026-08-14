import { normalizeSourceRange } from './editorClipMath'

export type MediaAssetStatus = 'loading' | 'ready' | 'error'
export type MediaAssetKind = 'video' | 'image' | 'audio'
export type EditorTrackKind = 'video' | 'audio' | 'text' | 'overlay'
export type EditorTrackRole = 'main' | 'standard'

export interface MediaAsset {
  id: string
  name: string
  url: string
  duration: number | null
  status: MediaAssetStatus
  /** 老项目没有 kind 时按 video 处理。 */
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
  enabled?: boolean
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
  enabled: boolean
}

export interface TimelineComposition {
  time: number
  videoLayers: ResolvedTimelineClip[]
  audioLayers: ResolvedTimelineClip[]
}

export interface EditorTrack {
  id: string
  name: string
  kind: EditorTrackKind
  role?: EditorTrackRole
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
export const MAIN_VISUAL_TRACK_ID = 'track-video-main'
export const DEFAULT_OVERLAY_TRACK_ID = 'track-video-overlay'
export const MAIN_AUDIO_TRACK_ID = 'track-audio-main'

export const DEFAULT_EDITOR_TRACKS: EditorTrack[] = [
  {
    id: DEFAULT_OVERLAY_TRACK_ID,
    name: '视觉层',
    kind: 'overlay',
    role: 'standard',
    locked: false,
    hidden: false,
    muted: false
  },
  {
    id: MAIN_VISUAL_TRACK_ID,
    name: '主视频',
    kind: 'video',
    role: 'main',
    locked: false,
    hidden: false,
    muted: false
  },
  {
    id: MAIN_AUDIO_TRACK_ID,
    name: '声音',
    kind: 'audio',
    role: 'standard',
    locked: false,
    hidden: false,
    muted: false
  }
]

export type EditorProjectAction =
  | { type: 'assets/imported'; asset: MediaAsset }
  | { type: 'asset/ready'; assetId: string; duration: number; width?: number; height?: number }
  | { type: 'asset/failed'; assetId: string; error: string }
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

export function isVisualTrackKind(kind: EditorTrackKind): boolean {
  return kind === 'video' || kind === 'overlay' || kind === 'text'
}

export function isVisualTrack(track: EditorTrack): boolean {
  return isVisualTrackKind(track.kind)
}

export function getMainVisualTrack(state: EditorProjectState): EditorTrack | null {
  return (
    state.tracks.find((track) => track.role === 'main' && isVisualTrack(track)) ??
    state.tracks.find((track) => track.kind === 'video') ??
    null
  )
}

export function getDefaultTrackIdForAsset(state: EditorProjectState, asset: MediaAsset): string {
  const kind = getMediaAssetKind(asset)
  if (kind === 'audio') {
    return state.tracks.find((track) => track.kind === 'audio')?.id ?? MAIN_AUDIO_TRACK_ID
  }

  return getMainVisualTrack(state)?.id ?? MAIN_VISUAL_TRACK_ID
}

export function createVisualTrack(id: string, name = '视觉层'): EditorTrack {
  return {
    id,
    name,
    kind: 'overlay',
    role: 'standard',
    locked: false,
    hidden: false,
    muted: false
  }
}

export function createAudioTrack(id: string, name = '声音'): EditorTrack {
  return {
    id,
    name,
    kind: 'audio',
    role: 'standard',
    locked: false,
    hidden: false,
    muted: false
  }
}

export function isDisposableTrack(track: EditorTrack): boolean {
  return (
    track.role !== 'main' &&
    track.id !== DEFAULT_OVERLAY_TRACK_ID &&
    track.id !== MAIN_AUDIO_TRACK_ID
  )
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
    trackId: clip.trackId ?? MAIN_VISUAL_TRACK_ID,
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
    volume: clampFinite(clip.volume ?? 1, 0, 1),
    muted: Boolean(clip.muted),
    speed,
    enabled: clip.enabled !== false
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
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    opacity: 1,
    volume: 1,
    muted: false,
    speed: 1,
    enabled: true
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

export function getResolvedClips(state: EditorProjectState): ResolvedTimelineClip[] {
  const assetsById = new Map(state.assets.map((asset) => [asset.id, asset]))
  return state.clips.map((clip) => resolveTimelineClip(clip, assetsById.get(clip.assetId) ?? null))
}

export function getTrackClips(state: EditorProjectState, trackId: string): ResolvedTimelineClip[] {
  return getResolvedClips(state).filter((clip) => clip.trackId === trackId)
}

export function trackHasClips(state: EditorProjectState, trackId: string): boolean {
  return state.clips.some((clip) => (clip.trackId ?? MAIN_VISUAL_TRACK_ID) === trackId)
}

export function clipsOverlap(
  leftStart: number,
  leftDuration: number,
  rightStart: number,
  rightDuration: number,
  epsilon = 0.0001
): boolean {
  const leftEnd = leftStart + leftDuration
  const rightEnd = rightStart + rightDuration
  return leftStart < rightEnd - epsilon && rightStart < leftEnd - epsilon
}

export function trackWouldCollide(
  state: EditorProjectState,
  trackId: string,
  timelineStart: number,
  duration: number,
  excludeClipIds: readonly string[] = []
): boolean {
  const excluded = new Set(excludeClipIds)
  return getTrackClips(state, trackId).some(
    (clip) =>
      !excluded.has(clip.id) &&
      clipsOverlap(timelineStart, duration, clip.timelineStart, clip.duration)
  )
}

export function selectCompositionAtTime(
  state: EditorProjectState,
  time: number
): TimelineComposition {
  const safeTime = Math.max(0, finiteOr(time, state.playhead))
  const videoByTrack = new Map<string, ResolvedTimelineClip>()
  const audioByTrack = new Map<string, ResolvedTimelineClip>()

  for (const rawClip of state.clips) {
    const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
    const resolved = resolveTimelineClip(rawClip, asset)
    const track = state.tracks.find((item) => item.id === resolved.trackId)
    if (!track || track.hidden || !resolved.enabled) continue
    if (
      safeTime < resolved.timelineStart ||
      safeTime >= resolved.timelineStart + resolved.duration
    ) {
      continue
    }

    if (track.kind === 'audio') {
      audioByTrack.set(track.id, resolved)
    } else if (isVisualTrackKind(track.kind)) {
      // 同一内部层如果暂时存在重叠，后出现的 Clip 优先，保证预览结果确定。
      videoByTrack.set(track.id, resolved)
    }
  }

  const trackOrder = new Map(state.tracks.map((track, index) => [track.id, index]))
  const sortBottomToTop = (left: ResolvedTimelineClip, right: ResolvedTimelineClip): number =>
    (trackOrder.get(left.trackId) ?? 0) - (trackOrder.get(right.trackId) ?? 0)

  return {
    time: safeTime,
    videoLayers: [...videoByTrack.values()].sort(sortBottomToTop).reverse(),
    audioLayers: [...audioByTrack.values()].sort(sortBottomToTop).reverse()
  }
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
  const asset = state.assets[assetIndex]
  const nextAsset = update(asset)
  if (nextAsset === asset) return state
  const assets = [...state.assets]
  assets[assetIndex] = nextAsset
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

export function canvasAspectRatiosEqual(
  left: CanvasAspectRatio,
  right: CanvasAspectRatio
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.width === right.width &&
    left.height === right.height
  )
}

export function editorProjectStatesEqual(
  left: EditorProjectState,
  right: EditorProjectState
): boolean {
  if (left === right) return true
  return (
    arrayItemsEqual(left.assets, right.assets, mediaAssetsEqual) &&
    arrayItemsEqual(left.tracks, right.tracks, editorTracksEqual) &&
    arrayItemsEqual(left.clips, right.clips, timelineClipsEqual) &&
    left.activeClipId === right.activeClipId &&
    numbersEqual(left.playhead, right.playhead) &&
    numbersEqual(left.timelineZoom, right.timelineZoom) &&
    canvasAspectRatiosEqual(left.aspectRatio, right.aspectRatio) &&
    arrayItemsEqual(left.draftRows, right.draftRows, draftRowsEqual)
  )
}

function arrayItemsEqual<T>(
  left: readonly T[],
  right: readonly T[],
  equal: (leftItem: T, rightItem: T) => boolean
): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((item, index) => equal(item, right[index])))
  )
}

function mediaAssetsEqual(left: MediaAsset, right: MediaAsset): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.name === right.name &&
      left.url === right.url &&
      nullableNumbersEqual(left.duration, right.duration) &&
      left.status === right.status &&
      left.kind === right.kind &&
      nullableNumbersEqual(left.width, right.width) &&
      nullableNumbersEqual(left.height, right.height) &&
      left.error === right.error)
  )
}

function editorTracksEqual(left: EditorTrack, right: EditorTrack): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.name === right.name &&
      left.kind === right.kind &&
      left.role === right.role &&
      left.locked === right.locked &&
      left.hidden === right.hidden &&
      left.muted === right.muted)
  )
}

function timelineClipsEqual(left: TimelineClip, right: TimelineClip): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.assetId === right.assetId &&
      left.trackId === right.trackId &&
      optionalNumbersEqual(left.timelineStart, right.timelineStart) &&
      optionalNumbersEqual(left.duration, right.duration) &&
      optionalNumbersEqual(left.sourceStart, right.sourceStart) &&
      optionalNumbersEqual(left.sourceEnd, right.sourceEnd) &&
      clipTransformsEqual(left.transform, right.transform) &&
      optionalNumbersEqual(left.opacity, right.opacity) &&
      optionalNumbersEqual(left.volume, right.volume) &&
      left.muted === right.muted &&
      optionalNumbersEqual(left.speed, right.speed) &&
      left.enabled === right.enabled)
  )
}

function clipTransformsEqual(
  left: ClipTransform | undefined,
  right: ClipTransform | undefined
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    numbersEqual(left.x, right.x) &&
    numbersEqual(left.y, right.y) &&
    numbersEqual(left.scaleX, right.scaleX) &&
    numbersEqual(left.scaleY, right.scaleY) &&
    numbersEqual(left.rotation, right.rotation)
  )
}

function draftRowsEqual(left: DraftRow, right: DraftRow): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      left.draftName === right.draftName &&
      left.fixedStartFileName === right.fixedStartFileName &&
      left.audio === right.audio &&
      left.fixedEndFileName === right.fixedEndFileName)
  )
}

function optionalNumbersEqual(left: number | undefined, right: number | undefined): boolean {
  return left === undefined || right === undefined ? left === right : numbersEqual(left, right)
}

function nullableNumbersEqual(
  left: number | null | undefined,
  right: number | null | undefined
): boolean {
  return left === null || left === undefined || right === null || right === undefined
    ? left === right
    : numbersEqual(left, right)
}

function numbersEqual(left: number, right: number): boolean {
  return left === right || (Number.isNaN(left) && Number.isNaN(right))
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
        const width = Number.isFinite(action.width) ? action.width : asset.width
        const height = Number.isFinite(action.height) ? action.height : asset.height
        if (
          asset.duration === action.duration &&
          asset.width === width &&
          asset.height === height &&
          asset.status === 'ready' &&
          asset.error === undefined
        ) {
          return asset
        }
        const readyAsset: MediaAsset = {
          ...asset,
          duration: action.duration,
          width,
          height,
          status: 'ready'
        }
        delete readyAsset.error
        return readyAsset
      })

    case 'asset/failed':
      return updateAsset(state, action.assetId, (asset) =>
        asset.status === 'error' && asset.error === action.error
          ? asset
          : { ...asset, status: 'error', error: action.error }
      )

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
      return state.activeClipId === action.clipId ? state : { ...state, activeClipId: action.clipId }

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
      if (canvasAspectRatiosEqual(state.aspectRatio, action.aspectRatio)) return state
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
      const row = state.draftRows[rowIndex]
      const nextRow = { ...row, ...changes }
      if (
        row.draftName === nextRow.draftName &&
        row.fixedStartFileName === nextRow.fixedStartFileName &&
        row.audio === nextRow.audio &&
        row.fixedEndFileName === nextRow.fixedEndFileName
      ) {
        return state
      }
      const draftRows = state.draftRows.map((item, index) =>
        index === rowIndex ? nextRow : item
      )
      return { ...state, draftRows }
    }

    case 'draft/rowDeleted':
      if (
        state.draftRows.length === 1 ||
        !state.draftRows.some((row) => row.id === action.rowId)
      ) {
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
