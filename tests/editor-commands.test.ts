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
})
