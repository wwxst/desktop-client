import {
  canMoveClipToTrack,
  normalizeSourceRange,
  type ClipAssetKind
} from './editorClipMath'
import {
  MIN_CLIP_DURATION,
  createTimelineClipFromAsset,
  getDefaultTrackIdForAsset,
  getMediaAssetKind,
  resolveTimelineClip,
  type CanvasAspectRatio,
  type ClipTransform,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset,
  type TimelineClip
} from './editorProject'

export interface ClipPatch {
  trackId?: string
  timelineStart?: number
  sourceStart?: number
  sourceEnd?: number
  transform?: Partial<ClipTransform>
  opacity?: number
  volume?: number
  muted?: boolean
  speed?: number
}

export type EditorCommand =
  | {
      type: 'clip/addAsset'
      assetId: string
      clipId: string
      trackId?: string
      timelineStart?: number
    }
  | { type: 'clip/delete'; clipId: string }
  | { type: 'clip/move'; clipId: string; timelineStart: number; trackId?: string }
  | {
      type: 'clip/trim'
      clipId: string
      sourceStart: number
      sourceEnd: number
      timelineStart?: number
    }
  | { type: 'clip/split'; clipId: string; at: number; rightClipId: string }
  | { type: 'clip/update'; clipId: string; patch: ClipPatch }
  | {
      type: 'clip/duplicate'
      clipId: string
      newClipId: string
      timelineStart?: number
      trackId?: string
    }
  | {
      type: 'track/update'
      trackId: string
      patch: Partial<Pick<EditorTrack, 'locked' | 'hidden' | 'muted' | 'name'>>
    }
  | { type: 'canvas/setAspectRatio'; aspectRatio: CanvasAspectRatio }

export type EditorExecutionCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'INVALID_RANGE'
  | 'TRACK_LOCKED'
  | 'INCOMPATIBLE_TRACK'
  | 'NO_CHANGE'

export interface EditorCommandResult {
  state: EditorProjectState
  success: boolean
  changed: boolean
  code: EditorExecutionCode
  command: EditorCommand
  message?: string
}

export interface EditorBatchCommandResult {
  state: EditorProjectState
  success: boolean
  changed: boolean
  code: EditorExecutionCode
  results: readonly EditorCommandResult[]
}

interface CommandFailure {
  code: Exclude<EditorExecutionCode, 'OK'>
  message: string
}

export function applyEditorCommand(
  state: EditorProjectState,
  command: EditorCommand
): EditorCommandResult {
  const failure = getCommandFailure(state, command)
  if (failure) {
    return {
      state,
      success: false,
      changed: false,
      code: failure.code,
      command,
      message: failure.message
    }
  }

  const nextState = reduceEditorCommand(state, command)
  const changed = nextState !== state
  return {
    state: nextState,
    success: changed,
    changed,
    code: changed ? 'OK' : 'NO_CHANGE',
    command,
    message: changed ? undefined : '命令没有改变工程状态'
  }
}

export function applyEditorCommands(
  state: EditorProjectState,
  commands: readonly EditorCommand[]
): EditorProjectState {
  return applyEditorCommandsWithResult(state, commands).state
}

export function applyEditorCommandsWithResult(
  state: EditorProjectState,
  commands: readonly EditorCommand[]
): EditorBatchCommandResult {
  let current = state
  const results: EditorCommandResult[] = []
  for (const command of commands) {
    const result = applyEditorCommand(current, command)
    results.push(result)
    current = result.state
  }

  const failedResult = results.find((result) => !result.success)
  return {
    state: current,
    success: results.length > 0 && !failedResult,
    changed: current !== state,
    code: failedResult?.code ?? (results.length > 0 ? 'OK' : 'NO_CHANGE'),
    results
  }
}

