import { describe, expect, it } from 'vitest'
import { applyEditorCommand } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorCommands'
import {
  createInitialEditorProjectState,
  editorProjectReducer,
  resolveTimelineClip,
  type EditorProjectState,
  type MediaAsset
} from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

const asset: MediaAsset = {
  id: 'asset-1',
  name: 'demo.mp4',
  url: 'blob:demo',
  duration: 20,
  status: 'ready'
}

function createReadyProject(): EditorProjectState {
  return editorProjectReducer(createInitialEditorProjectState('row-1'), {
    type: 'assets/imported',
    asset
  })
}

describe('editor commands', () => {
  it('adds, moves and updates a clip through commands', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    state = applyEditorCommand(state, {
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 4.5
    }).state

    state = applyEditorCommand(state, {
      type: 'clip/update',
      clipId: 'clip-1',
      patch: { speed: 2, transform: { scaleX: 1.25, scaleY: 1.25 } }
    }).state

    const clip = resolveTimelineClip(state.clips[0], asset)
    expect(clip.timelineStart).toBe(4.5)
    expect(clip.duration).toBe(10)
    expect(clip.transform.scaleX).toBe(1.25)
  })

  it('allows the same asset to create multiple clip instances', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const second = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-2'
    })

    expect(second.changed).toBe(true)
    expect(second.success).toBe(true)
    expect(second.code).toBe('OK')
    expect(second.state.clips).toHaveLength(2)
    expect(second.state.clips.map((clip) => clip.assetId)).toEqual([asset.id, asset.id])
    expect(second.state.clips[0].id).not.toBe(second.state.clips[1].id)
  })

  it('rejects duplicate clip ids with a no-change result', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const duplicate = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    })

    expect(duplicate.state).toBe(state)
    expect(duplicate.changed).toBe(false)
    expect(duplicate.success).toBe(false)
    expect(duplicate.code).toBe('NO_CHANGE')
  })

  it('keeps trim and update source ranges inside the asset duration', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const trimmed = applyEditorCommand(state, {
      type: 'clip/trim',
      clipId: 'clip-1',
      sourceStart: asset.duration,
      sourceEnd: asset.duration + 10
    })
    expect(trimmed.success).toBe(true)
    expect(trimmed.state.clips[0].sourceStart).toBeLessThan(asset.duration)
    expect(trimmed.state.clips[0].sourceEnd).toBe(asset.duration)
    expect(trimmed.state.clips[0].duration).toBeCloseTo(0.05)

    const updated = applyEditorCommand(trimmed.state, {
      type: 'clip/update',
      clipId: 'clip-1',
      patch: { sourceStart: 4, sourceEnd: 14, speed: 2 }
    })
    expect(updated.success).toBe(true)
    expect(updated.state.clips[0].sourceStart).toBe(4)
    expect(updated.state.clips[0].sourceEnd).toBe(14)
    expect(updated.state.clips[0].duration).toBe(5)
  })

  it('rejects incompatible or locked track moves with explicit result codes', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const toOverlay = applyEditorCommand(state, {
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 2,
      trackId: 'track-video-overlay'
    })
    expect(toOverlay.success).toBe(true)
    expect(toOverlay.state.clips[0].trackId).toBe('track-video-overlay')

    const toAudio = applyEditorCommand(toOverlay.state, {
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 3,
      trackId: 'track-audio-main'
    })
    expect(toAudio.state).toBe(toOverlay.state)
    expect(toAudio.success).toBe(false)
    expect(toAudio.code).toBe('INCOMPATIBLE_TRACK')

    const locked = applyEditorCommand(toOverlay.state, {
      type: 'track/update',
      trackId: 'track-video-overlay',
      patch: { locked: true }
    }).state
    const sourceLocked = applyEditorCommand(locked, {
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 4
    })
    expect(sourceLocked.state).toBe(locked)
    expect(sourceLocked.success).toBe(false)
    expect(sourceLocked.code).toBe('TRACK_LOCKED')

    const targetLocked = applyEditorCommand(toOverlay.state, {
      type: 'track/update',
      trackId: 'track-video-main',
      patch: { locked: true }
    }).state
    const targetMove = applyEditorCommand(targetLocked, {
      type: 'clip/move',
      clipId: 'clip-1',
      timelineStart: 4,
      trackId: 'track-video-main'
    })
    expect(targetMove.state).toBe(targetLocked)
    expect(targetMove.success).toBe(false)
    expect(targetMove.code).toBe('TRACK_LOCKED')
  })

  it('splits a clip without losing source continuity', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state
    state = applyEditorCommand(state, {
      type: 'clip/split',
      clipId: 'clip-1',
      at: 8,
      rightClipId: 'clip-2'
    }).state

    expect(state.clips).toHaveLength(2)
    const left = resolveTimelineClip(state.clips[0], asset)
    const right = resolveTimelineClip(state.clips[1], asset)
    expect(left.sourceEnd).toBe(right.sourceStart)
    expect(left.duration).toBe(8)
    expect(right.timelineStart).toBe(8)
    expect(right.duration).toBe(12)
  })

  it('reports an invalid range when splitting at a clip boundary', () => {
    let state = createReadyProject()
    state = applyEditorCommand(state, {
      type: 'clip/addAsset',
      assetId: asset.id,
      clipId: 'clip-1'
    }).state

    const result = applyEditorCommand(state, {
      type: 'clip/split',
      clipId: 'clip-1',
      at: 0.01,
      rightClipId: 'clip-2'
    })

    expect(result.state).toBe(state)
    expect(result.success).toBe(false)
    expect(result.code).toBe('INVALID_RANGE')
  })
})
