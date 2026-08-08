import {
  MIN_CLIP_DURATION,
  createTimelineClipFromAsset,
  resolveTimelineClip,
  type CanvasAspectRatio,
  type ClipTransform,
  type EditorProjectState,
  type EditorTrack,
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

export interface EditorCommandResult {
  state: EditorProjectState
  changed: boolean
  command: EditorCommand
}

export function applyEditorCommand(
  state: EditorProjectState,
  command: EditorCommand
): EditorCommandResult {
  const nextState = reduceEditorCommand(state, command)
  return { state: nextState, changed: nextState !== state, command }
}

export function applyEditorCommands(
  state: EditorProjectState,
  commands: readonly EditorCommand[]
): EditorProjectState {
  return commands.reduce((current, command) => reduceEditorCommand(current, command), state)
}

function reduceEditorCommand(state: EditorProjectState, command: EditorCommand): EditorProjectState {
  switch (command.type) {
    case 'clip/addAsset': {
      if (state.clips.some((clip) => clip.id === command.clipId)) return state
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
      if (!state.clips.some((clip) => clip.id === command.clipId)) return state
      const clips = state.clips.filter((clip) => clip.id !== command.clipId)
      const activeClipId =
        state.activeClipId === command.clipId ? (clips.at(-1)?.id ?? null) : state.activeClipId
      return { ...state, clips, activeClipId }
    }

    case 'clip/move':
      return updateClip(state, command.clipId, (clip) => {
        const track = command.trackId
          ? state.tracks.find((item) => item.id === command.trackId)
          : undefined
        if (command.trackId && (!track || track.locked)) return clip

        const currentTrack = state.tracks.find((item) => item.id === clip.trackId)
        if (currentTrack?.locked) return clip

        return {
          ...clip,
          trackId: command.trackId ?? clip.trackId,
          timelineStart: Math.max(0, finiteOr(command.timelineStart, clip.timelineStart))
        }
      })

    case 'clip/trim':
      return updateClip(state, command.clipId, (clip, assetDuration) => {
        const track = state.tracks.find((item) => item.id === clip.trackId)
        if (track?.locked) return clip

        const sourceStart = clamp(finiteOr(command.sourceStart, clip.sourceStart), 0, assetDuration)
        const sourceEnd = clamp(
          finiteOr(command.sourceEnd, clip.sourceEnd),
          sourceStart + MIN_CLIP_DURATION,
          Math.max(sourceStart + MIN_CLIP_DURATION, assetDuration)
        )
        if (sourceEnd - sourceStart < MIN_CLIP_DURATION) return clip

        const duration = Math.max(MIN_CLIP_DURATION, (sourceEnd - sourceStart) / clip.speed)
        return {
          ...clip,
          sourceStart,
          sourceEnd,
          duration,
          timelineStart:
            command.timelineStart === undefined
              ? clip.timelineStart
              : Math.max(0, finiteOr(command.timelineStart, clip.timelineStart))
        }
      })

    case 'clip/split': {
      const originalIndex = state.clips.findIndex((clip) => clip.id === command.clipId)
      if (originalIndex === -1 || state.clips.some((clip) => clip.id === command.rightClipId)) {
        return state
      }

      const rawClip = state.clips[originalIndex]
      const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
      const clip = resolveTimelineClip(rawClip, asset)
      const track = state.tracks.find((item) => item.id === clip.trackId)
      if (track?.locked) return state

      const clipEnd = clip.timelineStart + clip.duration
      const at = finiteOr(command.at, clip.timelineStart)
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
        const track = state.tracks.find((item) => item.id === clip.trackId)
        if (track?.locked) return clip

        const nextTrack = command.patch.trackId
          ? state.tracks.find((item) => item.id === command.patch.trackId)
          : undefined
        if (command.patch.trackId && (!nextTrack || nextTrack.locked)) return clip

        const speed = clamp(finiteOr(command.patch.speed, clip.speed), 0.1, 8)
        const sourceStart = clamp(
          finiteOr(command.patch.sourceStart, clip.sourceStart),
          0,
          assetDuration
        )
        const sourceEnd = clamp(
          finiteOr(command.patch.sourceEnd, clip.sourceEnd),
          sourceStart + MIN_CLIP_DURATION,
          Math.max(sourceStart + MIN_CLIP_DURATION, assetDuration)
        )

        const transformPatch = command.patch.transform
        return {
          ...clip,
          trackId: command.patch.trackId ?? clip.trackId,
          timelineStart: Math.max(
            0,
            finiteOr(command.patch.timelineStart, clip.timelineStart)
          ),
          sourceStart,
          sourceEnd,
          duration: Math.max(MIN_CLIP_DURATION, (sourceEnd - sourceStart) / speed),
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
      if (state.clips.some((clip) => clip.id === command.newClipId)) return state
      const rawClip = state.clips.find((clip) => clip.id === command.clipId)
      if (!rawClip) return state

      const asset = state.assets.find((item) => item.id === rawClip.assetId) ?? null
      const clip = resolveTimelineClip(rawClip, asset)
      const targetTrackId = command.trackId ?? clip.trackId
      const track = state.tracks.find((item) => item.id === targetTrackId)
      if (!track || track.locked) return state

      const duplicate: TimelineClip = {
        ...clip,
        id: command.newClipId,
        trackId: targetTrackId,
        timelineStart: Math.max(
          0,
          command.timelineStart ?? clip.timelineStart + clip.duration
        )
      }
      return {
        ...state,
        clips: [...state.clips, duplicate],
        activeClipId: duplicate.id,
        playhead: duplicate.timelineStart ?? 0
      }
    }

    case 'track/update': {
      const trackIndex = state.tracks.findIndex((track) => track.id === command.trackId)
      if (trackIndex === -1) return state
      const tracks = state.tracks.map((track, index) =>
        index === trackIndex ? { ...track, ...command.patch, id: track.id, kind: track.kind } : track
      )
      return { ...state, tracks }
    }

    case 'canvas/setAspectRatio':
      if (
        !Number.isFinite(command.aspectRatio.width) ||
        !Number.isFinite(command.aspectRatio.height) ||
        command.aspectRatio.width <= 0 ||
        command.aspectRatio.height <= 0
      ) {
        return state
      }
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
  const assetDuration = Math.max(clip.sourceEnd, asset?.duration ?? clip.sourceEnd)
  const nextClip = update(clip, assetDuration)

  if (shallowClipEqual(clip, nextClip)) return state
  const clips = state.clips.map((item, index) => (index === clipIndex ? nextClip : item))
  return { ...state, clips, activeClipId: clipId }
}

function shallowClipEqual(left: TimelineClip, right: TimelineClip): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