function getCommandFailure(
  state: EditorProjectState,
  command: EditorCommand
): CommandFailure | null {
  switch (command.type) {
    case 'clip/addAsset': {
      if (state.clips.some((clip) => clip.id === command.clipId)) {
        return failure('NO_CHANGE', 'Clip ID 已存在')
      }
      const asset = state.assets.find((item) => item.id === command.assetId)
      if (!asset || asset.status !== 'ready') return failure('NOT_FOUND', '素材不存在或尚未就绪')
      if (!hasPositiveDuration(asset.duration)) return failure('INVALID_RANGE', '素材时长无效')
      return getTargetTrackFailure(
        state,
        getAssetKind(asset),
        command.trackId ?? getDefaultTrackIdForAsset(state, asset)
      )
    }

    case 'clip/delete':
      return state.clips.some((clip) => clip.id === command.clipId)
        ? null
        : failure('NOT_FOUND', 'Clip 不存在')

    case 'clip/move': {
      const clip = state.clips.find((item) => item.id === command.clipId)
      if (!clip) return failure('NOT_FOUND', 'Clip 不存在')
      if (!Number.isFinite(command.timelineStart)) return failure('INVALID_RANGE', '时间线位置无效')
      const currentTrack = state.tracks.find((track) => track.id === clip.trackId)
      if (currentTrack?.locked) return failure('TRACK_LOCKED', '当前轨道已锁定')
      const asset = state.assets.find((item) => item.id === clip.assetId)
      return getTargetTrackFailure(state, getAssetKind(asset), command.trackId)
    }

    case 'clip/trim':
      return getClipEditFailure(state, command.clipId)

    case 'clip/split': {
      const clip = state.clips.find((item) => item.id === command.clipId)
      if (!clip) return failure('NOT_FOUND', 'Clip 不存在')
      if (state.clips.some((item) => item.id === command.rightClipId)) {
        return failure('NO_CHANGE', '目标 Clip ID 已存在')
      }
      const track = state.tracks.find((item) => item.id === clip.trackId)
      if (track?.locked) return failure('TRACK_LOCKED', '当前轨道已锁定')
      if (!Number.isFinite(command.at)) return failure('INVALID_RANGE', '分割位置无效')
      return null
    }

    case 'clip/update': {
      const clipFailure = getClipEditFailure(state, command.clipId)
      if (clipFailure) return clipFailure
      const clip = state.clips.find((item) => item.id === command.clipId)
      const currentAsset = state.assets.find((item) => item.id === clip?.assetId)
      return getTargetTrackFailure(state, getAssetKind(currentAsset), command.patch.trackId)
    }

    case 'clip/duplicate': {
      if (state.clips.some((clip) => clip.id === command.newClipId)) {
        return failure('NO_CHANGE', '目标 Clip ID 已存在')
      }
      const clip = state.clips.find((item) => item.id === command.clipId)
      if (!clip) return failure('NOT_FOUND', 'Clip 不存在')
      const currentTrack = state.tracks.find((track) => track.id === clip.trackId)
      if (currentTrack?.locked) return failure('TRACK_LOCKED', '当前轨道已锁定')
      const asset = state.assets.find((item) => item.id === clip.assetId)
      return getTargetTrackFailure(
        state,
        getAssetKind(asset),
        command.trackId ?? clip.trackId
      )
    }

    case 'track/update':
      return state.tracks.some((track) => track.id === command.trackId)
        ? null
        : failure('NOT_FOUND', '轨道不存在')

    case 'canvas/setAspectRatio':
      return isValidAspectRatio(command.aspectRatio)
        ? null
        : failure('INVALID_RANGE', '画布比例无效')
  }
}

function getClipEditFailure(state: EditorProjectState, clipId: string): CommandFailure | null {
  const clip = state.clips.find((item) => item.id === clipId)
  if (!clip) return failure('NOT_FOUND', 'Clip 不存在')
  const track = state.tracks.find((item) => item.id === clip.trackId)
  if (track?.locked) return failure('TRACK_LOCKED', '当前轨道已锁定')
  const asset = state.assets.find((item) => item.id === clip.assetId)
  if (!hasPositiveDuration(asset?.duration)) return failure('INVALID_RANGE', '素材时长无效')
  return null
}

