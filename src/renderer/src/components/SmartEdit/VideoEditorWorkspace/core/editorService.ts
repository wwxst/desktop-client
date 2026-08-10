import type { EditorClipboardSnapshot } from '../editorClipboard'
import {
  applyEditorTransactionWithResult,
  type ClipPatch,
  type EditorBatchCommandResult,
  type EditorCommand
} from '../editorCommands'
import {
  createAudioTrack,
  createVisualTrack,
  getMediaAssetKind,
  isVisualTrack,
  resolveTimelineClip,
  trackWouldCollide,
  type EditorProjectState
} from '../editorProject'
import {
  createDefaultEditorIdFactory,
  planDeleteClips,
  planMoveClips,
  planPlaceAsset,
  type EditorIdFactory,
  type MoveRequest
} from './editorPlacementPolicy'

export interface EditorServiceRuntime {
  getProject(): EditorProjectState
  executeTransaction(commands: readonly EditorCommand[], label?: string): EditorBatchCommandResult
}

export interface EditorService {
  placeAsset(input: {
    assetId: string
    timelineStart: number
    trackId?: string
    forceNewLayer?: boolean
  }): EditorBatchCommandResult
  placeAssetsSequential(input: {
    assetIds: readonly string[]
    timelineStart: number
    trackId?: string
    forceNewLayer?: boolean
  }): EditorBatchCommandResult
  moveClips(moves: readonly MoveRequest[]): EditorBatchCommandResult
  deleteClips(clipIds: readonly string[], options?: { magnetMainTrack?: boolean }): EditorBatchCommandResult
  updateClip(clipId: string, patch: ClipPatch, label?: string): EditorBatchCommandResult
  splitClip(clipId: string, at: number): EditorBatchCommandResult
  paste(snapshot: EditorClipboardSnapshot, at: number): { result: EditorBatchCommandResult; newIds: string[] }
}

export function createEditorService(
  runtime: EditorServiceRuntime,
  ids: EditorIdFactory = createDefaultEditorIdFactory()
): EditorService {
  return {
    placeAsset(input) {
      const plan = planPlaceAsset(runtime.getProject(), input, ids)
      return runtime.executeTransaction(plan.commands, input.forceNewLayer ? '素材拖入新视觉层' : '放置素材')
    },

    placeAssetsSequential(input) {
      let simulated = runtime.getProject()
      const commands: EditorCommand[] = []
      let start = Math.max(0, input.timelineStart)
      let preferredTrackId = input.trackId
      for (let index = 0; index < input.assetIds.length; index += 1) {
        const assetId = input.assetIds[index]
        const asset = simulated.assets.find((candidate) => candidate.id === assetId)
        if (!asset || asset.status !== 'ready' || !asset.duration || asset.duration <= 0) continue
        const plan = planPlaceAsset(
          simulated,
          {
            assetId,
            timelineStart: start,
            trackId: preferredTrackId,
            forceNewLayer: input.forceNewLayer === true && index === 0
          },
          ids
        )
        if (!plan.changed) continue
        const next = applyEditorTransactionWithResult(simulated, plan.commands)
        if (!next.success) continue
        commands.push(...plan.commands)
        simulated = next.state
        preferredTrackId = plan.targetTrackIds[0] ?? preferredTrackId
        start += asset.duration
      }
      return runtime.executeTransaction(commands, '批量放置素材')
    },

    moveClips(moves) {
      const plan = planMoveClips(runtime.getProject(), moves, ids)
      return runtime.executeTransaction(plan.commands, moves.length > 1 ? '移动多个片段' : '移动片段')
    },

    deleteClips(clipIds, options) {
      const plan = planDeleteClips(runtime.getProject(), clipIds, options)
      return runtime.executeTransaction(plan.commands, options?.magnetMainTrack ? '磁吸删除片段' : '删除片段')
    },

    updateClip(clipId, patch, label = '更新片段') {
      return runtime.executeTransaction([{ type: 'clip/update', clipId, patch }], label)
    },

    splitClip(clipId, at) {
      return runtime.executeTransaction(
        [{ type: 'clip/split', clipId, at, rightClipId: ids.clip() }],
        '分割片段'
      )
    },

    paste(snapshot, at) {
      const state = runtime.getProject()
      const commands: EditorCommand[] = []
      const newIds: string[] = []
      const redirectedTracks = new Map<string, string>()
      let simulated = state

      for (const item of snapshot.items) {
        const asset = simulated.assets.find((candidate) => candidate.id === item.clip.assetId)
        if (!asset || asset.status !== 'ready') continue
        const sourceTrackId = item.clip.trackId ?? ''
        let targetTrackId = redirectedTracks.get(sourceTrackId) ?? sourceTrackId
        let targetTrack = simulated.tracks.find((track) => track.id === targetTrackId)
        const start = Math.max(0, at + item.relativeStart)
        const duration = resolveTimelineClip(item.clip, asset).duration

        if (!targetTrack) {
          targetTrack = getMediaAssetKind(asset) === 'audio'
            ? createAudioTrack(ids.audioTrack())
            : createVisualTrack(ids.visualTrack())
          targetTrackId = targetTrack.id
          const addTrack: EditorCommand = {
            type: 'track/add',
            track: targetTrack,
            index: isVisualTrack(targetTrack) ? 0 : undefined
          }
          commands.push(addTrack)
          const next = applyEditorTransactionWithResult(simulated, [addTrack])
          if (!next.success) continue
          simulated = next.state
        }

        if (trackWouldCollide(simulated, targetTrackId, start, duration)) {
          const freshTrack = getMediaAssetKind(asset) === 'audio'
            ? createAudioTrack(ids.audioTrack())
            : createVisualTrack(ids.visualTrack())
          targetTrackId = freshTrack.id
          redirectedTracks.set(sourceTrackId, targetTrackId)
          const addTrack: EditorCommand = {
            type: 'track/add',
            track: freshTrack,
            index: isVisualTrack(freshTrack) ? 0 : undefined
          }
          commands.push(addTrack)
          const next = applyEditorTransactionWithResult(simulated, [addTrack])
          if (!next.success) continue
          simulated = next.state
        }

        const newId = ids.clip()
        const addClip: EditorCommand = {
          type: 'clip/add',
          clip: {
            ...item.clip,
            id: newId,
            trackId: targetTrackId,
            timelineStart: start,
            transform: item.clip.transform ? { ...item.clip.transform } : undefined
          }
        }
        commands.push(addClip)
        newIds.push(newId)
        const next = applyEditorTransactionWithResult(simulated, [addClip])
        if (!next.success) continue
        simulated = next.state
      }

      return {
        result: runtime.executeTransaction(commands, '粘贴片段'),
        newIds
      }
    }
  }
}
