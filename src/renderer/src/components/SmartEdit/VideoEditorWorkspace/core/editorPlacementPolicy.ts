import { applyEditorTransactionWithResult, type EditorCommand } from '../editorCommands'
import {
  createAudioTrack,
  createVisualTrack,
  getDefaultTrackIdForAsset,
  getMediaAssetKind,
  isDisposableTrack,
  isVisualTrack,
  resolveTimelineClip,
  trackWouldCollide,
  type EditorProjectState,
  type EditorTrack,
  type MediaAsset
} from '../editorProject'

export interface EditorIdFactory {
  clip(): string
  visualTrack(): string
  audioTrack(): string
}

export interface PlacementPlan {
  commands: EditorCommand[]
  clipIds: string[]
  targetTrackIds: string[]
  changed: boolean
  reason?: string
}

export interface MoveRequest {
  clipId: string
  timelineStart: number
  trackId?: string
  forceNewLayer?: boolean
}

export interface PlacementPolicyOptions {
  magnetMainTrack?: boolean
}

export function createDefaultEditorIdFactory(): EditorIdFactory {
  return {
    clip: () => crypto.randomUUID(),
    visualTrack: () => `track-visual-${crypto.randomUUID()}`,
    audioTrack: () => `track-audio-${crypto.randomUUID()}`
  }
}

function createTrackForAsset(asset: MediaAsset, ids: EditorIdFactory): EditorTrack {
  return getMediaAssetKind(asset) === 'audio'
    ? createAudioTrack(ids.audioTrack())
    : createVisualTrack(ids.visualTrack())
}

function simulate(
  state: EditorProjectState,
  commands: readonly EditorCommand[]
): EditorProjectState | null {
  const result = applyEditorTransactionWithResult(state, commands)
  return result.success ? result.state : null
}

function appendDisposableTrackCleanup(
  original: EditorProjectState,
  commands: EditorCommand[],
  affectedTrackIds: readonly string[]
): EditorCommand[] {
  const next = simulate(original, commands)
  if (!next) return commands

  const cleanup: EditorCommand[] = []
  for (const trackId of new Set(affectedTrackIds.filter(Boolean))) {
    const track = next.tracks.find((candidate) => candidate.id === trackId)
    if (!track || !isDisposableTrack(track)) continue
    if (next.clips.some((clip) => clip.trackId === trackId)) continue
    cleanup.push({ type: 'track/delete', trackId })
  }
  return [...commands, ...cleanup]
}

function findTrack(
  state: EditorProjectState,
  asset: MediaAsset,
  timelineStart: number,
  duration: number,
  preferredTrackId: string | undefined,
  excludeClipIds: readonly string[],
  forceNewLayer: boolean,
  ids: EditorIdFactory
): { commands: EditorCommand[]; trackId: string } | null {
  const preferredId = preferredTrackId ?? getDefaultTrackIdForAsset(state, asset)
  const preferred = state.tracks.find((track) => track.id === preferredId)

  const compatible = (track: EditorTrack): boolean => {
    const kind = getMediaAssetKind(asset)
    return kind === 'audio' ? track.kind === 'audio' : isVisualTrack(track)
  }

  if (
    !forceNewLayer &&
    preferred &&
    compatible(preferred) &&
    !preferred.locked &&
    !trackWouldCollide(state, preferred.id, timelineStart, duration, excludeClipIds)
  ) {
    return { commands: [], trackId: preferred.id }
  }

  // 用户把内容放到一个已有兼容层，但那里撞车时，优先寻找其他空闲层。
  if (!forceNewLayer) {
    const reusable = state.tracks.find(
      (track) =>
        compatible(track) &&
        !track.locked &&
        !trackWouldCollide(state, track.id, timelineStart, duration, excludeClipIds)
    )
    if (reusable) return { commands: [], trackId: reusable.id }
  }

  const track = createTrackForAsset(asset, ids)
  return {
    commands: [
      {
        type: 'track/add',
        track,
        // 视觉层插到顶部。声音层放在现有声音区域后面。
        index: isVisualTrack(track) ? 0 : undefined
      }
    ],
    trackId: track.id
  }
}

export function planPlaceAsset(
  state: EditorProjectState,
  request: {
    assetId: string
    timelineStart: number
    trackId?: string
    forceNewLayer?: boolean
    clipId?: string
  },
  ids: EditorIdFactory = createDefaultEditorIdFactory()
): PlacementPlan {
  const asset = state.assets.find((candidate) => candidate.id === request.assetId)
  if (!asset || asset.status !== 'ready' || !asset.duration || asset.duration <= 0) {
    return { commands: [], clipIds: [], targetTrackIds: [], changed: false, reason: '素材未就绪' }
  }

  const start = Math.max(0, request.timelineStart)
  const placement = findTrack(
    state,
    asset,
    start,
    asset.duration,
    request.trackId,
    [],
    request.forceNewLayer === true,
    ids
  )
  if (!placement) {
    return {
      commands: [],
      clipIds: [],
      targetTrackIds: [],
      changed: false,
      reason: '没有可用内容层'
    }
  }

  const clipId = request.clipId ?? ids.clip()
  return {
    commands: [
      ...placement.commands,
      {
        type: 'clip/addAsset',
        assetId: asset.id,
        clipId,
        trackId: placement.trackId,
        timelineStart: start
      }
    ],
    clipIds: [clipId],
    targetTrackIds: [placement.trackId],
    changed: true
  }
}