function getTargetTrackFailure(
  state: EditorProjectState,
  assetKind: ClipAssetKind,
  trackId: string | undefined
): CommandFailure | null {
  if (!trackId) return null
  const target = state.tracks.find((track) => track.id === trackId)
  if (!target) return failure('NOT_FOUND', '目标轨道不存在')
  if (target.locked) return failure('TRACK_LOCKED', '目标轨道已锁定')
  if (!canMoveClipToTrack(assetKind, target.kind)) {
    return failure('INCOMPATIBLE_TRACK', '素材类型与目标轨道不兼容')
  }
  return null
}

function reduceEditorCommand(state: EditorProjectState, command: EditorCommand): EditorProjectState {
  switch (command.type) {
    case 'clip/addAsset': {
      const clip = createTimelineClipFromAsset(state, command.assetId, command.clipId, {
        trackId: command.trackId,
        timelineStart: command.timelineStart
      })
      if (!clip) return state
      return {
        ...state,
        clips: [...state.clips, clip],
        activeClipId: clip.id,
        playhead: clip.timelineStart
      }
    }

    case 'clip/delete': {
      const clips = state.clips.filter((clip) => clip.id !== command.clipId)
      const activeClipId =
        state.activeClipId === command.clipId ? (clips.at(-1)?.id ?? null) : state.activeClipId
      return { ...state, clips, activeClipId }
    }

    case 'clip/move':
      return updateClip(state, command.clipId, (clip) => ({
        ...clip,
        trackId: command.trackId ?? clip.trackId,
        timelineStart: Math.max(0, finiteOr(command.timelineStart, clip.timelineStart))
      }))

    case 'clip/trim':
      return updateClip(state, command.clipId, (clip, assetDuration) => {
        const sourceRange = normalizeSourceRange({
          sourceStart: command.sourceStart,
          sourceEnd: command.sourceEnd,
          assetDuration,
          minDuration: MIN_CLIP_DURATION
        })
        return {
          ...clip,
          sourceStart: sourceRange.sourceStart,
          sourceEnd: sourceRange.sourceEnd,
          duration: (sourceRange.sourceEnd - sourceRange.sourceStart) / clip.speed,
          timelineStart:
            command.timelineStart === undefined
              ? clip.timelineStart
              : Math.max(0, finiteOr(command.timelineStart, clip.timelineStart))
        }
      })

    case 'clip/split': {
      const originalIndex = state.clips.findIndex((clip) => clip.id === command.clipId)
      const rawClip = state.clips[originalIndex]
      const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
      const clip = resolveTimelineClip(rawClip, asset)
      const clipEnd = clip.timelineStart + clip.duration
      const at = command.at
      if (at <= clip.timelineStart + MIN_CLIP_DURATION || at >= clipEnd - MIN_CLIP_DURATION) {
        return state
      }

      const leftDuration = at - clip.timelineStart
      const rightDuration = clipEnd - at
      const splitSourceTime = clip.sourceStart + leftDuration * clip.speed
      if (splitSourceTime <= clip.sourceStart || splitSourceTime >= clip.sourceEnd) return state

      const leftClip: TimelineClip = {
        ...clip,
        duration: leftDuration,
        sourceEnd: splitSourceTime
      }
      const rightClip: TimelineClip = {
        ...clip,
        id: command.rightClipId,
        timelineStart: at,
        duration: rightDuration,
        sourceStart: splitSourceTime
      }

      const clips = [...state.clips]
      clips.splice(originalIndex, 1, leftClip, rightClip)
      return { ...state, clips, activeClipId: rightClip.id, playhead: at }
    }

    case 'clip/update':
      return updateClip(state, command.clipId, (clip, assetDuration) => {
        const speed = clamp(finiteOr(command.patch.speed, clip.speed), 0.1, 8)
        const sourceRange = normalizeSourceRange({
          sourceStart: command.patch.sourceStart ?? clip.sourceStart,
          sourceEnd: command.patch.sourceEnd ?? clip.sourceEnd,
          assetDuration,
          minDuration: MIN_CLIP_DURATION
        })
        const transformPatch = command.patch.transform
        return {
          ...clip,
          trackId: command.patch.trackId ?? clip.trackId,
          timelineStart: Math.max(0, finiteOr(command.patch.timelineStart, clip.timelineStart)),
          sourceStart: sourceRange.sourceStart,
          sourceEnd: sourceRange.sourceEnd,
          duration: (sourceRange.sourceEnd - sourceRange.sourceStart) / speed,
          speed,
          opacity: clamp(finiteOr(command.patch.opacity, clip.opacity), 0, 1),
          volume: clamp(finiteOr(command.patch.volume, clip.volume), 0, 2),
          muted: command.patch.muted ?? clip.muted,
          transform: {
            x: finiteOr(transformPatch?.x, clip.transform.x),
            y: finiteOr(transformPatch?.y, clip.transform.y),
            scaleX: clamp(finiteOr(transformPatch?.scaleX, clip.transform.scaleX), 0.01, 10),
            scaleY: clamp(finiteOr(transformPatch?.scaleY, clip.transform.scaleY), 0.01, 10),
            rotation: finiteOr(transformPatch?.rotation, clip.transform.rotation)
          }
        }
      })

    case 'clip/duplicate': {
      const rawClip = state.clips.find((clip) => clip.id === command.clipId)
      if (!rawClip) return state

      const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
      const clip = resolveTimelineClip(rawClip, asset)
      const targetTrackId = command.trackId ?? clip.trackId
      const duplicate: TimelineClip = {
        ...clip,
        id: command.newClipId,
        trackId: targetTrackId,
        timelineStart: Math.max(0, command.timelineStart ?? clip.timelineStart + clip.duration)
      }
      return {
        ...state,
        clips: [...state.clips, duplicate],
        activeClipId: duplicate.id,
        playhead: duplicate.timelineStart ?? 0
      }
    }

    case 'track/update': {
      const tracks = state.tracks.map((track) =>
        track.id === command.trackId ? { ...track, ...command.patch, id: track.id, kind: track.kind } : track
      )
      return { ...state, tracks }
    }

    case 'canvas/setAspectRatio':
      return { ...state, aspectRatio: command.aspectRatio }
  }
}

