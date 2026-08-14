import { describe, expect, it } from 'vitest'
import { editorHistoryReducer, createInitialEditorHistoryState } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorHistory'
import type { MediaAsset } from '../src/renderer/src/components/SmartEdit/VideoEditorWorkspace/editorProject'

function readyAsset(id = 'asset-a'): MediaAsset {
  return {
    id,
    name: `${id}.mp4`,
    url: `blob:${id}`,
    duration: 10,
    status: 'ready' as const,
    kind: 'video' as const,
    width: 1080,
    height: 1920
  }
}

describe('Editor V2 history external fact rebase', () => {
  it('starts with revision zero outside the project snapshot', () => {
    const state = createInitialEditorHistoryState('draft-1')

    expect(state.revision).toBe(0)
    expect(state.present).not.toHaveProperty('revision')
  })

  it('increments revision for successful command, batch, and transaction changes only', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset() }
    })
    expect(state.revision).toBe(1)

    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: 'asset-a', clipId: 'clip-a' }
    })
    expect(state.revision).toBe(2)

    state = editorHistoryReducer(state, {
      type: 'command/batch',
      commands: [{ type: 'clip/move', clipId: 'clip-a', timelineStart: 1 }]
    })
    expect(state.revision).toBe(3)

    state = editorHistoryReducer(state, {
      type: 'command/transaction',
      commands: [{ type: 'clip/update', clipId: 'clip-a', patch: { opacity: 0.5 } }]
    })
    expect(state.revision).toBe(4)

    const revision = state.revision
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/delete', clipId: 'missing' }
    })
    state = editorHistoryReducer(state, { type: 'command/batch', commands: [] })
    state = editorHistoryReducer(state, {
      type: 'command/transaction',
      commands: [{ type: 'clip/update', clipId: 'clip-a', patch: { opacity: 0.5 } }]
    })

    expect(state.revision).toBe(revision)
  })

  it('keeps revision monotonic across undo and redo without incrementing history clear', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset() }
    })
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: 'asset-a', clipId: 'clip-a' }
    })

    state = editorHistoryReducer(state, { type: 'history/undo' })
    expect(state.revision).toBe(3)
    state = editorHistoryReducer(state, { type: 'history/redo' })
    expect(state.revision).toBe(4)
    state = editorHistoryReducer(state, { type: 'history/clear' })
    expect(state.revision).toBe(4)

    const cleared = state
    state = editorHistoryReducer(state, { type: 'history/undo' })
    expect(state).toBe(cleared)
  })

  it('increments revision for project facts but not ephemeral UI changes or no-op actions', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'assets/imported',
        asset: { ...readyAsset(), duration: null, status: 'loading' }
      }
    })
    expect(state.revision).toBe(1)

    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 12, width: 1920, height: 1080 }
    })
    expect(state.revision).toBe(2)
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: 'asset-a', clipId: 'clip-a' }
    })
    expect(state.revision).toBe(3)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/failed', assetId: 'asset-a', error: 'decode failed' }
    })
    expect(state.revision).toBe(4)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'aspectRatio/selected',
        aspectRatio: { id: '16:9', label: '16:9', width: 16, height: 9 }
      }
    })
    expect(state.revision).toBe(5)

    const revision = state.revision
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'timeline/clipSelected', clipId: null }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'timeline/playheadChanged', time: 4 }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'timeline/zoomChanged', zoom: 150 }
    })
    expect(state.revision).toBe(revision)
    expect(state.present.activeClipId).toBeNull()
    expect(state.present.playhead).toBe(4)
    expect(state.present.timelineZoom).toBe(150)

    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset() }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'missing', duration: 1 }
    })
    expect(state.revision).toBe(revision)
  })

  it('does not increment revision for identical asset ready facts', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'assets/imported',
        asset: { ...readyAsset(), duration: null, status: 'loading' }
      }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 12, width: 1920, height: 1080 }
    })
    expect(state.revision).toBe(2)

    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 12, width: 1920, height: 1080 }
    })
    expect(state.revision).toBe(2)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 13, width: 1920, height: 1080 }
    })
    expect(state.revision).toBe(3)
  })

  it('does not increment revision for identical asset failure facts', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset() }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/failed', assetId: 'asset-a', error: 'decode failed' }
    })
    expect(state.revision).toBe(2)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/failed', assetId: 'asset-a', error: 'decode failed' }
    })
    expect(state.revision).toBe(2)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/failed', assetId: 'asset-a', error: 'different failure' }
    })
    expect(state.revision).toBe(3)
  })

  it('does not increment revision when selecting an identical aspect ratio', () => {
    let state = createInitialEditorHistoryState('draft-1')
    const currentAspectRatio = state.present.aspectRatio
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'aspectRatio/selected', aspectRatio: { ...currentAspectRatio } }
    })
    expect(state.revision).toBe(0)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'aspectRatio/selected',
        aspectRatio: { id: '16:9', label: '16:9', width: 16, height: 9 }
      }
    })
    expect(state.revision).toBe(1)
  })

  it('does not increment revision when a command sets an identical aspect ratio', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'canvas/setAspectRatio', aspectRatio: { ...state.present.aspectRatio } }
    })
    expect(state.revision).toBe(0)

    state = editorHistoryReducer(state, {
      type: 'command/transaction',
      commands: [
        { type: 'canvas/setAspectRatio', aspectRatio: { ...state.present.aspectRatio } }
      ]
    })
    expect(state.revision).toBe(0)

    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: {
        type: 'canvas/setAspectRatio',
        aspectRatio: { id: '16:9', label: '16:9', width: 16, height: 9 }
      }
    })
    expect(state.revision).toBe(1)
  })

  it('does not increment revision when commands write identical track values', () => {
    let state = createInitialEditorHistoryState('draft-1')
    const track = state.present.tracks[0]

    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'track/update', trackId: track.id, patch: { name: track.name } }
    })
    expect(state.revision).toBe(0)
    state = editorHistoryReducer(state, {
      type: 'command/batch',
      commands: [{ type: 'track/update', trackId: track.id, patch: { locked: track.locked } }]
    })
    expect(state.revision).toBe(0)
    state = editorHistoryReducer(state, {
      type: 'command/transaction',
      commands: [{ type: 'track/update', trackId: track.id, patch: { hidden: track.hidden } }]
    })
    expect(state.revision).toBe(0)

    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'track/update', trackId: track.id, patch: { locked: !track.locked } }
    })
    expect(state.revision).toBe(1)
  })

  it('does not increment revision when writing identical draft values', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'draft/rowUpdated', rowId: 'draft-1', changes: { draftName: '' } }
    })
    expect(state.revision).toBe(0)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'draft/rowUpdated', rowId: 'draft-1', changes: { draftName: 'Draft A' } }
    })
    expect(state.revision).toBe(1)
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'draft/rowUpdated', rowId: 'draft-1', changes: { draftName: 'Draft A' } }
    })
    expect(state.revision).toBe(1)
  })

  it('导入新素材不会清空已有剪辑 Undo', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset('asset-a') }
    })
    state = editorHistoryReducer(state, {
      type: 'command/execute',
      command: { type: 'clip/addAsset', assetId: 'asset-a', clipId: 'clip-a' }
    })
    expect(state.past.length).toBe(1)

    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'assets/imported', asset: readyAsset('asset-b') }
    })

    expect(state.past.length).toBe(1)
    state = editorHistoryReducer(state, { type: 'history/undo' })
    expect(state.present.clips).toHaveLength(0)
    expect(state.present.assets.map((asset) => asset.id)).toEqual(['asset-a', 'asset-b'])
    expect(state.revision).toBe(4)
  })

  it('媒体 ready 结果在 Undo 以后仍然保持 ready', () => {
    let state = createInitialEditorHistoryState('draft-1')
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: {
        type: 'assets/imported',
        asset: { ...readyAsset('asset-a'), duration: null, status: 'loading' }
      }
    })
    state = editorHistoryReducer(state, {
      type: 'project/action',
      action: { type: 'asset/ready', assetId: 'asset-a', duration: 12, width: 1920, height: 1080 }
    })
    expect(state.present.assets[0].width).toBe(1920)
    expect(state.present.assets[0].height).toBe(1080)
  })
})