export function planMoveClips(
  state: EditorProjectState,
  moves: readonly MoveRequest[],
  ids: EditorIdFactory = createDefaultEditorIdFactory()
): PlacementPlan {
  if (moves.length === 0) return { commands: [], clipIds: [], targetTrackIds: [], changed: false }

  let simulated = state
  const commands: EditorCommand[] = []
  const targetTrackIds: string[] = []
  const oldTrackIds: string[] = []
  const movingIds = moves.map((move) => move.clipId)

  // 同层多选移动时，为避免低层 Command 在中间状态误判与“尚未搬走”的组选中 Clip 冲突，
  // 向右移动从最右侧开始，向左移动从最左侧开始。
  const orderedMoves = [...moves].sort((left, right) => {
    const leftRaw = state.clips.find((clip) => clip.id === left.clipId)
    const rightRaw = state.clips.find((clip) => clip.id === right.clipId)
    const leftAsset = leftRaw
      ? (state.assets.find((asset) => asset.id === leftRaw.assetId) ?? null)
      : null
    const rightAsset = rightRaw
      ? (state.assets.find((asset) => asset.id === rightRaw.assetId) ?? null)
      : null
    const leftClip = leftRaw ? resolveTimelineClip(leftRaw, leftAsset) : null
    const rightClip = rightRaw ? resolveTimelineClip(rightRaw, rightAsset) : null
    if (!leftClip || !rightClip) return 0
    const leftDelta = left.timelineStart - leftClip.timelineStart
    const rightDelta = right.timelineStart - rightClip.timelineStart
    const averageDelta = (leftDelta + rightDelta) / 2
    return averageDelta >= 0
      ? rightClip.timelineStart - leftClip.timelineStart
      : leftClip.timelineStart - rightClip.timelineStart
  })

  for (const move of orderedMoves) {
    const raw = simulated.clips.find((candidate) => candidate.id === move.clipId)
    if (!raw) continue
    const asset = simulated.assets.find((candidate) => candidate.id === raw.assetId)
    if (!asset || asset.status !== 'ready') continue
    const resolved = resolveTimelineClip(raw, asset)
    oldTrackIds.push(resolved.trackId)

    const placement = findTrack(
      simulated,
      asset,
      Math.max(0, move.timelineStart),
      resolved.duration,
      move.trackId ?? resolved.trackId,
      movingIds,
      move.forceNewLayer === true,
      ids
    )
    if (!placement) continue

    const step: EditorCommand[] = [
      ...placement.commands,
      {
        type: 'clip/move',
        clipId: move.clipId,
        timelineStart: Math.max(0, move.timelineStart),
        trackId: placement.trackId
      }
    ]
    const next = simulate(simulated, step)
    if (!next) continue
    commands.push(...step)
    targetTrackIds.push(placement.trackId)
    simulated = next
  }

  const withCleanup = appendDisposableTrackCleanup(state, commands, oldTrackIds)
  return {
    commands: withCleanup,
    clipIds: moves.map((move) => move.clipId),
    targetTrackIds,
    changed: withCleanup.length > 0
  }
}

export function planDeleteClips(
  state: EditorProjectState,
  clipIds: readonly string[],
  options: PlacementPolicyOptions = {}
): PlacementPlan {
  const ids = new Set(clipIds)
  if (ids.size === 0) return { commands: [], clipIds: [], targetTrackIds: [], changed: false }

  const deleted = state.clips
    .filter((clip) => ids.has(clip.id))
    .map((clip) => {
      const asset = state.assets.find((candidate) => candidate.id === clip.assetId) ?? null
      return resolveTimelineClip(clip, asset)
    })

  const commands: EditorCommand[] = deleted.map((clip) => ({
    type: 'clip/delete',
    clipId: clip.id
  }))
  const oldTrackIds = deleted.map((clip) => clip.trackId)

  if (options.magnetMainTrack) {
    const mainTrack = state.tracks.find((track) => track.role === 'main' && isVisualTrack(track))
    if (mainTrack) {
      const removedOnMain = deleted
        .filter((clip) => clip.trackId === mainTrack.id)
        .sort((a, b) => a.timelineStart - b.timelineStart)

      const survivingMain = state.clips
        .filter((raw) => !ids.has(raw.id))
        .map((raw) => {
          const asset = state.assets.find((candidate) => candidate.id === raw.assetId) ?? null
          return resolveTimelineClip(raw, asset)
        })
        .filter((clip) => clip.trackId === mainTrack.id)
        .sort((a, b) => a.timelineStart - b.timelineStart)

      for (const clip of survivingMain) {
        const shift = removedOnMain
          .filter((removed) => removed.timelineStart < clip.timelineStart)
          .reduce((sum, removed) => sum + removed.duration, 0)
        if (shift <= 0) continue
        commands.push({
          type: 'clip/move',
          clipId: clip.id,
          timelineStart: Math.max(0, clip.timelineStart - shift),
          trackId: mainTrack.id
        })
      }
    }
  }

  const withCleanup = appendDisposableTrackCleanup(state, commands, oldTrackIds)
  return {
    commands: withCleanup,
    clipIds: [...ids],
    targetTrackIds: [],
    changed: withCleanup.length > 0
  }
}