function updateClip(
  state: EditorProjectState,
  clipId: string,
  update: (clip: ReturnType<typeof resolveTimelineClip>, assetDuration: number) => TimelineClip
): EditorProjectState {
  const clipIndex = state.clips.findIndex((clip) => clip.id === clipId)
  if (clipIndex === -1) return state

  const rawClip = state.clips[clipIndex]
  const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
  const clip = resolveTimelineClip(rawClip, asset)
  const assetDuration = asset?.duration ?? clip.sourceEnd
  const nextClip = update(clip, assetDuration)

  if (shallowClipEqual(clip, nextClip)) return state
  const clips = state.clips.map((item, index) => (index === clipIndex ? nextClip : item))
  return { ...state, clips, activeClipId: clipId }
}

function shallowClipEqual(left: TimelineClip, right: TimelineClip): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isValidAspectRatio(aspectRatio: CanvasAspectRatio): boolean {
  return (
    Number.isFinite(aspectRatio.width) &&
    Number.isFinite(aspectRatio.height) &&
    aspectRatio.width > 0 &&
    aspectRatio.height > 0
  )
}

function hasPositiveDuration(duration: number | null | undefined): duration is number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
}

function getAssetKind(asset: MediaAsset | undefined): ClipAssetKind {
  return asset ? getMediaAssetKind(asset) : 'video'
}

function failure(code: Exclude<EditorExecutionCode, 'OK'>, message: string): CommandFailure {
  return { code, message }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
